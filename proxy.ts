// [IMPORT] Import Clerk authentication middleware and Next.js request type.
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

/**
 * Routes that require an authenticated Clerk session.
 *
 * - "/listings/new" – creating a new listing requires an authenticated user
 * - "/dashboard(.*)" – customer and staff dashboard management
 *
 * All other routes (landing page, browse /listings, item details /listings/[id],
 * inquiry forms, auth pages, and webhooks) are public and do not redirect visitors.
 */
// [DECL] + [INIT] + [ARRAY] Define regex pattern array matching URL paths requiring user login.
const isProtectedRoute = createRouteMatcher([
  "/listings/new(.*)",
  "/dashboard(.*)",
  "/admin(.*)",
]);

// [FUNC] + [ASYNC] + [PARAM] Clerk middleware executed on the edge before any route reaches page components.
export default clerkMiddleware(async (auth, req: NextRequest) => {
  // [AUTH] + [IF] Check if the requested URL path is in the protected list.
  if (isProtectedRoute(req)) {
    // [METHOD] auth.protect() automatically checks the session cookie.
    // If not logged in, it redirects unauthenticated users directly to /sign-in preserving the return URL.
    await auth.protect();
  }
}, {
  // Allow up to 60s tolerance for local development clock skew against Clerk server
  clockSkewInMs: 60000,
});

// [OBJ] Configuration defining which routes Next.js should run this middleware on.
export const config = {
  matcher: [
    // Skip Next.js internals and static assets.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
