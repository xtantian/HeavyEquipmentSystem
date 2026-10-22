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

// [IMPORT] 'server-only' is a Next.js security guard ensuring this file is never bundled into client browsers.
import "server-only";

// [IMPORT] Import Supabase JavaScript SDK, Clerk server auth helper, and generated TypeScript database schema.
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import type { Database } from "./types";

// [FUNC] Helper function that resolves the Supabase project endpoint from environment variables.
// Returns undefined if not configured, preventing module-evaluation crashes during build.
export function getSupabaseUrl(): string | undefined {
  const envUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;

  return envUrl ? envUrl.trim() : undefined;
}

// [FUNC] + [RETURN] Resolves the public/anon key from various supported environment variable aliases.
export function getSupabasePublishableKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  );
}

// [FUNC] + [RETURN] Resolves the private service-role key used strictly for privileged server tasks.
export function getSupabaseServiceKey(): string | undefined {
  return (
    process.env.SUPABASE_KEY_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY_ROLE ||
    process.env.SUPABASE_SERVICE_KEY
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
// [FUNC] + [ASYNC] Factory function producing an RLS-scoped Supabase client for user requests.
export async function createSupabaseServerClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabasePublishableKey = getSupabasePublishableKey();

  // [VALIDATION] + [IF] + [ERROR] Ensure required Supabase URL is present at runtime.
  if (!supabaseUrl) {
    throw new Error(
      "Missing required Supabase configuration: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) must be set in your environment."
    );
  }

  // [VALIDATION] + [IF] + [ERROR] Reject obsolete hostname with actionable diagnostic error.
  if (supabaseUrl.includes("ubphrityabunayxrhqkj")) {
    throw new Error(
      "Invalid Supabase URL configured: hostname 'ubphrityabunayxrhqkj' is obsolete. Please update NEXT_PUBLIC_SUPABASE_URL in your deployment settings to your active Supabase project URL."
    );
  }

  // [VALIDATION] + [IF] + [ERROR] Ensure the publishable key is present at runtime before executing queries.
  if (!supabasePublishableKey) {
    throw new Error(
      "Missing required Supabase publishable key: " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set."
    );
  }

  // [AUTH] + [ASYNC] auth() is async in Clerk Core 3 (Next.js App Router).
  const { getToken } = await auth();

  // [FUNC] Dynamic token getter passed to Supabase to automatically refresh JWTs.
  const getAccessToken = async () => {
    try {
      return await getToken();
    } catch {
      return null;
    }
  };

  // Pre-resolve token for explicit header fallback
  const token = await getAccessToken();

  // [DB] + [RETURN] Instantiate and return the typed Supabase client with Bearer token authentication.
  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
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
 * @throws If SUPABASE_KEY_SECRET or SUPABASE_SERVICE_ROLE_KEY is not set.
 *
 * @example
 * ```ts
 * const supabase = createSupabaseServiceClient()
 * await supabase.from("profiles").upsert({ clerk_user_id: "user_xxx", … })
 * ```
 */
// [FUNC] Factory creating an administrative client that bypasses Row Level Security (RLS).
// Used exclusively in webhooks (e.g. Clerk user sync) and background administration tasks.
export function createSupabaseServiceClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseServiceKey = getSupabaseServiceKey();

  // [VALIDATION] + [IF] + [ERROR] Ensure required Supabase URL is present at runtime.
  if (!supabaseUrl) {
    throw new Error(
      "Missing required Supabase configuration: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) must be set in your environment."
    );
  }

  // [VALIDATION] + [IF] + [ERROR] Reject obsolete hostname with actionable diagnostic error.
  if (supabaseUrl.includes("ubphrityabunayxrhqkj")) {
    throw new Error(
      "Invalid Supabase URL configured: hostname 'ubphrityabunayxrhqkj' is obsolete. Please update NEXT_PUBLIC_SUPABASE_URL in your deployment settings to your active Supabase project URL."
    );
  }

  // [VALIDATION] + [IF] + [ERROR] Strictly throw if the secret key is missing; never run elevated jobs unauthenticated.
  if (!supabaseServiceKey) {
    throw new Error(
      "SUPABASE_KEY_SECRET is not set. The service-role Supabase client is unavailable. " +
        "Ensure this environment variable is set in your deployment environment."
    );
  }

  // [DB] + [RETURN] Return the elevated administrative Supabase client instance.
  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      // Service client is stateless; never manages sessions.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
