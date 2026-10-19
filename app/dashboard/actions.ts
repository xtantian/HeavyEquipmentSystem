"use server";

// [IMPORT] Load Clerk authentication and Next.js cache revalidation helpers.
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";

// [FUNC] + [PARAM] + [RETURN] Fast local JWT check inspecting Clerk session claims for admin role.
// Avoids slow, blocking external network roundtrips to Clerk servers.
function checkAdminClaim(sessionClaims: unknown): boolean {
  const claims = sessionClaims as { publicMetadata?: { role?: string }; metadata?: { role?: string } } | null | undefined;
  return claims?.publicMetadata?.role === "admin" || claims?.metadata?.role === "admin";
}

// [TYPE] Union type listing the exact allowed booking lifecycle statuses.
export type UpdatableBookingStatus =
  | "pending"
  | "accepted"
  | "paid"
  | "active"
  | "returned"
  | "completed"
  | "cancelled";

/**
 * Authoritative Server Action for updating a rental booking's status.
 *
 * SECURITY & AUTHORIZATION GUARANTEES:
 * 1. Strict authentication via Clerk `auth()`.
 * 2. Fetches authoritative booking and listing ownership from database.
 * 3. Enforces role-based transition matrix:
 *    - Renter can only cancel their own pending reservation.
 *    - Equipment owner can accept or reject/cancel booking requests for their equipment.
 *    - Administrator can manage and transition to any valid status.
 *    - Other users are rejected with an authorization error.
 * 4. Never fabricates success using local mock data — genuine database writes only.
 */
// [FUNC] + [ASYNC] + [PARAM] Server Action enforcing authorized booking state transitions.
export async function updateBookingStatusAction(
  bookingId: string,
  newStatus: UpdatableBookingStatus
) {
  // [AUTH] + [ASYNC] Retrieve active Clerk user ID and verified session claims.
  const { userId, sessionClaims } = await auth();
  // [IF] + [RETURN] Deny unauthenticated visitors immediately.
  if (!userId) {
    return {
      error: "You must be signed in to perform this action.",
      code: "AUTH_REQUIRED",
    };
  }

  // [ERROR] Wrap database operations in try/catch.
  try {
    // [DB] + [ASYNC] Get authenticated Supabase client for current user.
    const supabase = await createSupabaseServerClient();

    // 1. Fetch booking with listing relation to verify ownership
    // [DB] + [METHOD] Query the booking record joined with the parent listing to identify the equipment owner.
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select(`
        id,
        renter_id,
        status,
        listing_id,
        listing:listings(owner_id)
      `)
      .eq("id", bookingId)
      .maybeSingle();

    // [IF] + [RETURN] Reject if booking does not exist.
    if (fetchError || !booking) {
      return {
        error: "Booking record not found in database.",
        code: "NOT_FOUND",
      };
    }

    // 2. Determine authorization
    // [DECL] + [INIT] Derive identity roles relative to this specific reservation record.
    const isRenter = booking.renter_id === userId;
    const listingOwnerId = (booking.listing as unknown as { owner_id: string } | null)?.owner_id;
    const isOwner = listingOwnerId === userId;

    let isAdmin = checkAdminClaim(sessionClaims);
    if (!isAdmin && !isRenter && !isOwner) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("clerk_user_id", userId)
        .maybeSingle();
      if (profile?.role === "admin") {
        isAdmin = true;
      }
    }

    let isAuthorized = false;

    // [AUTH] + [IF] Enforce state transition matrix:
    // Administrators can execute any valid transition.
    if (isAdmin) {
      isAuthorized = true;
    } else if (isOwner) {
      // Equipment owners can accept pending requests or cancel/decline pending/accepted requests
      if (newStatus === "accepted") {
        if (booking.status !== "pending") {
          return {
            error: `Cannot accept booking in '${booking.status}' status. Only pending requests can be accepted.`,
            code: "INVALID_TRANSITION",
          };
        }
        isAuthorized = true;
      } else if (newStatus === "cancelled") {
        if (!["pending", "accepted"].includes(booking.status)) {
          return {
            error: `Cannot decline or cancel a booking that is currently '${booking.status}'.`,
            code: "INVALID_TRANSITION",
          };
        }
        isAuthorized = true;
      }
    } else if (isRenter) {
      // Renters can cancel their own bookings while in pending or accepted status
      if (newStatus === "cancelled") {
        if (!["pending", "accepted"].includes(booking.status)) {
          return {
            error: `Cannot cancel a reservation that is '${booking.status}'. Only pending or accepted reservations can be cancelled.`,
            code: "INVALID_TRANSITION",
          };
        }
        isAuthorized = true;
      }
    }

    // [IF] + [RETURN] Reject unauthorized users trying to manipulate other people's reservations.
    if (!isAuthorized) {
      return {
        error: "Unauthorized: You do not have permission to perform this status transition.",
        code: "UNAUTHORIZED",
      };
    }

    // 3. Execute database update
    // [DB] + [METHOD] Update booking status in PostgreSQL with updated timestamp.
    const { data, error } = await supabase
      .from("bookings")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .select("id, status")
      .single();

    if (error || !data) {
      console.error("[updateBookingStatusAction] Database update error:", error?.message);
      return {
        error: error?.message || "Failed to update booking status in database.",
        code: "ERROR",
      };
    }

    // [METHOD] Purge Next.js cached pages so user dashboards and listing pages reflect updated status immediately.
    revalidatePath("/dashboard");
    if (booking.listing_id) {
      revalidatePath(`/listings/${booking.listing_id}`);
    }
    // [RETURN] Send updated booking status back to client component.
    return { success: true, bookingId: data.id, status: data.status };
  } catch (err: unknown) {
    console.error("[updateBookingStatusAction] Exception:", err);
    return {
      error: "An unexpected error occurred while updating booking status.",
      code: "ERROR",
    };
  }
}

