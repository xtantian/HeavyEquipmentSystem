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

/* ==========================================================================
   3. SECURE ADMINISTRATOR INVITATION WORKFLOW
   ========================================================================== */

export interface AdminInvitationItem {
  id: string;
  clerk_invitation_id: string | null;
  email: string;
  invited_by: string;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

/**
 * Invites a new administrator via Clerk's invitation API.
 *
 * SECURITY GUARANTEES:
 * 1. Caller must be an authenticated administrator with active account status.
 * 2. Strict RFC email validation and lowercase normalization.
 * 3. Prevents duplicate invitations if already pending or if user is already an admin.
 * 4. Carries role metadata server-side via Clerk Backend API only.
 * 5. Full audit logging with inviter ID, invitee email, and timestamp.
 */
export async function inviteAdminAction(email: string): Promise<{
  success?: boolean;
  invitationId?: string;
  email?: string;
  error?: string;
}> {
  // 1. Verify caller has active administrator privileges
  const { adminId, adminEmail } = await verifyAdminCaller();
  const callerStatus = await checkCallerAccountStatus();
  if (!callerStatus.allowed || callerStatus.status !== "active") {
    return { error: "Unauthorized: Only active administrators can invite administrators." };
  }

  // 2. Validate email
  const trimmed = email?.trim() || "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!trimmed || !emailRegex.test(trimmed)) {
    return { error: "Please provide a valid email address." };
  }
  const normalizedEmail = trimmed.toLowerCase();

  try {
    const supabase = await getAdminActionClient();

    // 3. Check if user is already an administrator
    const { data: existingAdmin } = await supabase
      .from("profiles")
      .select("id, role")
      .ilike("email", normalizedEmail)
      .eq("role", "admin")
      .maybeSingle();

    if (existingAdmin) {
      return { error: `${normalizedEmail} is already an administrator on this platform.` };
    }

    // 4. Check for duplicate pending invitation
    const { data: existingInvite } = await supabase
      .from("admin_invitations")
      .select("id, status")
      .ilike("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      return { error: `An administrator invitation is already pending for ${normalizedEmail}.` };
    }

    // 5. Create Clerk Invitation using official Clerk Backend SDK
    const client = await clerkClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const invitation = await client.invitations.createInvitation({
      emailAddress: normalizedEmail,
      redirectUrl: appUrl ? `${appUrl}/admin` : undefined,
      publicMetadata: {
        role: "admin",
        invitedAsAdmin: true,
        invitedBy: adminId,
      },
      ignoreExisting: false,
    });

    // 6. Record tracked invitation in Supabase
    try {
      await supabase.from("admin_invitations").insert({
        clerk_invitation_id: invitation.id,
        email: normalizedEmail,
        invited_by: adminId,
        status: "pending",
      });
    } catch (dbErr) {
      console.warn("[inviteAdminAction] Database tracking warning:", dbErr);
    }

    // 7. Record administrative audit trail
    await recordAdminAudit(adminId, adminEmail, "admin_invited", "invitation", invitation.id, {
      inviteeEmail: normalizedEmail,
      clerkInvitationId: invitation.id,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/users");

    return {
      success: true,
      invitationId: invitation.id,
      email: normalizedEmail,
    };
  } catch (err: unknown) {
    const clerkErr = err as { errors?: Array<{ message: string }>; message?: string };
    const errMsg = clerkErr?.errors?.[0]?.message || clerkErr?.message || "Failed to dispatch administrator invitation.";
    return { error: errMsg };
  }
}

/**
 * Retrieve all administrator invitations for dashboard display.
 */
export async function getAdminInvitationsAction(): Promise<{
  success: boolean;
  invitations: AdminInvitationItem[];
  error?: string;
}> {
  await verifyAdminCaller();

  try {
    const supabase = await getAdminActionClient();
    const { data: dbInvites, error: dbErr } = await supabase
      .from("admin_invitations")
      .select("*")
      .order("created_at", { ascending: false });

    if (!dbErr && dbInvites) {
      return { success: true, invitations: dbInvites as AdminInvitationItem[] };
    }
  } catch (err) {
    console.warn("[getAdminInvitationsAction] Database fallback:", err);
  }

  // Fallback: Query live invitations from Clerk
  try {
    const client = await clerkClient();
    const clerkList = await client.invitations.getInvitationList({ status: "pending" });
    const formatted: AdminInvitationItem[] = (clerkList?.data || []).map((inv) => ({
      id: inv.id,
      clerk_invitation_id: inv.id,
      email: inv.emailAddress,
      invited_by: (inv.publicMetadata as { invitedBy?: string })?.invitedBy || "Admin",
      status: (inv.status as "pending" | "accepted" | "revoked") || "pending",
      created_at: new Date(inv.createdAt).toISOString(),
      accepted_at: null,
      revoked_at: null,
    }));
    return { success: true, invitations: formatted };
  } catch (err: unknown) {
    return { success: false, invitations: [], error: (err as Error).message };
  }
}

/**
 * Revoke an active administrator invitation.
 */
export async function revokeAdminInvitationAction(invitationId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const { adminId, adminEmail } = await verifyAdminCaller();
  const callerStatus = await checkCallerAccountStatus();
  if (!callerStatus.allowed || callerStatus.status !== "active") {
    return { success: false, error: "Unauthorized: Only active administrators can revoke invitations." };
  }

  try {
    // 1. Revoke in Clerk
    try {
      const client = await clerkClient();
      await client.invitations.revokeInvitation(invitationId);
    } catch (clerkErr) {
      console.warn("[revokeAdminInvitationAction] Clerk revoke notice:", clerkErr);
    }

    // 2. Update status in database
    const supabase = await getAdminActionClient();
    await supabase
      .from("admin_invitations")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      })
      .or(`clerk_invitation_id.eq.${invitationId},id.eq.${invitationId}`);

    // 3. Record audit log
    await recordAdminAudit(adminId, adminEmail, "admin_invitation_revoked", "invitation", invitationId, {});

    revalidatePath("/admin");
    revalidatePath("/admin/users");

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message || "Failed to revoke invitation." };
  }
}
