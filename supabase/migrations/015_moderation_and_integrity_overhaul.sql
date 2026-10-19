-- ==============================================================================
-- Rent It Marketplace - Migration 015
-- Moderation, Integrity Controls, Reciprocal Reviews & Deletion Hardening
--
-- 1. Updates listings status constraint to support 'shadow_quarantined' and 'archived'
-- 2. Aligns listing_verifications foreign key to ON DELETE CASCADE
-- 3. Idempotently declares public.is_active_admin()
-- 4. Creates public.duplicate_enforcements table with performance composite index
-- 5. Hardens protect_listing_security() (removes unsafe trigger depth bypass, forbids deletion with bookings/reports)
-- 6. Hardens listings DELETE and INSERT RLS policies
-- 7. Creates public.profile_reports table with RLS, triggers, and grants
-- 8. Creates public.renter_reviews table for reciprocal host-to-renter reviews
-- 9. Creates public.preliminary_feedback table for accepted booking coordination
-- 10. Hardens public.bookings INSERT RLS policy to require listings.status = 'available'
-- ==============================================================================

BEGIN;

-- ── 1. Update listings status constraint ──────────────────────────────────────

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_status_check
  CHECK (status IN (
    'available',
    'rented',
    'maintenance',
    'inactive',
    'pending_review',
    'restricted',
    'deleted',
    'archived',
    'shadow_quarantined'
  ));

-- ── 2. Align listing_verifications Foreign Key ────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listing_verifications_listing_id_fkey'
  ) THEN
    ALTER TABLE public.listing_verifications
      DROP CONSTRAINT listing_verifications_listing_id_fkey,
      ADD CONSTRAINT listing_verifications_listing_id_fkey
        FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 3. Idempotent public.is_active_admin() Helper ─────────────────────────────

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE clerk_user_id = (auth.jwt() ->> 'sub')
      AND role = 'admin'
      AND status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated, service_role;

-- ── 4. Table: duplicate_enforcements ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.duplicate_enforcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  strike_count integer NOT NULL DEFAULT 1 CHECK (strike_count >= 1),
  cooldown_until timestamptz,
  reason text NOT NULL,
  target_asset_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duplicate_enforcements_user_id ON public.duplicate_enforcements(user_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_enforcements_user_created ON public.duplicate_enforcements(user_id, created_at DESC);

ALTER TABLE public.duplicate_enforcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view and manage duplicate enforcements" ON public.duplicate_enforcements;
CREATE POLICY "Admins can view and manage duplicate enforcements"
  ON public.duplicate_enforcements FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Users can view own enforcements" ON public.duplicate_enforcements;
CREATE POLICY "Users can view own enforcements"
  ON public.duplicate_enforcements FOR SELECT
  USING (auth.jwt() ->> 'sub' IS NOT NULL AND user_id = (auth.jwt() ->> 'sub'));

CREATE OR REPLACE FUNCTION public.compute_duplicate_enforcement_strike()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_prior_strike integer;
BEGIN
  -- Concurrency serialization: Acquire transaction-level advisory lock on user_id hash.
  -- hashtextextended(NEW.user_id, 0) hashes the text user_id to a 64-bit integer (bigint),
  -- which is natively supported by pg_advisory_xact_lock(bigint).
  -- This serializes concurrent enforcement inserts for the same user across simultaneous transactions,
  -- ensuring cumulative strike calculation and cooldown application cannot race.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id, 0));

  -- Concurrency-safe cumulative calculation: compute strike_count based on user's existing records
  SELECT COALESCE(MAX(strike_count), 0)
  INTO v_prior_strike
  FROM public.duplicate_enforcements
  WHERE user_id = NEW.user_id;

  NEW.strike_count := v_prior_strike + 1;

  -- Automatically enforce 24-hour cooldown on strike >= 2 if not provided
  IF NEW.strike_count >= 2 AND NEW.cooldown_until IS NULL THEN
    NEW.cooldown_until := now() + interval '24 hours';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_duplicate_enforcement_strike ON public.duplicate_enforcements;
