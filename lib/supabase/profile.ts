import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "./server";
import type { Database } from "./types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type ProfileQueryResult =
  | {
      status: "unauthenticated";
      profile: null;
      error: "No active Clerk session found";
    }
  | {
      status: "pending_sync";
      profile: null;
      userId: string;
      message: "User is authenticated in Clerk, but Supabase profile synchronization has not completed yet.";
    }
  | {
      status: "ready";
      profile: Profile;
    };

/**
 * Retrieves the current authenticated user's profile from Supabase.
 *
 * SECURITY GUARANTEES:
 * 1. Identity is derived strictly from Clerk's server-side session `auth()`.
 *    The client cannot supply or spoof a `clerk_user_id`.
 * 2. Supabase evaluates Row Level Security (RLS) on the profiles table:
 *    `clerk_user_id = (auth.jwt() ->> 'sub')`.
 *    User A can NEVER read User B's profile.
 * 3. Unauthenticated requests are rejected immediately without querying Supabase.
 *
 * DEVELOPMENT FALLBACK (Phase 8):
 * If a user signs up and immediately accesses the application before the Clerk
 * webhook finishes processing, this function returns `{ status: "pending_sync" }`.
 * It never crashes, never fabricates fake profile data, and never grants unauthorized
 * access.
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

  const supabase = await createSupabaseServerClient();

  // Query profiles using the authenticated client.
  // Note: RLS strictly enforces `clerk_user_id = (auth.jwt() ->> 'sub')`.
  // Even if .eq is omitted, RLS ensures only the caller's row is returned.
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    // If the table doesn't exist yet (migration not applied) or temporary DB failure,
    // handle gracefully without throwing an unhandled exception.
    console.error("[supabase/profile] Error querying profile:", error.message);
    return {
      status: "pending_sync",
      profile: null,
      userId,
      message:
        "User is authenticated in Clerk, but Supabase profile synchronization has not completed yet.",
    };
  }

  if (!data) {
    // Webhook has not delivered user.created yet or is in transit.
    return {
      status: "pending_sync",
      profile: null,
      userId,
      message:
        "User is authenticated in Clerk, but Supabase profile synchronization has not completed yet.",
    };
  }

  return {
    status: "ready",
    profile: data,
  };
}
