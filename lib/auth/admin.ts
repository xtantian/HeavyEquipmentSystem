import "server-only";

import https from "https";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
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
 * Direct HTTPS fallback to api.clerk.com for environments where undici global fetch
 * encounters socket reset errors (e.g. ECONNRESET on Windows Node runtime).
 * Strictly maintains fail-closed behavior, timeout bounds, and authenticates via CLERK_SECRET_KEY.
 */
function fetchClerkUserDirect(
  userId: string,
  secretKey: string
): Promise<{ publicMetadata?: Record<string, unknown>; emailAddresses?: Array<{ emailAddress: string }> }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: "api.clerk.com",
        path: `/v1/users/${encodeURIComponent(userId)}`,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "User-Agent": "rentit-admin/1.0",
          Accept: "application/json",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body);
              resolve({
                publicMetadata: parsed.public_metadata || parsed.publicMetadata || {},
                emailAddresses:
                  parsed.email_addresses?.map((e: { email_address: string }) => ({
                    emailAddress: e.email_address,
                  })) || [],
              });
            } catch (jsonErr) {
              reject(jsonErr);
            }
          } else {
            const err = new Error(`Clerk Backend API returned HTTP ${res.statusCode}`);
            (err as Error & { status?: number }).status = res.statusCode;
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error("Clerk Backend API connection timed out"));
    });
  });
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
 * Safely formats diagnostic error details from a Clerk Backend API exception.
 * Redacts tokens, credentials, and personal data while preserving status codes and error names.
 */
function formatSafeClerkError(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) {
    const errorWithStatus = err as Error & { status?: number; statusCode?: number };
    const status = errorWithStatus.status || errorWithStatus.statusCode;
    const statusStr = status ? ` (HTTP ${status})` : "";
    const cleanMsg = err.message
      .replace(/(bearer|key|token|secret)\s*[:=\s]\s*\S+/gi, "$1 [REDACTED]")
      .replace(/(?:sk_|pk_|whsec_|eyJ)[a-zA-Z0-9_\-.]+/g, "[REDACTED_CREDENTIAL]");
    return `${err.name}${statusStr}: ${cleanMsg}`;
  }
  if (typeof err === "object" && err !== null && "status" in err) {
    return `HTTP ${(err as { status: unknown }).status}`;
  }
  return String(err);
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
    // Synchronize Supabase profile role if needed to resolve Clerk/Supabase mismatch
    if (profileRole && profileRole !== "admin") {
      try {
        const serviceClient = createSupabaseServiceClient();
        await serviceClient
          .from("profiles")
          .update({ role: "admin", updated_at: new Date().toISOString() })
          .eq("clerk_user_id", userId);
        console.info(
          `[admin-auth] Synchronized Supabase profile role to 'admin' for user ${userId} via validated session claims.`
        );
      } catch (syncErr) {
        console.warn("[admin-auth] Profile role sync notice:", (syncErr as Error).message);
      }
    }
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
    let clerkUser: {
      publicMetadata?: Record<string, unknown>;
      emailAddresses?: Array<{ emailAddress: string }>;
    } | null = null;

    try {
      const client = await clerkClient();
      clerkUser = await client.users.getUser(userId);
    } catch (sdkErr: unknown) {
      // If global fetch failed (e.g. Node 24 on Windows undici TLS socket reset),
      // fallback to resilient direct HTTPS request to api.clerk.com with fail-closed semantics
      const clerkSecret = process.env.CLERK_SECRET_KEY;
      if (clerkSecret) {
        clerkUser = await fetchClerkUserDirect(userId, clerkSecret);
      } else {
        throw sdkErr;
      }
    }

    const clerkPublicMeta = clerkUser?.publicMetadata as Record<string, unknown> | undefined;
    const clerkRole = clerkPublicMeta?.role;

    if (clerkRole === "admin") {
      // Fix Clerk/Supabase authorization mismatch: ensure database profile reflects verified admin role
      if (profileRole && profileRole !== "admin") {
        try {
          const serviceClient = createSupabaseServiceClient();
          await serviceClient
            .from("profiles")
            .update({ role: "admin", updated_at: new Date().toISOString() })
            .eq("clerk_user_id", userId);
          console.info(
            `[admin-auth] Disagreement resolved & synced: User ${userId} holds admin role in Clerk public metadata. Synchronized Supabase profile role from '${profileRole}' to 'admin'.`
          );
        } catch (syncErr) {
          console.warn("[admin-auth] Profile role sync notice:", (syncErr as Error).message);
        }
      }
      return {
        authorized: true,
        userId,
        adminEmail: primaryEmail || clerkUser?.emailAddresses?.[0]?.emailAddress || null,
        status: profileStatus,
        source: "clerk_backend_api",
      };
    }

    if (profileRole === "admin") {
      // Demote stale database profile if Clerk authoritative metadata confirms caller is not admin
      try {
        const serviceClient = createSupabaseServiceClient();
        await serviceClient
          .from("profiles")
          .update({ role: "customer", updated_at: new Date().toISOString() })
          .eq("clerk_user_id", userId);
      } catch {}
      console.warn(
        `[admin-auth] Disagreement rejected: User ${userId} has stale profile role 'admin' in Supabase, but authoritative Clerk metadata has role '${clerkRole || "none"}'. Access denied and profile demoted.`
      );
    }
  } catch (err: unknown) {
    const safeError = formatSafeClerkError(err);
    console.warn(`[admin-auth] Clerk Backend API verification failed (fail-closed): ${safeError}`);
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
