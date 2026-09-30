-- ============================================================
-- Migration: 001_create_profiles
-- Purpose:   Create the `profiles` table that mirrors Clerk user
--            identity data in Supabase.
--
-- Run this migration in your Supabase project using:
--   • Supabase Dashboard → SQL Editor → New query → paste & run
--   • OR: supabase db push  (if using the Supabase CLI)
--
-- Design decisions
-- ──────────────────────────────────────────────────────────────
-- * `clerk_user_id` is the identity column. Clerk is the source
--   of truth; this table stores a local mirror for RLS and joins.
--
-- * The `role` column is stored here (not in Clerk metadata) so
--   RLS policies can evaluate it without a Clerk API round-trip.
--   Role changes must go through the service-role client only.
--
-- * `user.deleted` webhook anonymises PII columns rather than
--   hard-deleting the row. This preserves FK integrity with
--   rental, payment, and inspection history records.
--
-- * All timestamp columns use timestamptz (UTC). Do not store
--   local times in this table.
-- ============================================================

-- Enable pgcrypto for gen_random_uuid() on older Postgres versions.
-- (Postgres 14+ provides gen_random_uuid() natively.)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stable Clerk user identifier (e.g. "user_xxxxxxxxxxxx").
  -- Never null; Clerk guarantees uniqueness across all users.
  clerk_user_id  text        NOT NULL,

  -- PII mirrored from Clerk. Set to NULL by the user.deleted webhook
  -- instead of deleting the row (see design decisions above).
  email          text,
  first_name     text,
  last_name      text,
  avatar_url     text,

  -- Application role. One of: customer, staff, manager, admin.
  -- Defaults to 'customer' on first creation.
  -- Only the service-role client may change this column.
  role           text        NOT NULL DEFAULT 'customer'
                             CHECK (role IN ('customer', 'staff', 'manager', 'admin')),

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Mirror of Clerk user identity. Managed by the /api/webhooks/clerk handler.';

COMMENT ON COLUMN public.profiles.clerk_user_id IS
  'Stable Clerk user ID (e.g. user_xxxxxxxxxxxx). Clerk is the source of truth.';

COMMENT ON COLUMN public.profiles.role IS
  'Application role: customer | staff | manager | admin. '
  'Only the service-role client may change this value.';

-- ── Constraints ──────────────────────────────────────────────────────────────

-- One profile per Clerk user.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_clerk_user_id_key'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_clerk_user_id_key UNIQUE (clerk_user_id);
  END IF;
END $$;

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Primary lookup path: resolve a profile from a Clerk user ID.
CREATE INDEX IF NOT EXISTS profiles_clerk_user_id_idx
  ON public.profiles (clerk_user_id);

-- Filter by email (e.g. admin search, duplicate-check).
CREATE INDEX IF NOT EXISTS profiles_email_idx
  ON public.profiles (email)
  WHERE email IS NOT NULL;

-- Filter by role (e.g. list all staff or admin users).
CREATE INDEX IF NOT EXISTS profiles_role_idx
  ON public.profiles (role);

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ── Policy: read own profile ─────────────────────────────────────────────────
-- A signed-in user may read only their own profile row.
-- The Clerk JWT `sub` claim contains the user's Clerk ID.
-- Supabase Third-Party Auth (configured with Clerk's JWKS URL) verifies the JWT.

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (
    clerk_user_id = (auth.jwt() ->> 'sub')
  );

-- ── Policy: update own profile (limited fields) ───────────────────────────────
-- A user may update their own row, but role changes are blocked:
-- the WITH CHECK condition requires the role value to remain unchanged.
-- This prevents self-privilege-escalation.

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (
    clerk_user_id = (auth.jwt() ->> 'sub')
  )
  WITH CHECK (
    clerk_user_id = (auth.jwt() ->> 'sub')
    -- Role cannot be changed via this policy; service-role client must be used.
    AND role = (
      SELECT role
      FROM public.profiles
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

-- NOTE: INSERT and DELETE policies are intentionally absent.
-- * INSERT is handled exclusively by the webhook handler (service-role client).
-- * DELETE is not permitted from the application; the webhook anonymises PII.

-- The Supabase service-role client bypasses RLS by default.
-- No additional policy is needed for the webhook handler.

-- ── Trigger: keep updated_at current ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Automatically sets updated_at to the current timestamp on every UPDATE.';

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
