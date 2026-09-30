/**
 * lib/supabase/server.ts
 *
 * Server-side Supabase client factories.
 *
 * IMPORTANT: This module contains `import 'server-only'` guards. It must never
 * be imported by client-side code. The build will fail if you try.
 *
 * ─── Two clients ────────────────────────────────────────────────────────────
 *
 * 1. `createSupabaseServerClient()` — Authenticated user client
 *    Uses the active Clerk session token as the Authorization header.
 *    RLS policies apply, scoped to the calling user.
 *    Use in: Server Components, Route Handlers, Server Actions.
 *
 * 2. `createSupabaseServiceClient()` — Elevated service client
 *    Uses the SUPABASE_KEY_SECRET (service-role key) which bypasses RLS.
 *    Use ONLY in: trusted server contexts (webhook handlers, admin jobs).
 *    NEVER expose this client or its key to browser code.
 *
 * ─── Architecture ───────────────────────────────────────────────────────────
 *
 * Clerk is the sole identity provider. Supabase Auth is NOT used.
 * Supabase verifies Clerk JWTs via Third-Party Auth (JWKS endpoint).
 * RLS policies resolve the caller via: (auth.jwt() ->> 'sub') = clerk_user_id
 *
 * ─── Typical usage ──────────────────────────────────────────────────────────
 *
 * // Server Component
 * import { createSupabaseServerClient } from "@/lib/supabase/server"
 *
 * export default async function ProfilePage() {
 *   const supabase = await createSupabaseServerClient()
 *   const { data } = await supabase.from("profiles").select("*").single()
 *   // …
 * }
 *
 * // Route Handler (webhook, admin)
 * import { createSupabaseServiceClient } from "@/lib/supabase/server"
 *
 * export async function POST(req: Request) {
 *   const supabase = createSupabaseServiceClient()
 *   await supabase.from("profiles").upsert({ … })
 * }
 */

import "server-only";

import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing required Supabase environment variables: " +
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set."
  );
}

/**
 * Creates a typed Supabase server client that forwards the active Clerk session
 * token. RLS policies apply and are scoped to the authenticated user.
 *
 * Must be called inside an async server context (Server Component, Route
 * Handler, or Server Action). Returns a client with anonymous access if no
 * session is active — RLS will restrict all queries in that case.
 *
 * @example
 * ```ts
 * const supabase = await createSupabaseServerClient()
 * const { data } = await supabase.from("profiles").select("*").single()
 * ```
 */
export async function createSupabaseServerClient() {
  // auth() is async in Clerk Core 3 (Next.js App Router).
  const { getToken } = await auth();

  const getAccessToken = async () => {
    try {
      return await getToken();
    } catch {
      return null;
    }
  };

  // Pre-resolve token for explicit header fallback
  const token = await getAccessToken();

  return createClient<Database>(supabaseUrl!, supabasePublishableKey!, {
    accessToken: getAccessToken,
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
    auth: {
      // Supabase Auth is intentionally disabled. Clerk owns all sessions.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Creates an elevated Supabase client that uses the service-role secret key.
 * This client bypasses Row Level Security — use it only where RLS bypass is
 * explicitly required (e.g., webhook handlers that sync Clerk user data).
 *
 * SECURITY: Never call this from a client component or expose the returned
 * client to browser code. The SUPABASE_KEY_SECRET env var must never be
 * prefixed with NEXT_PUBLIC_.
 *
 * @throws If SUPABASE_KEY_SECRET is not set.
 *
 * @example
 * ```ts
 * const supabase = createSupabaseServiceClient()
 * await supabase.from("profiles").upsert({ clerk_user_id: "user_xxx", … })
 * ```
 */
export function createSupabaseServiceClient() {
  const supabaseServiceKey = process.env.SUPABASE_KEY_SECRET;

  if (!supabaseServiceKey) {
    throw new Error(
      "SUPABASE_KEY_SECRET is not set. The service-role Supabase client is unavailable. " +
        "Ensure this environment variable is set in your deployment environment."
    );
  }

  return createClient<Database>(supabaseUrl!, supabaseServiceKey, {
    auth: {
      // Service client is stateless; never manages sessions.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
