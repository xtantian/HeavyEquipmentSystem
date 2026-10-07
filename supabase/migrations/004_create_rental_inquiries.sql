-- ============================================================
-- Migration: 004_create_rental_inquiries
-- Purpose:   Create the `rental_inquiries` table to capture
--            heavy equipment rental inquiry submissions directly
--            from machine detail cards, URL parameters, and inquiry views.
--
-- Run this migration in your Supabase project using:
--   • Supabase Dashboard → SQL Editor → New query → paste & run
--   • OR: supabase db push
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.rental_inquiries (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_name    text        NOT NULL,
  full_name         text        NOT NULL,
  email             text        NOT NULL,
  phone             text        NOT NULL,
  project_location  text,
  start_date        text,
  end_date          text,
  message           text,
  rental_city       text,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'contacted', 'quoted', 'approved', 'rejected', 'completed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_inquiries IS
  'Rental inquiries submitted from the Heavy Equipment Rental Inquiry Form.';

COMMENT ON COLUMN public.rental_inquiries.equipment_name IS
  'Selected machinery name (e.g., Excavator (Backhoe), Mobile Crane, Dump Truck).';

COMMENT ON COLUMN public.rental_inquiries.full_name IS
  'Full name of the inquiring contractor or customer.';

COMMENT ON COLUMN public.rental_inquiries.email IS
  'Contact email address.';

COMMENT ON COLUMN public.rental_inquiries.phone IS
  'Contact phone number (Philippine Mobile, WhatsApp, or Viber).';

COMMENT ON COLUMN public.rental_inquiries.project_location IS
  'Job site location or target city for equipment deployment.';

COMMENT ON COLUMN public.rental_inquiries.start_date IS
  'Target rental start date.';

COMMENT ON COLUMN public.rental_inquiries.message IS
  'Additional notes, site requirements, or project details.';

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS rental_inquiries_equipment_name_idx
  ON public.rental_inquiries (equipment_name);

CREATE INDEX IF NOT EXISTS rental_inquiries_email_idx
  ON public.rental_inquiries (email);

CREATE INDEX IF NOT EXISTS rental_inquiries_status_idx
  ON public.rental_inquiries (status);

CREATE INDEX IF NOT EXISTS rental_inquiries_created_at_idx
  ON public.rental_inquiries (created_at DESC);

-- ── Trigger: auto-update updated_at ─────────────────────────────────────────

DROP TRIGGER IF EXISTS rental_inquiries_set_updated_at ON public.rental_inquiries;
CREATE TRIGGER rental_inquiries_set_updated_at
  BEFORE UPDATE ON public.rental_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security (RLS) ──────────────────────────────────────────────

ALTER TABLE public.rental_inquiries ENABLE ROW LEVEL SECURITY;

-- Allow ANYONE (including unauthenticated anonymous 'anon' role) to submit inquiries
DROP POLICY IF EXISTS "rental_inquiries_insert_policy" ON public.rental_inquiries;
CREATE POLICY "rental_inquiries_insert_policy"
  ON public.rental_inquiries
  FOR INSERT
  TO public, anon, authenticated
  WITH CHECK (true);

-- Allow reading inquiries only for staff and admins
DROP POLICY IF EXISTS "rental_inquiries_select_policy" ON public.rental_inquiries;
CREATE POLICY "rental_inquiries_select_policy"
  ON public.rental_inquiries
  FOR SELECT
  TO authenticated
  USING (public.is_staff_or_admin());

-- Allow staff and administrators to update or manage inquiries
DROP POLICY IF EXISTS "rental_inquiries_update_policy" ON public.rental_inquiries;
CREATE POLICY "rental_inquiries_update_policy"
  ON public.rental_inquiries
  FOR UPDATE
  USING (public.is_staff_or_admin())
  WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS "rental_inquiries_delete_policy" ON public.rental_inquiries;
CREATE POLICY "rental_inquiries_delete_policy"
  ON public.rental_inquiries
  FOR DELETE
  USING (public.is_staff_or_admin());