CREATE TRIGGER trg_compute_duplicate_enforcement_strike
  BEFORE INSERT ON public.duplicate_enforcements
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_duplicate_enforcement_strike();

REVOKE EXECUTE ON FUNCTION public.compute_duplicate_enforcement_strike() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_duplicate_enforcement_strike() TO postgres, service_role;

REVOKE ALL ON TABLE public.duplicate_enforcements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.duplicate_enforcements TO authenticated;
GRANT ALL ON TABLE public.duplicate_enforcements TO postgres, service_role;

-- ── 5. Hardened Listings Security Trigger (No Trigger-Depth Bypass) ───────────

CREATE OR REPLACE FUNCTION public.protect_listing_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_jwt_sub text;
  v_is_adm boolean;
BEGIN
  v_jwt_sub := auth.jwt() ->> 'sub';
  v_is_adm := public.is_active_admin();

  IF TG_OP = 'INSERT' THEN
    IF v_jwt_sub IS NOT NULL AND NOT v_is_adm THEN
      -- Concurrency-safe database enforcement: reject listing creation if in duplicate cooldown or >= 3 strikes
      IF EXISTS (
        SELECT 1 FROM public.duplicate_enforcements
        WHERE user_id = v_jwt_sub
          AND (
            strike_count >= 3
            OR (cooldown_until IS NOT NULL AND cooldown_until > now())
          )
      ) THEN
        RAISE EXCEPTION 'Listing submission rejected: Your account is in an active duplicate cooldown or requires administrative review.'
          USING ERRCODE = '42501';
      END IF;

      NEW.owner_id := v_jwt_sub;
      NEW.is_verified := false;
      NEW.verified_at := NULL;
      NEW.verified_by := NULL;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF v_jwt_sub IS NOT NULL AND NOT v_is_adm THEN
      IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
        RAISE EXCEPTION 'Immutable field: owner_id cannot be changed.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
        RAISE EXCEPTION 'Unauthorized: Only authorized administrators can update listing verification badge.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
        RAISE EXCEPTION 'Unauthorized: verified_at cannot be updated directly.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
        RAISE EXCEPTION 'Unauthorized: verified_by cannot be updated directly.'
          USING ERRCODE = '42501';
      END IF;

      -- Safe archiving check: Cannot archive if active/pending rentals exist
      IF NEW.status = 'archived' AND OLD.status != 'archived' THEN
        IF EXISTS (
          SELECT 1 FROM public.bookings
          WHERE listing_id = OLD.id
            AND status IN ('pending', 'accepted', 'paid', 'active')
        ) THEN
          RAISE EXCEPTION 'Cannot archive listing while active or pending bookings exist.'
            USING ERRCODE = '23503';
        END IF;
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    -- Universal Invariant: Physical deletion is strictly forbidden if ANY booking records exist,
    -- for ALL callers (including administrators) to preserve financial, review, and legal audit history.
    IF EXISTS (SELECT 1 FROM public.bookings WHERE listing_id = OLD.id) THEN
      RAISE EXCEPTION 'Physical deletion is forbidden when booking records exist. Use status = ''archived'' to safely retire listings.'
        USING ERRCODE = '42501';
    END IF;

    -- Moderate Invariant: Cannot physically delete a listing while active moderation reports exist
    IF EXISTS (
      SELECT 1 FROM public.listing_reports
      WHERE listing_id = OLD.id
        AND status IN ('pending', 'reviewed')
    ) THEN
      RAISE EXCEPTION 'Cannot delete listing while active moderation reports are under review.'
        USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_listing_security ON public.listings;
CREATE TRIGGER trg_protect_listing_security
  BEFORE INSERT OR UPDATE OR DELETE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_listing_security();

REVOKE EXECUTE ON FUNCTION public.protect_listing_security() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_listing_security() TO postgres, authenticated, service_role;

