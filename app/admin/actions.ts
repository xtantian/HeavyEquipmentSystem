"use server";

import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { ListingStatus, UserAccountStatus, Json } from "@/lib/supabase/types";

/**
 * Resolves an administrative Supabase client.
 * Prefers the elevated service-role client; falls back to the authenticated admin server client.
 */
async function getAdminActionClient() {
  try {
    return createSupabaseServiceClient();
  } catch {
    return await createSupabaseServerClient();
  }
}

/**
 * Verifies that the caller is authenticated and holds administrator privileges.
 * Checks both Clerk publicMetadata and Supabase profiles table.
 */
async function verifyAdminCaller() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized: Authentication required");
  }

  const user = await currentUser();
  const isAdminInClerk = user?.publicMetadata?.role === "admin";

  if (!isAdminInClerk) {
    const supabase = await getAdminActionClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (profile?.role !== "admin") {
      throw new Error("Unauthorized: Administrator privileges required");
    }
  }

  return {
    adminId: userId,
    adminEmail: user?.primaryEmailAddress?.emailAddress || null,
  };
}

/**
 * Log administrative operations into admin_audit_logs.
 */
async function recordAdminAudit(
  adminId: string,
  adminEmail: string | null,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {}
) {
  try {
    const supabase = await getAdminActionClient();
    await supabase.from("admin_audit_logs").insert({
      admin_id: adminId,
      admin_email: adminEmail,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details as unknown as Json,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[recordAdminAudit] Warning logging audit:", err);
  }
}

/* ==========================================================================
   1. EQUIPMENT LISTING MANAGEMENT ACTIONS
   ========================================================================== */

/**
 * Restrict or hide an equipment listing
 */
export async function restrictListingAction(listingId: string, reason: string = "Platform rule violation review") {
  const { adminId, adminEmail } = await verifyAdminCaller();

  try {
    const supabase = await getAdminActionClient();

    const { error } = await supabase
      .from("listings")
      .update({
        status: "restricted",
        report_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    if (error) throw new Error(error.message);

    await recordAdminAudit(adminId, adminEmail, "restrict_listing", "listing", listingId, { reason });

    revalidatePath("/admin");
    revalidatePath("/admin/listings");
    revalidatePath("/listings");
    revalidatePath(`/listings/${listingId}`);
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message || "Failed to restrict listing" };
  }
}

/**
 * Restore a restricted or deleted equipment listing back to available
 */
export async function restoreListingAction(listingId: string) {
  const { adminId, adminEmail } = await verifyAdminCaller();

  try {
    const supabase = await getAdminActionClient();

    const { error } = await supabase
      .from("listings")
      .update({
        status: "available",
        report_reason: null,
        is_reported: false,
        deleted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    if (error) throw new Error(error.message);

    await recordAdminAudit(adminId, adminEmail, "restore_listing", "listing", listingId);

    revalidatePath("/admin");
    revalidatePath("/admin/listings");
    revalidatePath("/listings");
    revalidatePath(`/listings/${listingId}`);
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message || "Failed to restore listing" };
  }
}

/**
 * Soft-delete an equipment listing (sets status to 'deleted', preserving historical data)
 */
export async function softDeleteListingAction(listingId: string, reason: string = "Deleted by Administrator") {
  const { adminId, adminEmail } = await verifyAdminCaller();

  try {
    const supabase = await getAdminActionClient();

    const { error } = await supabase
      .from("listings")
      .update({
        status: "deleted",
        report_reason: reason,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    if (error) throw new Error(error.message);

    await recordAdminAudit(adminId, adminEmail, "soft_delete_listing", "listing", listingId, { reason });

    revalidatePath("/admin");
    revalidatePath("/admin/listings");
    revalidatePath("/listings");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message || "Failed to delete listing" };
  }
}

/**
 * Compatibility alias for softDeleteListingAction
 */
export async function deleteListingAdminAction(listingId: string) {
  return softDeleteListingAction(listingId);
}

/**
 * Update listing status (generic admin action)
 */
export async function updateListingStatusAdminAction(listingId: string, newStatus: ListingStatus) {
  const { adminId, adminEmail } = await verifyAdminCaller();

  try {
    const supabase = await getAdminActionClient();

    const { error } = await supabase
      .from("listings")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    if (error) throw new Error(error.message);

    await recordAdminAudit(adminId, adminEmail, "update_listing_status", "listing", listingId, { newStatus });

    revalidatePath("/admin");
    revalidatePath("/admin/listings");
    revalidatePath("/listings");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message || "Failed to update listing status" };
  }
}

/**
 * Dismiss or resolve a listing violation report
 */
export async function dismissReportAction(reportId: string, listingId?: string) {
  const { adminId, adminEmail } = await verifyAdminCaller();

  try {
    const supabase = await getAdminActionClient();

    await supabase
      .from("listing_reports")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("id", reportId);

    if (listingId) {
      await supabase
        .from("listings")
        .update({ is_reported: false, report_reason: null })
        .eq("id", listingId);
    }

    await recordAdminAudit(adminId, adminEmail, "dismiss_report", "report", reportId);

    revalidatePath("/admin");
    revalidatePath("/admin/reports");
    revalidatePath("/admin/listings");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message || "Failed to dismiss report" };
  }
}

/* ==========================================================================
   2. USER MANAGEMENT ACTIONS
   ========================================================================== */

/**
 * Change a user's account status (active, restricted, banned, deleted)
 */
export async function updateUserAccountStatusAction(
  clerkUserId: string,
  newStatus: UserAccountStatus,
  reason: string = ""
) {
  const { adminId, adminEmail } = await verifyAdminCaller();

  try {
    const supabase = await getAdminActionClient();

    // 1. Update status in Supabase profiles
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("clerk_user_id", clerkUserId);

    if (profileError) throw new Error(profileError.message);

    // 2. Synchronize status into Clerk publicMetadata so client and middleware can inspect immediately
    try {
      const client = await clerkClient();
      await client.users.updateUserMetadata(clerkUserId, {
        publicMetadata: {
          status: newStatus,
          statusReason: reason || undefined,
          statusUpdatedAt: new Date().toISOString(),
        },
      });
    } catch (clerkErr) {
      console.warn("[updateUserAccountStatusAction] Clerk metadata sync warning:", clerkErr);
    }

    // 3. If banned or deleted, restrict active listings of the user
    if (newStatus === "banned" || newStatus === "deleted") {
      await supabase
        .from("listings")
        .update({ status: "restricted" })
        .eq("owner_id", clerkUserId)
        .eq("status", "available");
    }

    // 4. Record audit log
    await recordAdminAudit(adminId, adminEmail, `user_${newStatus}`, "user", clerkUserId, {
      newStatus,
      reason,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err as Error).message || `Failed to update user to ${newStatus}` };
  }
}

/**
 * Check if the current authenticated user has an active status or is restricted/banned
 */
export async function checkCallerAccountStatus(): Promise<{
  allowed: boolean;
  status: UserAccountStatus;
  reason?: string;
}> {
  const { userId } = await auth();
  if (!userId) {
    return { allowed: false, status: "deleted", reason: "Unauthenticated" };
  }

  try {
    const supabase = await getAdminActionClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    const status = (profile?.status as UserAccountStatus) || "active";

    if (status === "banned") {
      return { allowed: false, status, reason: "Your account has been banned due to policy violations." };
    }
    if (status === "restricted") {
      return { allowed: false, status, reason: "Your account is currently restricted from creating listings or rentals." };
    }
    if (status === "deleted") {
      return { allowed: false, status, reason: "This account has been deleted." };
    }

    return { allowed: true, status: "active" };
  } catch {
    return { allowed: true, status: "active" };
  }
}
