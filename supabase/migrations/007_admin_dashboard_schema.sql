-- ============================================================
-- Migration: 007_admin_dashboard_schema.sql
-- Purpose: Schema updates for Admin Dashboard:
--   1. Account statuses on profiles (active, restricted, banned, deleted)
--   2. Extended listing statuses (restricted, deleted) and reporting flags
--   3. Listing reports table for platform rule violation reviews
--   4. Admin audit logging table
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. Update profiles table ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN status text NOT NULL DEFAULT 'active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone text;
  END IF;
END $$;

-- Drop old check constraint on status if exists, then re-add
DO $$
BEGIN
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
    CHECK (status IN ('active', 'restricted', 'banned', 'deleted'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ── 2. Update listings table ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'is_reported'
  ) THEN
    ALTER TABLE public.listings ADD COLUMN is_reported boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'report_reason'
  ) THEN
    ALTER TABLE public.listings ADD COLUMN report_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.listings ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- Ensure listings check constraint supports extended statuses
DO $$
BEGIN
  ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
  ALTER TABLE public.listings ADD CONSTRAINT listings_status_check
    CHECK (status IN ('available', 'rented', 'maintenance', 'inactive', 'pending_review', 'restricted', 'deleted'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ── 3. Table: listing_reports ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listing_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  reporter_id text,
  reporter_email text,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'action_taken')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_reports_listing_id ON public.listing_reports(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_reports_status ON public.listing_reports(status);

-- ── 4. Table: admin_audit_logs ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id text NOT NULL,
  admin_email text,
  action text NOT NULL,
  target_type text NOT NULL, -- 'user', 'listing', 'report', 'system'
  target_id text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);

-- ── 5. Row Level Security (RLS) ──────────────────────────────
ALTER TABLE public.listing_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Reports policies
DROP POLICY IF EXISTS "Anyone can submit a listing report" ON public.listing_reports;
CREATE POLICY "Anyone can submit a listing report"
  ON public.listing_reports
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view and manage all reports" ON public.listing_reports;
CREATE POLICY "Admins can view and manage all reports"
  ON public.listing_reports
  FOR ALL
  USING (
    (auth.jwt() ->> 'user_role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
  );

-- Audit logs policies (admins only)
DROP POLICY IF EXISTS "Admins can manage audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can manage audit logs"
  ON public.admin_audit_logs
  FOR ALL
  USING (
    (auth.jwt() ->> 'user_role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
  );

-- Profiles admin policy: admins can read and update all profiles; users can read their own
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
    OR (auth.jwt() ->> 'user_role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.clerk_user_id = (auth.jwt() ->> 'sub') AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
    OR (auth.jwt() ->> 'user_role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.clerk_user_id = (auth.jwt() ->> 'sub') AND p.role = 'admin')
  )
  WITH CHECK (
    (
      (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
      AND role = (SELECT role FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub'))
      AND status = (SELECT status FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub'))
    )
    OR (auth.jwt() ->> 'user_role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.clerk_user_id = (auth.jwt() ->> 'sub') AND p.role = 'admin')
  );

NOTIFY pgrst, 'reload schema';