-- ── 6. Listings RLS Policies (DELETE & INSERT) ────────────────────────────────

-- Drop all historical listing delete policies to avoid permissive overlap
DROP POLICY IF EXISTS "Owners can delete listing without bookings" ON public.listings;
DROP POLICY IF EXISTS "Owners and admins can delete listing without bookings" ON public.listings;
DROP POLICY IF EXISTS "Listings delete policy" ON public.listings;
DROP POLICY IF EXISTS "Owners and admins can delete listings" ON public.listings;
DROP POLICY IF EXISTS "Owners can delete listings" ON public.listings;

CREATE POLICY "Owners and admins can delete listing without bookings"
  ON public.listings FOR DELETE
  USING (
    (
      (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
      OR public.is_active_admin()
    )
    AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.listing_id = listings.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.listing_reports r
      WHERE r.listing_id = listings.id
        AND r.status IN ('pending', 'reviewed')
    )
  );

-- Update INSERT policy to support 'shadow_quarantined'
DROP POLICY IF EXISTS "Allow insert listings" ON public.listings;
DROP POLICY IF EXISTS "Listings insert policy" ON public.listings;

CREATE POLICY "Listings insert policy"
  ON public.listings FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    AND status IN ('available', 'pending_review', 'shadow_quarantined')
  );

-- ── 7. Table: profile_reports ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profile_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id text NOT NULL,
  reporter_id text NOT NULL,
  reporter_email text,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'dismissed', 'escalated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_no_self_report CHECK (target_user_id <> reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_reports_target_user_id ON public.profile_reports(target_user_id);
CREATE INDEX IF NOT EXISTS idx_profile_reports_reporter_id ON public.profile_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_profile_reports_status ON public.profile_reports(status);

ALTER TABLE public.profile_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can submit profile reports" ON public.profile_reports;
CREATE POLICY "Authenticated users can submit profile reports"
  ON public.profile_reports FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'sub' IS NOT NULL
    AND reporter_id = (auth.jwt() ->> 'sub')
    AND target_user_id <> (auth.jwt() ->> 'sub')
  );

DROP POLICY IF EXISTS "Reporters can view own reports" ON public.profile_reports;
CREATE POLICY "Reporters can view own reports"
  ON public.profile_reports FOR SELECT
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND reporter_id = (auth.jwt() ->> 'sub'))
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "Admins can manage profile reports" ON public.profile_reports;
CREATE POLICY "Admins can manage profile reports"
  ON public.profile_reports FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

REVOKE ALL ON TABLE public.profile_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.profile_reports TO authenticated;
GRANT ALL ON TABLE public.profile_reports TO postgres, service_role;

DROP TRIGGER IF EXISTS trg_set_profile_reports_updated_at ON public.profile_reports;
CREATE TRIGGER trg_set_profile_reports_updated_at
  BEFORE UPDATE ON public.profile_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── 8. Table: renter_reviews (Reciprocal Reviews) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.renter_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  reviewer_id text NOT NULL,
  renter_id text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text CHECK (comment IS NULL OR (char_length(comment) <= 1000)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_no_self_renter_review CHECK (reviewer_id <> renter_id),
  CONSTRAINT unique_booking_renter_review UNIQUE (booking_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_renter_reviews_renter_id ON public.renter_reviews(renter_id);
CREATE INDEX IF NOT EXISTS idx_renter_reviews_reviewer_id ON public.renter_reviews(reviewer_id);

ALTER TABLE public.renter_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view renter reviews" ON public.renter_reviews;
CREATE POLICY "Public can view renter reviews"
  ON public.renter_reviews FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Equipment owners can review renters of completed bookings" ON public.renter_reviews;
CREATE POLICY "Equipment owners can review renters of completed bookings"
  ON public.renter_reviews FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'sub' IS NOT NULL
    AND reviewer_id = (auth.jwt() ->> 'sub')
    AND reviewer_id <> renter_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.listings l ON l.id = b.listing_id
      WHERE b.id = renter_reviews.booking_id
        AND l.owner_id = (auth.jwt() ->> 'sub')
        AND b.renter_id = renter_reviews.renter_id
        AND b.status IN ('completed', 'returned')
    )
  );

