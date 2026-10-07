-- ============================================================
-- Migration: 003_create_rental_requests
-- Purpose:   Create the `rental_requests` table (and `quotes` view)
--            to capture rental inquiries and quote submissions
--            from machine detail pages.
--
-- Run this migration in your Supabase project using:
--   • Supabase Dashboard → SQL Editor → New query → paste & run
--   • OR: supabase db push
--
-- Security & RLS Design
-- ──────────────────────────────────────────────────────────────
-- * Public/anonymous and authenticated visitors are allowed to
--   submit quote requests via the INSERT policy with CHECK (true).
-- * Customers can read their own submissions via Clerk user ID.
-- * Staff, managers, and admins can view and manage all inquiries.
-- * Rates and monetary calculations are stored in numeric(10, 2).
-- ============================================================

-- Ensure pgcrypto extension is active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. Table: rental_requests ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rental_requests (
  id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id          text           NOT NULL,
  equipment_name        text           NOT NULL,
  user_id               text,          -- Clerk user ID if logged in (auth.jwt() ->> 'sub')
  customer_name         text,
  customer_email        text,
  customer_phone        text,
  rental_duration_days  integer        NOT NULL DEFAULT 1 CHECK (rental_duration_days > 0),
  daily_rate            numeric(10, 2) NOT NULL DEFAULT 0 CHECK (daily_rate >= 0),
  estimated_total       numeric(10, 2) NOT NULL DEFAULT 0 CHECK (estimated_total >= 0),
  project_location      text,
  notes                 text,
  status                text           NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  created_at            timestamptz    NOT NULL DEFAULT now(),
  updated_at            timestamptz    NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_requests IS
  'Rental quote requests submitted by prospective renters from machine detail pages.';

COMMENT ON COLUMN public.rental_requests.user_id IS
  'Clerk user identifier of the requester, or NULL if submitted anonymously.';

COMMENT ON COLUMN public.rental_requests.daily_rate IS
  'Commercial daily rate at time of quote request in PHP.';

COMMENT ON COLUMN public.rental_requests.estimated_total IS
  'Estimated rental total based on duration and base rate in PHP.';

-- ── 2. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS rental_requests_equipment_id_idx
  ON public.rental_requests (equipment_id);

CREATE INDEX IF NOT EXISTS rental_requests_user_id_idx
  ON public.rental_requests (user_id);

CREATE INDEX IF NOT EXISTS rental_requests_status_idx
  ON public.rental_requests (status);

CREATE INDEX IF NOT EXISTS rental_requests_created_at_idx
  ON public.rental_requests (created_at DESC);

-- ── 3. Trigger: auto-update updated_at ───────────────────────────────────────

DROP TRIGGER IF EXISTS rental_requests_set_updated_at ON public.rental_requests;
CREATE TRIGGER rental_requests_set_updated_at
  BEFORE UPDATE ON public.rental_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Row Level Security (RLS) ──────────────────────────────────────────────

ALTER TABLE public.rental_requests ENABLE ROW LEVEL SECURITY;

-- INSERT Policy: Allow anyone (guests and authenticated users) to submit quote requests
DROP POLICY IF EXISTS "rental_requests_insert_policy" ON public.rental_requests;
CREATE POLICY "rental_requests_insert_policy"
  ON public.rental_requests
  FOR INSERT
  WITH CHECK (true);

-- SELECT Policy: Users can view their own quotes; staff/admins can view all
DROP POLICY IF EXISTS "rental_requests_select_policy" ON public.rental_requests;
CREATE POLICY "rental_requests_select_policy"
  ON public.rental_requests
  FOR SELECT
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND user_id = (auth.jwt() ->> 'sub'))
    OR public.is_staff_or_admin()
  );

-- UPDATE Policy: Restricted to staff/manager/admin
DROP POLICY IF EXISTS "rental_requests_update_policy" ON public.rental_requests;
CREATE POLICY "rental_requests_update_policy"
  ON public.rental_requests
  FOR UPDATE
  USING (public.is_staff_or_admin())
  WITH CHECK (public.is_staff_or_admin());

-- DELETE Policy: Restricted to staff/manager/admin
DROP POLICY IF EXISTS "rental_requests_delete_policy" ON public.rental_requests;
CREATE POLICY "rental_requests_delete_policy"
  ON public.rental_requests
  FOR DELETE
  USING (public.is_staff_or_admin());

-- ── 5. Compatibility View: quotes ────────────────────────────────────────────

CREATE OR REPLACE VIEW public.quotes AS
  SELECT * FROM public.rental_requests;

COMMENT ON VIEW public.quotes IS
  'Convenience alias view for rental_requests.';
