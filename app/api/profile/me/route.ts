// [IMPORT] Import Next.js server response utility and the profile retrieval helper.
import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/profile";

// [DECL] Route segment configuration option.
// "force-dynamic" instructs Next.js to always render this API route dynamically on every incoming request,
// ensuring it never serves stale cached profile data or crashes during static build pre-rendering.
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
// [FUNC] + [ASYNC] Route Handler for HTTP GET requests to /api/profile/me.
export async function GET(): Promise<NextResponse> {
  // [AUTH] + [ASYNC] Resolve authenticated user profile securely on the server.
  const result = await getCurrentUserProfile();

  // [IF] + [RETURN] + [OBJ] If the caller has no active login session, send HTTP 401 Unauthorized.
  if (result.status === "unauthenticated") {
    return NextResponse.json(
      { error: "Unauthorized: No active Clerk session found" },
      { status: 401 }
    );
  }

  // [RETURN] + [OBJ] Return the authenticated profile with HTTP 200 OK.
  return NextResponse.json(result, { status: 200 });
}