DROP POLICY IF EXISTS "Admins can manage renter reviews" ON public.renter_reviews;
CREATE POLICY "Admins can manage renter reviews"
  ON public.renter_reviews FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

REVOKE ALL ON TABLE public.renter_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.renter_reviews TO anon;
GRANT SELECT, INSERT ON TABLE public.renter_reviews TO authenticated;
GRANT ALL ON TABLE public.renter_reviews TO postgres, service_role;

DROP TRIGGER IF EXISTS trg_set_renter_reviews_updated_at ON public.renter_reviews;
CREATE TRIGGER trg_set_renter_reviews_updated_at
  BEFORE UPDATE ON public.renter_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── 9. Table: preliminary_feedback (Accepted Booking Coordination) ─────────────

CREATE TABLE IF NOT EXISTS public.preliminary_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  submitted_by text NOT NULL,
  communication_rating integer NOT NULL CHECK (communication_rating >= 1 AND communication_rating <= 5),
  notes text CHECK (notes IS NULL OR (char_length(notes) <= 1000)),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_preliminary_feedback UNIQUE (booking_id, submitted_by)
);

ALTER TABLE public.preliminary_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Booking participants can submit preliminary feedback" ON public.preliminary_feedback;
CREATE POLICY "Booking participants can submit preliminary feedback"
  ON public.preliminary_feedback FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'sub' IS NOT NULL
    AND submitted_by = (auth.jwt() ->> 'sub')
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.listings l ON l.id = b.listing_id
      WHERE b.id = preliminary_feedback.booking_id
        AND (b.renter_id = (auth.jwt() ->> 'sub') OR l.owner_id = (auth.jwt() ->> 'sub'))
        AND b.status IN ('accepted', 'paid', 'active')
    )
  );

DROP POLICY IF EXISTS "Booking participants can view own preliminary feedback" ON public.preliminary_feedback;
CREATE POLICY "Booking participants can view own preliminary feedback"
  ON public.preliminary_feedback FOR SELECT
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND submitted_by = (auth.jwt() ->> 'sub'))
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "Admins can manage preliminary feedback" ON public.preliminary_feedback;
CREATE POLICY "Admins can manage preliminary feedback"
  ON public.preliminary_feedback FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

REVOKE ALL ON TABLE public.preliminary_feedback FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.preliminary_feedback TO authenticated;
GRANT ALL ON TABLE public.preliminary_feedback TO postgres, service_role;

-- ── 10. Harden Bookings INSERT RLS Policy ─────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Bookings insert policy" ON public.bookings;

CREATE POLICY "Bookings insert policy"
  ON public.bookings FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND renter_id = (auth.jwt() ->> 'sub'))
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = bookings.listing_id
        AND l.status = 'available'
        AND l.owner_id <> (auth.jwt() ->> 'sub')
    )
  );

-- ── 11. Harden Reports Uniqueness and Reporter SELECT Policies ────────────────

-- 11.1 Reporter SELECT RLS policy on public.listing_reports
DROP POLICY IF EXISTS "Reporters can view own submitted reports" ON public.listing_reports;
CREATE POLICY "Reporters can view own submitted reports"
  ON public.listing_reports FOR SELECT
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND reporter_id = (auth.jwt() ->> 'sub'))
    OR public.is_active_admin()
  );

-- 11.2 Partial unique index on active listing reports to prevent concurrent duplicate submissions
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_reports_active_reporter
  ON public.listing_reports (listing_id, reporter_id)
  WHERE status IN ('pending', 'reviewed');

-- 11.3 Partial unique index on active profile reports
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_reports_active_reporter
  ON public.profile_reports (target_user_id, reporter_id)
  WHERE status IN ('pending', 'under_review');

COMMIT;
