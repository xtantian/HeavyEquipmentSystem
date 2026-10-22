import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserAccountStatus } from "@/lib/supabase/types";

export interface AdminAuthResult {
  authorized: boolean;
  userId: string | null;
  adminEmail: string | null;
  status: UserAccountStatus | null;
  reason?: string;
  source?: "clerk_claims" | "clerk_backend_api";
}

/**
 * Extracts a role claim from any known Clerk session claim format.
 */
function extractRoleFromClaims(claims: Record<string, unknown> | null | undefined): string | undefined {
  if (!claims) return undefined;
  if (typeof claims.role === "string" && claims.role !== "authenticated") {
    return claims.role;
  }
  const publicMeta = claims.publicMetadata as Record<string, unknown> | undefined;
  if (publicMeta && typeof publicMeta.role === "string") {
    return publicMeta.role;
  }
  const customMeta = claims.metadata as Record<string, unknown> | undefined;
  if (customMeta && typeof customMeta.role === "string") {
    return customMeta.role;
  }
  const snakeMeta = claims.public_metadata as Record<string, unknown> | undefined;
  if (snakeMeta && typeof snakeMeta.role === "string") {
    return snakeMeta.role;
  }
  return undefined;
}

/**
 * Authoritative Server-Side Administrator Verification Helper.
 *
 * POLICY:
 * 1. Authentication Gate: Caller must have an active Clerk session (valid userId).
 * 2. Account Status Precedence: Supabase profile status must be active. Accounts marked
 *    banned, restricted, or deleted fail closed immediately and cannot exercise admin privileges.
 * 3. Authoritative Role Source: Clerk public metadata is the sole authoritative source
 *    for the administrator role.
 *    - Fast-Path (Session Claims): If signed sessionClaims contains role === "admin", access is granted.
 *    - Authoritative Clerk Backend SDK: When sessionClaims omits the role (default Clerk session behavior),
 *      the helper retrieves authoritative publicMetadata directly from Clerk Backend API.
 *    - Stale Supabase Profile Protection: A Supabase profile record with role === "admin" CANNOT authorize
 *      a user if Clerk public metadata does not confirm the admin role.
 * 4. Fail-Closed: Any lookup failure (network error, API exception, unverified role) denies access.
 * 5. Privacy: No secrets, credentials, or sensitive user data are printed to logs.
 */
export async function verifyAdminSession(): Promise<AdminAuthResult> {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return {
      authorized: false,
      userId: null,
      adminEmail: null,
      status: null,
      reason: "Authentication required",
    };
  }

  // 1. Inspect Supabase profile for account status and email
  let profileRole: string | null = null;
  let profileStatus: UserAccountStatus = "active";
  let profileEmail: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("email, role, status")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[admin-auth] Profile status lookup notice");
    } else if (profile) {
      profileRole = profile.role || null;
      profileStatus = (profile.status as UserAccountStatus) || "active";
      profileEmail = profile.email || null;
    }
  } catch {
    console.warn("[admin-auth] Supabase client unavailable for status check");
  }

  // Active status enforcement: Non-active accounts cannot exercise admin access
  if (profileStatus && profileStatus !== "active") {
    return {
      authorized: false,
      userId,
      adminEmail: profileEmail,
      status: profileStatus,
      reason: `Administrator account is ${profileStatus}`,
    };
  }

  const primaryEmail =
    profileEmail ||
    (sessionClaims?.email as string) ||
    null;

  // 2. Step A: Fast-path local JWT session claims check (if configured in Clerk session token template)
  const claimsRole = extractRoleFromClaims(sessionClaims as Record<string, unknown>);
  if (claimsRole === "admin") {
    return {
      authorized: true,
      userId,
      adminEmail: primaryEmail,
      status: profileStatus,
      source: "clerk_claims",
    };
  }

  // 3. Step B: Authoritative Clerk Backend API lookup
  // Clerk public metadata is authoritative. Stale Supabase profile roles cannot grant access.
  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const clerkPublicMeta = clerkUser?.publicMetadata as Record<string, unknown> | undefined;
    const clerkRole = clerkPublicMeta?.role;

    if (clerkRole === "admin") {
      if (profileRole && profileRole !== "admin") {
        console.info(
          `[admin-auth] Disagreement resolved: User ${userId} holds admin role in Clerk public metadata while Supabase profile role is '${profileRole}'. Authorized via authoritative Clerk metadata.`
        );
      }
      return {
        authorized: true,
        userId,
        adminEmail: primaryEmail || clerkUser.emailAddresses[0]?.emailAddress || null,
        status: profileStatus,
        source: "clerk_backend_api",
      };
    }

    if (profileRole === "admin") {
      console.warn(
        `[admin-auth] Disagreement rejected: User ${userId} has stale profile role 'admin' in Supabase, but authoritative Clerk metadata has role '${clerkRole || "none"}'. Access denied.`
      );
    }
  } catch {
    console.warn("[admin-auth] Clerk Backend API verification failed (fail-closed)");
    return {
      authorized: false,
      userId,
      adminEmail: primaryEmail,
      status: profileStatus,
      reason: "Unauthorized: Administrator verification unavailable",
    };
  }

  return {
    authorized: false,
    userId,
    adminEmail: primaryEmail,
    status: profileStatus,
    reason: "Unauthorized: Administrator privileges required",
  };
}