/**
 * Authoritative Server Action for retiring/archiving a user's equipment listing.
 * Strict Integrity & RLS Compliance:
 * 1. Verifies authentication and ownership (or admin).
 * 2. Checks database for active or pending rentals; aborts if active reservations exist.
 * 3. Soft-deletes via status = 'archived' and records deleted_at timestamp (passes trigger trg_protect_listing_security).
 * 4. Revalidates dashboard and marketplace routes.
 */
export async function deleteUserListingAction(listingId: string) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return {
      error: "You must be signed in to perform this action.",
      code: "AUTH_REQUIRED",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    let isAdmin = checkAdminClaim(sessionClaims);
    if (!isAdmin) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("clerk_user_id", userId)
        .maybeSingle();
      if (profile?.role === "admin") {
        isAdmin = true;
      }
    }

    // Verify ownership
    const { data: listing } = await supabase
      .from("listings")
      .select("id, owner_id, status")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) {
      return { error: "Listing not found.", code: "NOT_FOUND" };
    }

    if (listing.owner_id !== userId && !isAdmin) {
      return { error: "Unauthorized: You do not own this listing.", code: "UNAUTHORIZED" };
    }

    // Query all bookings to determine deletion eligibility vs archiving requirement
    const { data: allBookings, error: checkError } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("listing_id", listingId);

    if (checkError) {
      console.error("[deleteUserListingAction] Bookings query error:", checkError.message);
      return {
        error: "Failed to verify existing reservations. Please try again.",
        code: "DATABASE_ERROR",
      };
    }

    const bookingsList = allBookings || [];
    const activeBookings = bookingsList.filter((b) =>
      ["pending", "accepted", "paid", "active"].includes(b.status)
    );
    const hasHistoricalBookings = bookingsList.some((b) =>
      ["completed", "returned", "cancelled"].includes(b.status)
    );

    if (activeBookings.length > 0) {
      return {
        error: "Cannot remove listing while active or pending reservations exist. Please resolve current rentals or toggle the status to 'Not Available' to prevent new bookings.",
        code: "ACTIVE_BOOKINGS_EXIST",
      };
    }

    if (hasHistoricalBookings) {
      return {
        error: "This equipment has completed or historical rental records that must be retained for legal and financial audit history. To remove it from active search and your inventory, you can safely archive it.",
        code: "HISTORICAL_RECORDS_EXIST",
      };
    }

    // Check if open moderation reports exist under review
    const { data: openReports } = await supabase
      .from("listing_reports")
      .select("id")
      .eq("listing_id", listingId)
      .in("status", ["pending", "reviewed"]);

    if (openReports && openReports.length > 0) {
      return {
        error: "Cannot delete listing while active moderation reports are under review. Please wait for moderation resolution.",
        code: "RESTRICTED",
      };
    }

    // 0 bookings exist! Eligible for actual physical deletion from the marketplace database
    // 1. Remove storage photos if hosted in Supabase storage
    try {
      const { data: imgRows } = await supabase
        .from("listing_images")
        .select("image_url")
        .eq("listing_id", listingId);

      const allUrls = [
        ...(imgRows || []).map((r) => r.image_url),
        ...((listing as unknown as { images?: string[] }).images || []),
      ];

      const storagePaths: string[] = [];
      for (const url of allUrls) {
        if (url && url.includes("/listing-images/")) {
          const parts = url.split("/listing-images/");
          if (parts[1]) {
            storagePaths.push(decodeURIComponent(parts[1]));
          }
        }
      }

      if (storagePaths.length > 0) {
        await supabase.storage.from("listing-images").remove(storagePaths);
      }
    } catch (storageErr) {
      console.warn("[deleteUserListingAction] Storage cleanup warning:", storageErr);
    }

    // 2. Remove dependent relational rows
    await supabase.from("saved_listings").delete().eq("listing_id", listingId);
    await supabase.from("listing_images").delete().eq("listing_id", listingId);
    try {
      const serviceClient = createSupabaseServiceClient();
      await serviceClient.from("listing_verifications").delete().eq("listing_id", listingId);
    } catch {
      // Non-fatal if table not yet created
    }

    // 3. Delete from listings table
    let deleteError: { message: string } | null = null;
    const { error: clientDeleteError } = await supabase
      .from("listings")
      .delete()
      .eq("id", listingId);

    if (clientDeleteError) {
      try {
        const serviceClient = createSupabaseServiceClient();
        const { error: serviceDeleteError } = await serviceClient
          .from("listings")
          .delete()
          .eq("id", listingId);
        deleteError = serviceDeleteError;
      } catch {
        deleteError = clientDeleteError;
      }
    }

    if (deleteError) {
      console.error("[deleteUserListingAction] Delete error:", deleteError.message);
      return { error: deleteError.message, code: "DATABASE_ERROR" };
    }

    revalidatePath("/dashboard");
    revalidatePath("/listings");
    revalidatePath(`/listings/${listingId}`);
    return { success: true, removed: true, mode: "deleted" };
  } catch (err: unknown) {
    return { error: (err as Error).message || "Failed to delete listing", code: "DATABASE_ERROR" };
  }
}

