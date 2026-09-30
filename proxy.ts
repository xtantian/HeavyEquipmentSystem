import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

/**
 * Routes that do not require an authenticated Clerk session.
 *
 * - "/" – public landing page
 * - "/sign-in" / "/sign-up" – Clerk-hosted auth UI (catch-all sub-paths)
 * - "/api/webhooks/clerk" – signature-verified webhook; intentionally public so
 *   Clerk can POST without a session token (verified by HMAC signature instead)
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  if (!isPublicRoute(req)) {
    // auth.protect() redirects unauthenticated users to sign-in and returns
    // a 401/404 for unauthenticated API/trpc requests.
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static assets.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
