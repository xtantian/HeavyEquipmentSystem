import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

/**
 * GET /api/profile/me
 *
 * Authenticated profile lookup endpoint.
 *
 * AUTHORIZATION:
 * - Identity is derived strictly from the caller's verified Clerk session.
 * - Client cannot pass a query parameter or body payload to request another user's profile.
 * - Supabase Row Level Security (RLS) ensures only the authenticated caller's record is returned.
 *
 * RESPONSES:
 * - 401 Unauthorized: caller does not have an active Clerk session
 * - 200 OK (status: "ready"): user profile returned
 * - 200 OK (status: "pending_sync"): authenticated, but Supabase profile has not arrived yet
 */
export async function GET(): Promise<NextResponse> {
  const result = await getCurrentUserProfile();

  if (result.status === "unauthenticated") {
    return NextResponse.json(
      { error: "Unauthorized: No active Clerk session found" },
      { status: 401 }
    );
  }

  return NextResponse.json(result, { status: 200 });
}