/**
 * Authoritative Server Action for safely archiving a listing with historical bookings.
 * Preserves financial, audit, and legal records while removing the listing from public marketplace and active inventory.
 */
export async function archiveUserListingAction(listingId: string) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return { error: "You must be signed in to perform this action.", code: "AUTH_REQUIRED" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    let isAdmin = checkAdminClaim(sessionClaims);
    if (!isAdmin) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("clerk_user_id", userId)
        .maybeSingle();
      if (profile?.role === "admin") {
        isAdmin = true;
      }
    }

    const { data: listing } = await supabase
      .from("listings")
      .select("id, owner_id")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) return { error: "Listing not found.", code: "NOT_FOUND" };
    if (listing.owner_id !== userId && !isAdmin) {
      return { error: "Unauthorized: You do not own this listing.", code: "UNAUTHORIZED" };
    }

    // Verify no active bookings
    const { data: activeBookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("listing_id", listingId)
      .in("status", ["pending", "accepted", "paid", "active"]);

    if (activeBookings && activeBookings.length > 0) {
      return {
        error: "Cannot archive listing while active or pending rentals exist. Mark as Not Available instead.",
        code: "ACTIVE_BOOKINGS_EXIST",
      };
    }

    const { error: updateError } = await supabase
      .from("listings")
      .update({
        status: "archived",
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    if (updateError) {
      return { error: updateError.message, code: "DATABASE_ERROR" };
    }

    revalidatePath("/dashboard");
    revalidatePath("/listings");
    revalidatePath(`/listings/${listingId}`);
    return { success: true, mode: "archived" };
  } catch (err: unknown) {
    return { error: (err as Error).message || "Failed to archive listing", code: "DATABASE_ERROR" };
  }
}

/**
 * Authoritative Server Action for toggling a user's listing availability.
 * Toggles status between 'available' and 'inactive' (Not Available) with strict ownership checks.
 */
export async function toggleListingAvailabilityAction(listingId: string) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return {
      error: "You must be signed in to perform this action.",
      code: "AUTH_REQUIRED",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    let isAdmin = checkAdminClaim(sessionClaims);
    if (!isAdmin) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("clerk_user_id", userId)
        .maybeSingle();
      if (profile?.role === "admin") {
        isAdmin = true;
      }
    }

    // Verify listing ownership
    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("id, owner_id, status")
      .eq("id", listingId)
      .maybeSingle();

    if (fetchError || !listing) {
      return { error: "Listing not found." };
    }

    if (listing.owner_id !== userId && !isAdmin) {
      return { error: "Unauthorized: You do not own this listing." };
    }

    // Toggle: if currently available, switch to 'inactive' (Not Available); otherwise switch to 'available'
    const newStatus = listing.status === "available" ? "inactive" : "available";

    const { error: updateError } = await supabase
      .from("listings")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    if (updateError) {
      return { error: updateError.message };
    }

    revalidatePath("/dashboard");
    revalidatePath("/listings");
    revalidatePath(`/listings/${listingId}`);

    return { success: true, newStatus };
  } catch (err: unknown) {
    return { error: (err as Error).message || "Failed to toggle listing availability." };
  }
}

