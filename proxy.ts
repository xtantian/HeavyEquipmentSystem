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
const isProtectedRoute = createRouteMatcher([
  "/listings/new(.*)",
  "/dashboard(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  if (isProtectedRoute(req)) {
    // auth.protect() redirects unauthenticated users to sign-in
    await auth.protect();
  }
}, {
  // Allow up to 60s tolerance for local development clock skew against Clerk server
  clockSkewInMs: 60000,
});

export const config = {
  matcher: [
    // Skip Next.js internals and static assets.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
