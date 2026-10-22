// [IMPORT] Ensure module cannot be bundled client-side.
import "server-only";

// [IMPORT] Import Clerk server-side session helper and authenticated Supabase client factory.
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "./server";
import type { Database } from "./types";

// [TYPE] Extracted TypeScript row type representing a user profile record in PostgreSQL.
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

// [TYPE] Discriminated union type defining the 3 possible states of a user profile retrieval:
// 1. "unauthenticated": visitor has no active Clerk session.
// 2. "pending_sync": user just registered, but the webhook has not finished writing to Supabase.
// 3. "ready": profile is successfully loaded from the database.
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
// [FUNC] + [ASYNC] Server-side function that retrieves the current authenticated caller's profile.
export async function getCurrentUserProfile(): Promise<ProfileQueryResult> {
  // [AUTH] + [ASYNC] Derive user identity directly from HTTP cookies via Clerk.
  const { userId } = await auth();

  // [IF] + [RETURN] Immediately reject if there is no logged-in user.
  if (!userId) {
    return {
      status: "unauthenticated",
      profile: null,
      error: "No active Clerk session found",
    };
  }

  // [DB] + [ASYNC] Create an authenticated Supabase client for this specific user.
  const supabase = await createSupabaseServerClient();

  // Query profiles using the authenticated client.
  // Note: RLS strictly enforces `clerk_user_id = (auth.jwt() ->> 'sub')`.
  // Even if .eq is omitted, RLS ensures only the caller's row is returned.
  // [DB] + [METHOD] Execute a SELECT query on public.profiles restricted to the caller's Clerk ID.
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  // [IF] + [RETURN] Handle database query failures or missing schema without crashing.
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

  // [IF] + [RETURN] Handle newly registered users whose Clerk webhook event is still processing.
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

  // [RETURN] Return the verified user profile row with "ready" status.
  return {
    status: "ready",
    profile: data,
  };
}
