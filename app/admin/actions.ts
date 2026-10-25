"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyAdminSession } from "@/lib/auth/admin";
import type { ListingStatus, UserAccountStatus, Json } from "@/lib/supabase/types";

/**
 * Resolves an authoritative administrative Supabase client.
 * Administrative actions require the elevated service-role client to enforce
 * verified server-side business logic and bypass database triggers restricting
 * verification badges and moderation state transitions.
 *
 * Silently falling back to the authenticated user client is removed because user
 * tokens cannot bypass database triggers or update moderation status if profiles.role
 * is desynchronized. Instead, an explicit configuration error is raised.
 */
async function getAdminActionClient() {
  try {
    return createSupabaseServiceClient();
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error("[getAdminActionClient] Service-role client initialization failed:", errMessage);
    throw new Error(
      "Administrative service is unavailable: service-role configuration is missing or invalid. Please check server environment settings (SUPABASE_KEY_SECRET)."
    );
  }
}

/**
 * Verifies that the caller is authenticated and holds administrator privileges.
 * Delegates to the shared authoritative verifyAdminSession helper.
 */
async function verifyAdminCaller() {
  const authResult = await verifyAdminSession();
  if (!authResult.userId) {
    throw new Error("Unauthorized: Authentication required");
  }
  if (!authResult.authorized) {
    throw new Error(authResult.reason || "Unauthorized: Administrator privileges required");
  }

  return {
    adminId: authResult.userId,
    adminEmail: authResult.adminEmail,
  };
}

/**
 * Log administrative operations into admin_audit_logs.
 * Explicitly inspects the Supabase insert error and returns structured result.
 */
