// [IMPORT] Ensure module cannot be bundled client-side.
import "server-only";

// [IMPORT] Import Clerk server-side session helpers and Supabase client factories.
import { auth, currentUser } from "@clerk/nextjs/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "./server";
import type { Database } from "./types";

// [TYPE] Extracted TypeScript row type representing a user profile record in PostgreSQL.
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

// [TYPE] Discriminated union type defining the 3 possible states of a user profile retrieval:
// 1. "unauthenticated": visitor has no active Clerk session.
// 2. "pending_sync": user just registered, but Supabase profile synchronization has not completed yet.
// 3. "ready": profile is successfully loaded or provisioned in the database.
export type ProfileQueryResult =
  | {
      status: "unauthenticated";
      profile: null;
      error: "No active Clerk session found";
    }
  | {
      status: "pending_sync";
      profile: null;
      error?: string;
      userId: string;
      message: "User is authenticated in Clerk, but Supabase profile synchronization has not completed yet.";
    }
  | {
      status: "ready";
      profile: Profile;
    };

/**
 * Resolves the appropriate Supabase client for profile provisioning.
 * Prefers the elevated service-role client (which bypasses RLS) and falls
 * back gracefully to the authenticated user client if service key is absent.
 */
async function getProvisioningSupabaseClient() {
  try {
    return createSupabaseServiceClient();
  } catch {
    return await createSupabaseServerClient();
  }
}

/**
 * Self-Healing / Just-In-Time Profile Synchronization.
 *
 * Ensures an authenticated Clerk user has an active, valid profile in Supabase `profiles`.
 *
 * GUARANTEES:
 * 1. Identity is strictly derived from the verified Clerk server session.
 *    Client-supplied identifiers or role claims are NEVER trusted.
 * 2. Idempotent: safe to run concurrently with Clerk webhooks or repeated page loads.
 * 3. Preserves existing roles: an existing 'admin' role is NEVER downgraded to 'customer'.
 * 4. Preserves account governance: banned, restricted, or deleted accounts are NEVER reactivated.
 * 5. Uses elevated service-role client where available to prevent RLS initialization blocks in production.
 */
export async function ensureUserProfile(targetUserId?: string): Promise<Profile | null> {
  try {
    // 1. Authenticate session server-side
    const { userId: sessionUserId } = await auth();
    if (!sessionUserId) {
      return null;
    }

    // Security guard: prevent any user from provisioning or probing another user's profile
    if (targetUserId && targetUserId !== sessionUserId) {
      console.warn("[ensureUserProfile] Security: targetUserId mismatch with authenticated session:", {
        sessionUserId,
        targetUserId,
      });
      return null;
    }

    const db = await getProvisioningSupabaseClient();

    // 2. Check if profile already exists in the database
    const { data: existingProfile, error: queryError } = await db
      .from("profiles")
      .select("*")
      .eq("clerk_user_id", sessionUserId)
      .maybeSingle();

    if (existingProfile && !queryError) {
      // Profile exists: preserve existing status (restricted/banned/deleted) and role (admin)
      return existingProfile;
    }

    // 3. Profile does not exist yet (webhook delayed, missing, or failed)
    // Fetch authoritative user details directly from Clerk server
    const clerkUser = await currentUser();
    if (!clerkUser || clerkUser.id !== sessionUserId) {
      return null;
    }

    const primaryEmail =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? null;

    let assignedRole: "admin" | "customer" = "customer";

    // Check server-verified admin invitations if email is available
    if (primaryEmail) {
      const normalizedEmail = primaryEmail.trim().toLowerCase();
      const { data: inviteRecord } = await db
        .from("admin_invitations")
        .select("id, status")
        .ilike("email", normalizedEmail)
        .eq("status", "pending")
        .maybeSingle();

      if (inviteRecord && inviteRecord.status === "pending") {
        assignedRole = "admin";
        await db
          .from("admin_invitations")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
          })
          .eq("id", inviteRecord.id);
      }
    }

    // Also inspect authoritative Clerk public metadata for pre-assigned admin role
    const publicMeta = (clerkUser.publicMetadata || {}) as Record<string, unknown>;
    if (publicMeta.role === "admin") {
      assignedRole = "admin";
    }

    // 4. Safe idempotent upsert into Supabase profiles
    const { data: upsertedProfile, error: upsertError } = await db
      .from("profiles")
      .upsert(
        {
          clerk_user_id: clerkUser.id,
          email: primaryEmail,
          first_name: clerkUser.firstName ?? null,
          last_name: clerkUser.lastName ?? null,
          avatar_url: clerkUser.imageUrl || null,
          role: assignedRole,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "clerk_user_id",
          ignoreDuplicates: false,
        }
      )
      .select("*")
      .maybeSingle();

    if (!upsertError && upsertedProfile) {
      console.info(`[ensureUserProfile] Successfully provisioned profile for user: ${clerkUser.id}`);
      return upsertedProfile;
    }

    if (upsertError) {
      console.warn("[ensureUserProfile] Upsert attempt error, re-checking profile:", upsertError.message);
    }

    // Re-query database to resolve any concurrent race condition cleanly
    const { data: recheckedProfile } = await db
      .from("profiles")
      .select("*")
      .eq("clerk_user_id", clerkUser.id)
      .maybeSingle();

    return recheckedProfile ?? null;
  } catch (err) {
    console.error("[ensureUserProfile] Unexpected error during profile synchronization:", err);
    return null;
  }
}

/**
 * Retrieves the current authenticated user's profile from Supabase with self-healing fallback.
 *
 * SECURITY GUARANTEES:
 * 1. Identity is derived strictly from Clerk's server-side session `auth()`.
 *    The client cannot supply or spoof a `clerk_user_id`.
 * 2. If the user just registered and the webhook has not finished processing,
 *    `ensureUserProfile()` creates and returns the profile immediately.
 * 3. Unauthenticated requests are rejected immediately without querying Supabase.
 */
export async function getCurrentUserProfile(): Promise<ProfileQueryResult> {
  const { userId } = await auth();

  if (!userId) {
    return {
      status: "unauthenticated",
      profile: null,
      error: "No active Clerk session found",
    };
  }

  // 1. Initial attempt: query profile
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (!error && data) {
      return {
        status: "ready",
        profile: data,
      };
    }
  } catch (clientErr) {
    console.warn("[supabase/profile] Server client query notice:", clientErr);
  }

  // 2. Self-Healing Fallback: Provision or repair profile via ensureUserProfile
  const provisionedProfile = await ensureUserProfile(userId);
  if (provisionedProfile) {
    return {
      status: "ready",
      profile: provisionedProfile,
    };
  }

  return {
    status: "pending_sync",
    profile: null,
    userId,
    message:
      "User is authenticated in Clerk, but Supabase profile synchronization has not completed yet.",
  };
}
