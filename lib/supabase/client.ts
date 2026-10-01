/**
 * lib/supabase/client.ts
 *
 * Browser-side Supabase client factory.
 *
 * ARCHITECTURE NOTE
 * -----------------
 * This project uses Clerk as the sole identity provider. Supabase Auth is NOT
 * enabled. To authenticate Supabase requests from the browser:
 *
 *   1. Obtain the active Clerk session token via `useAuth().getToken()`.
 *   2. Pass it to `createSupabaseBrowserClient(token)`.
 *   3. Supabase verifies the token against Clerk's JWKS endpoint (configured
 *      in Supabase Dashboard → Authentication → Third Party Auth).
 *   4. RLS policies use `(auth.jwt() ->> 'sub')` to resolve the caller's
 *      Clerk user ID.
 *
 * Typical usage in a client component:
 *
 * ```tsx
 * "use client"
 * import { useAuth } from "@clerk/nextjs"
 * import { createSupabaseBrowserClient } from "@/lib/supabase/client"
 *
 * export function MyComponent() {
 *   const { getToken } = useAuth()
 *
 *   async function fetchMyProfile() {
 *     const token = await getToken()              // raw Clerk session token
 *     const supabase = createSupabaseBrowserClient(token)
 *     const { data, error } = await supabase
 *       .from("profiles")
 *       .select("*")
 *       .single()
 *     // …
 *   }
 * }
 * ```
 *
 * SECURITY
 * --------
 * - Never use the service-role client on the browser. Import `server.ts` only
 *   in Server Components, Route Handlers, and Server Actions.
 * - The publishable (anon) key is safe to expose publicly; it is gated by RLS.
 * - If `clerkToken` is null (unauthenticated call), the client falls back to
 *   anonymous access, which is fully restricted by RLS.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing required Supabase environment variables: " +
      "NEXT_PUBLIC_SUPABASE_URL (or VITE_SUPABASE_URL) and " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) must be set."
  );
}

/**
 * Creates a typed Supabase browser client authenticated with the given Clerk
 * JWT or dynamic token getter.
 *
 * Can receive either:
 * - A dynamic token getter function: `() => getToken()` (recommended, automatically fetches fresh tokens)
 * - A static token string: `token`
 * - `null` for unauthenticated/public queries (RLS will restrict access)
 *
 * @example
 * ```tsx
 * const { getToken } = useAuth()
 * const supabase = useMemo(() => createSupabaseBrowserClient(getToken), [getToken])
 * ```
 */
export function createSupabaseBrowserClient(
  clerkTokenOrGetter: string | (() => Promise<string | null>) | null = null
) {
  const getAccessToken =
    typeof clerkTokenOrGetter === "function"
      ? clerkTokenOrGetter
      : async () => clerkTokenOrGetter ?? null;

  return createClient<Database>(supabaseUrl!, supabasePublishableKey!, {
    accessToken: getAccessToken,
    global: {
      headers:
        typeof clerkTokenOrGetter === "string" && clerkTokenOrGetter
          ? { Authorization: `Bearer ${clerkTokenOrGetter}` }
          : {},
    },
    auth: {
      // Supabase Auth is intentionally disabled. Clerk owns all sessions.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