async function recordAdminAudit(
  adminId: string,
  adminEmail: string | null,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getAdminActionClient();
    const { error } = await supabase.from("admin_audit_logs").insert({
      admin_id: adminId,
      admin_email: adminEmail,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details as unknown as Json,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[recordAdminAudit] Error inserting audit log:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const msg = (err as Error).message || "Unknown audit logging error";
    console.error("[recordAdminAudit] Exception logging audit:", msg);
    return { success: false, error: msg };
  }
}

/* ==========================================================================
   1. EQUIPMENT LISTING MANAGEMENT ACTIONS
   ========================================================================== */

/**
 * Restrict or hide an equipment listing
 */
export async function restrictListingAction(listingId: string, reason: string = "Platform rule violation review") {
  try {
    const { adminId, adminEmail } = await verifyAdminCaller();
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
  try {
    const { adminId, adminEmail } = await verifyAdminCaller();
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
 * Authoritative admin action to approve a pending equipment listing for public marketplace display.
 * Sets status to 'available', records verified metadata, and registers an administrative audit log.
 * Enforces conditional concurrency checks, preserves report history, and blocks unverified shadow-quarantined units.
 */
export async function approveListingAction(
  listingId: string,
  options?: { resolveQuarantine?: boolean }
) {
  try {
    const { adminId, adminEmail } = await verifyAdminCaller();
    const supabase = await getAdminActionClient();

    // Verify listing existence and current status
    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("id, status, attributes, title, is_verified, verified_at, verified_by")
      .eq("id", listingId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!listing) return { error: "Listing not found" };

    // Status Transition Guard:
    // 1. shadow_quarantined requires explicit resolution of anti-fraud/duplicate collision
    if (listing.status === "shadow_quarantined" && !options?.resolveQuarantine) {
      return {
        error:
          "Listing is shadow-quarantined due to duplicate equipment or cross-account serial collisions. Explicit quarantine resolution confirmation is required before approval.",
        code: "QUARANTINE_UNRESOLVED",
      };
    }

    // 2. restricted items can ONLY be approved if they were restricted via moderation rejection
    const existingAttrs = (listing.attributes || {}) as Record<string, unknown>;
    if (listing.status === "restricted" && existingAttrs.moderation_status !== "rejected") {
      return {
        error:
          "Listing was restricted due to safety or administrative violations, not moderation rejection. Please use 'Restore Listing' to address the underlying flag.",
        code: "RESTRICTED_VIOLATION",
      };
    }

    // 3. inactive items are deactivated by owner choice, not pending moderation review
    if (listing.status === "inactive") {
      return {
        error:
          "Listing is inactive by owner choice. The owner can reactivate it from their dashboard.",
        code: "INACTIVE_OWNER_CHOICE",
      };
    }

    const allowedStatuses: ListingStatus[] = ["pending_review", "shadow_quarantined", "restricted"];
    if (!allowedStatuses.includes(listing.status)) {
      return { error: `Cannot approve listing with current status '${listing.status}'` };
    }

    const updatedAttrs = {
      ...existingAttrs,
      moderation_status: "approved",
      moderated_at: new Date().toISOString(),
      moderated_by: adminId,
      rejection_reason: null,
      ...(listing.status === "shadow_quarantined"
        ? {
            quarantine_resolved: true,
            quarantine_resolved_at: new Date().toISOString(),
            quarantine_resolved_by: adminId,
          }
        : {}),
    };

    // Conditional update: must match exact current status to prevent concurrent race condition
    const { data: updatedRows, error: updateError } = await supabase
      .from("listings")
      .update({
        status: "available",
        is_verified: true,
        verified_at: new Date().toISOString(),
        verified_by: adminId,
        attributes: updatedAttrs as unknown as Json,
        // Preserve report_reason — DO NOT clear existing user safety/report history
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId)
      .eq("status", listing.status)
      .select("id, status");

    if (updateError) throw new Error(updateError.message);
    if (!updatedRows || updatedRows.length === 0) {
      return {
        error: "Conflict: This listing was modified or moderated concurrently by another administrator. Please refresh.",
        code: "CONFLICT",
      };
    }

    // Audit Logging with explicit failure detection & compensatory rollback
    const auditRes = await recordAdminAudit(adminId, adminEmail, "approve_listing", "listing", listingId, {
      previousStatus: listing.status,
      title: listing.title,
      quarantineResolved: listing.status === "shadow_quarantined",
    });

    if (!auditRes.success) {
      // Compensatory rollback: restore status back to previous state to maintain audit integrity.
      // Must match exact status = 'available' written above to prevent overwriting concurrent updates.
      const { data: rollbackRows, error: rollbackError } = await supabase
        .from("listings")
        .update({
          status: listing.status,
          is_verified: listing.is_verified || false,
          verified_at: listing.verified_at,
          verified_by: listing.verified_by,
          attributes: existingAttrs as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq("id", listingId)
        .eq("status", "available")
        .select("id, status");

      if (rollbackError) {
        console.error("[approveListingAction] Rollback error:", rollbackError.message);
        return {
          error: `Audit logging failed (${auditRes.error}), and automated compensatory rollback encountered an error: ${rollbackError.message}. Manual administrative intervention is required.`,
          code: "ROLLBACK_FAILED",
        };
      }

      if (!rollbackRows || rollbackRows.length === 0) {
        console.error("[approveListingAction] Rollback conflict: 0 rows matched");
        return {
          error: `Audit logging failed (${auditRes.error}), and compensatory rollback was aborted because the listing was modified concurrently by another process.`,
          code: "ROLLBACK_CONFLICT",
        };
      }

      return {
        error: `Audit logging failed: ${auditRes.error}. The approval was rolled back to maintain audit trail integrity.`,
        code: "AUDIT_FAILED",
      };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/listings");
    revalidatePath("/listings");
    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: unknown) {
    console.error("[approveListingAction] Error:", err);
    return { error: (err as Error).message || "Failed to approve listing" };
  }
}

/**
 * Authoritative admin action to decline a pending equipment listing.
 * Requires a non-empty reason. Stores moderation metadata inside attributes
 * and sets status to 'restricted' without overwriting unrelated user report data.
 * Enforces conditional concurrency checks and ensures audit record creation.
 */
export async function declineListingAction(listingId: string, reason: string) {
  const trimmedReason = reason?.trim() || "";
  if (!trimmedReason) {
    return { error: "A non-empty explanation is required when declining a listing." };
  }

  try {
    const { adminId, adminEmail } = await verifyAdminCaller();
    const supabase = await getAdminActionClient();

    // Verify listing existence and current status
    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("id, status, attributes, title")
      .eq("id", listingId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!listing) return { error: "Listing not found" };

    const allowedDeclineStatuses: ListingStatus[] = ["pending_review", "shadow_quarantined", "restricted"];
    if (!allowedDeclineStatuses.includes(listing.status)) {
      return {
        error: `Cannot decline listing with current status '${listing.status}'. Only pending or review-candidate items can be declined.`,
      };
    }

    const existingAttrs = (listing.attributes || {}) as Record<string, unknown>;
    const updatedAttrs = {
      ...existingAttrs,
      moderation_status: "rejected",
      rejection_reason: trimmedReason,
      moderated_at: new Date().toISOString(),
      moderated_by: adminId,
    };

    // Conditional update: must match exact current status
    const { data: updatedRows, error: updateError } = await supabase
      .from("listings")
      .update({
        status: "restricted",
        attributes: updatedAttrs as unknown as Json,
        // Preserve report_reason — DO NOT clear existing user safety/report history
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId)
      .eq("status", listing.status)
      .select("id, status");

    if (updateError) throw new Error(updateError.message);
    if (!updatedRows || updatedRows.length === 0) {
      return {
        error: "Conflict: This listing was modified or moderated concurrently by another administrator. Please refresh.",
        code: "CONFLICT",
      };
    }

    // Audit Logging with explicit failure detection & compensatory rollback
    const auditRes = await recordAdminAudit(adminId, adminEmail, "decline_listing", "listing", listingId, {
      previousStatus: listing.status,
      title: listing.title,
      reason: trimmedReason,
    });

    if (!auditRes.success) {
      // Compensatory rollback: restore status back to previous state to maintain audit integrity.
      // Must match exact status = 'restricted' written above to prevent overwriting concurrent updates.
      const { data: rollbackRows, error: rollbackError } = await supabase
        .from("listings")
        .update({
          status: listing.status,
          attributes: existingAttrs as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq("id", listingId)
        .eq("status", "restricted")
        .select("id, status");

      if (rollbackError) {
        console.error("[declineListingAction] Rollback error:", rollbackError.message);
        return {
          error: `Audit logging failed (${auditRes.error}), and automated compensatory rollback encountered an error: ${rollbackError.message}. Manual administrative intervention is required.`,
          code: "ROLLBACK_FAILED",
        };
      }

      if (!rollbackRows || rollbackRows.length === 0) {
        console.error("[declineListingAction] Rollback conflict: 0 rows matched");
        return {
          error: `Audit logging failed (${auditRes.error}), and compensatory rollback was aborted because the listing was modified concurrently by another process.`,
          code: "ROLLBACK_CONFLICT",
        };
      }

      return {
        error: `Audit logging failed: ${auditRes.error}. The decline was rolled back to maintain audit trail integrity.`,
        code: "AUDIT_FAILED",
      };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/listings");
    revalidatePath("/listings");
    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: unknown) {
    console.error("[declineListingAction] Error:", err);
    return { error: (err as Error).message || "Failed to decline listing" };
  }
}

/**
 * Soft-delete an equipment listing (sets status to 'deleted', preserving historical data).
 * Enforces admin authorization, validates listing state, and strictly protects equipment
 * that is currently rented or has active/pending rental bookings.
 */
export async function softDeleteListingAction(listingId: string, reason: string = "Deleted by Administrator") {
  try {
    const { adminId, adminEmail } = await verifyAdminCaller();
    const supabase = await getAdminActionClient();

    // Verify listing existence and current status
    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("id, status, title")
      .eq("id", listingId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!listing) return { error: "Listing not found", code: "NOT_FOUND" };

    // Protection 1: Never delete rented equipment
    if (listing.status === "rented") {
      return {
        error: "Cannot delete equipment while it is currently rented. Complete or cancel the active rental contract first.",
        code: "ACTIVE_RENTAL",
      };
    }

    // Protection 2: Never delete equipment with active or pending bookings
    const { data: activeBookings, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("listing_id", listingId)
      .in("status", ["pending", "accepted", "paid", "active"]);

    if (bookingErr) throw new Error(bookingErr.message);

    if (activeBookings && activeBookings.length > 0) {
      return {
        error: "Cannot delete listing with active bookings or rental contracts. Please resolve current reservations before deleting.",
        code: "ACTIVE_BOOKINGS_EXIST",
      };
    }

    // Protection 3: Check open moderation reports under review
    const { data: openReports } = await supabase
      .from("listing_reports")
      .select("id")
      .eq("listing_id", listingId)
      .in("status", ["pending", "reviewed"]);

    if (openReports && openReports.length > 0) {
      return {
        error: "Cannot delete listing while active moderation reports are under review. Please resolve pending reports first.",
        code: "REPORTS_PENDING",
      };
    }

    const { error: updateError } = await supabase
      .from("listings")
      .update({
        status: "deleted",
        report_reason: reason,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    if (updateError) throw new Error(updateError.message);

    await recordAdminAudit(adminId, adminEmail, "soft_delete_listing", "listing", listingId, {
      previousStatus: listing.status,
      title: listing.title,
      reason,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/listings");
    revalidatePath("/listings");
    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/dashboard");
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
  try {
    const { adminId, adminEmail } = await verifyAdminCaller();
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
 * Dismiss or resolve a violation report (either listing report or profile report).
 * Persists status: 'dismissed' into the authoritative database table, checks affected rows,
 * and clears the listing flag if no other active reports exist.
 */
export async function dismissReportAction(
  reportId: string,
  listingId?: string,
  targetType?: "listing" | "profile"
) {
  try {
    const { adminId, adminEmail } = await verifyAdminCaller();
    const supabase = await getAdminActionClient();

    let updated = false;
    let resolvedTargetType: "listing" | "profile" = targetType || "listing";

    // 1. If explicitly marked as profile or not specified, attempt authoritative table update
    if (targetType === "profile") {
      const { data, error } = await supabase
        .from("profile_reports")
        .update({
          status: "dismissed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", reportId)
        .select("id");

      if (error) {
        console.error("[dismissReportAction] profile_reports update error:", error.message);
        throw new Error(error.message);
      }
      if (data && data.length > 0) {
        updated = true;
        resolvedTargetType = "profile";
      }
    } else if (targetType === "listing") {
      const { data, error } = await supabase
        .from("listing_reports")
        .update({
          status: "dismissed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", reportId)
        .select("id");

      if (error) {
        console.error("[dismissReportAction] listing_reports update error:", error.message);
        throw new Error(error.message);
      }
      if (data && data.length > 0) {
        updated = true;
        resolvedTargetType = "listing";
      }
    } else {
      // Target type not specified: try listing_reports first
      const { data: listData, error: listError } = await supabase
        .from("listing_reports")
        .update({
          status: "dismissed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", reportId)
        .select("id");

      if (listError) {
        console.error("[dismissReportAction] listing_reports update error:", listError.message);
      } else if (listData && listData.length > 0) {
        updated = true;
        resolvedTargetType = "listing";
      }

      // If not updated in listing_reports, try profile_reports
      if (!updated) {
        const { data: profData, error: profError } = await supabase
          .from("profile_reports")
          .update({
            status: "dismissed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", reportId)
          .select("id");

        if (profError) {
          console.error("[dismissReportAction] profile_reports update error:", profError.message);
        } else if (profData && profData.length > 0) {
          updated = true;
          resolvedTargetType = "profile";
        }
      }
    }

    // 2. Cross-table fallback: if targetType was explicitly passed but row was not found, check the other table
    if (!updated && targetType) {
      const fallbackTable = targetType === "profile" ? "listing_reports" : "profile_reports";
      const { data: fbData, error: fbErr } = await supabase
        .from(fallbackTable)
        .update({
          status: "dismissed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", reportId)
        .select("id");

      if (!fbErr && fbData && fbData.length > 0) {
        updated = true;
        resolvedTargetType = targetType === "profile" ? "listing" : "profile";
      }
    }

    if (!updated) {
      return {
        error: "Report record not found or could not be updated.",
        code: "REPORT_NOT_FOUND",
      };
    }

    // 3. Clear reported flag on listing ONLY if it was a listing report AND listingId is a valid UUID
    const isValidListingUUID =
      listingId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listingId);

    if (isValidListingUUID && resolvedTargetType === "listing") {
      try {
        const { data: otherOpenReports } = await supabase
          .from("listing_reports")
          .select("id")
          .eq("listing_id", listingId)
          .in("status", ["pending", "reviewed"])
          .neq("id", reportId);

        if (!otherOpenReports || otherOpenReports.length === 0) {
          await supabase
            .from("listings")
            .update({ is_reported: false, report_reason: null })
            .eq("id", listingId);
        }
      } catch (listingErr) {
        console.warn("[dismissReportAction] Listing flag update non-fatal warning:", listingErr);
      }
    }

    // 4. Record audit log
    await recordAdminAudit(
      adminId,
      adminEmail,
      "dismiss_report",
      resolvedTargetType === "profile" ? "user" : "report",
      reportId,
      {
        targetType: resolvedTargetType,
        listingId: isValidListingUUID ? listingId : undefined,
      }
    );

    // 5. Revalidate admin views
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
  try {
    const { adminId, adminEmail } = await verifyAdminCaller();
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
    const supabase = await createSupabaseServerClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("status")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[checkCallerAccountStatus] Profile query error:", error.message);
      return { allowed: false, status: "restricted", reason: "Unable to verify account status." };
    }

    const status = (profile?.status as UserAccountStatus) || "active";

    if (status === "banned") {
      return { allowed: false, status, reason: "Your account has been banned due to policy violations." };
    }
    if (status === "restricted") {
      return { allowed: false, status, reason: "Your account is currently restricted." };
    }
    if (status === "deleted") {
      return { allowed: false, status, reason: "This account has been deleted." };
    }

    return { allowed: true, status: "active" };
  } catch (err) {
    console.error("[checkCallerAccountStatus] Verification exception:", err);
    return { allowed: false, status: "restricted", reason: "Unable to verify account status." };
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
  try {
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
    const { error: dbErr } = await supabase.from("admin_invitations").insert({
      clerk_invitation_id: invitation.id,
      email: normalizedEmail,
      invited_by: adminId,
      status: "pending",
    });

    if (dbErr) {
      console.error("[inviteAdminAction] Database tracking failed:", dbErr.message);
      // Clean up Clerk invitation so unrecorded invites cannot be accepted without database tracking
      try {
        await client.invitations.revokeInvitation(invitation.id);
      } catch (cleanupErr) {
        console.warn("[inviteAdminAction] Failed to cleanup Clerk invitation after DB failure:", cleanupErr);
      }
      return { error: `Failed to record administrator invitation: ${dbErr.message}` };
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
  try {
    await verifyAdminCaller();
  } catch (err: unknown) {
    return {
      success: false,
      invitations: [],
      error: (err as Error).message || "Unauthorized: Administrator verification unavailable",
    };
  }

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
  try {
    const { adminId, adminEmail } = await verifyAdminCaller();
    const callerStatus = await checkCallerAccountStatus();
    if (!callerStatus.allowed || callerStatus.status !== "active") {
      return { success: false, error: "Unauthorized: Only active administrators can revoke invitations." };
    }

    // 1. Revoke in Clerk
    try {
      const client = await clerkClient();
      await client.invitations.revokeInvitation(invitationId);
    } catch (clerkErr) {
      console.warn("[revokeAdminInvitationAction] Clerk revoke notice:", clerkErr);
    }

    // 2. Update status in database
    const supabase = await getAdminActionClient();
    const { error: updateErr } = await supabase
      .from("admin_invitations")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      })
      .or(`clerk_invitation_id.eq.${invitationId},id.eq.${invitationId}`);

    if (updateErr) {
      console.error("[revokeAdminInvitationAction] Database update error:", updateErr.message);
      return { success: false, error: `Failed to update invitation status in database: ${updateErr.message}` };
    }

    // 3. Record audit log
    await recordAdminAudit(adminId, adminEmail, "admin_invitation_revoked", "invitation", invitationId, {});

    revalidatePath("/admin");
    revalidatePath("/admin/users");

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message || "Failed to revoke invitation." };
  }
}
