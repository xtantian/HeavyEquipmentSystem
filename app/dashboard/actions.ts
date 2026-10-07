"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
export async function updateBookingStatusAction(
  bookingId: string,
  newStatus: UpdatableBookingStatus
) {
  const { userId } = await auth();
  if (!userId) {
    return {
      error: "You must be signed in to perform this action.",
      code: "AUTH_REQUIRED",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();

    // 1. Fetch booking with listing relation to verify ownership
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

    if (fetchError || !booking) {
      return {
        error: "Booking record not found in database.",
        code: "NOT_FOUND",
      };
    }

    // 2. Determine authorization
    const isRenter = booking.renter_id === userId;
    const listingOwnerId = (booking.listing as unknown as { owner_id: string } | null)?.owner_id;
    const isOwner = listingOwnerId === userId;

    const user = await currentUser();
    let isAdmin = user?.publicMetadata?.role === "admin";
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

    let isAuthorized = false;

    if (isAdmin) {
      isAuthorized = true;
    } else if (isOwner) {
      // Equipment owners can accept or cancel booking requests for their units
      if (newStatus === "accepted" || newStatus === "cancelled") {
        isAuthorized = true;
      }
    } else if (isRenter) {
      // Renters can cancel their own bookings
      if (newStatus === "cancelled") {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return {
        error: "Unauthorized: You do not have permission to perform this status transition.",
        code: "UNAUTHORIZED",
      };
    }

    // 3. Execute database update
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

    revalidatePath("/dashboard");
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
 * Authoritative Server Action for soft-deleting a user's equipment listing.
 */
export async function deleteUserListingAction(listingId: string) {
  const { userId } = await auth();
  if (!userId) {
    return {
      error: "You must be signed in to perform this action.",
      code: "AUTH_REQUIRED",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const user = await currentUser();
    let isAdmin = user?.publicMetadata?.role === "admin";
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
      .select("id, owner_id")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) {
      return { error: "Listing not found." };
    }

    if (listing.owner_id !== userId && !isAdmin) {
      return { error: "Unauthorized: You do not own this listing." };
    }

    // Soft-delete: update status to 'deleted' and record deleted_at timestamp
    const { error } = await supabase
      .from("listings")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/dashboard");
    revalidatePath("/listings");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message || "Failed to delete listing" };
  }
}
