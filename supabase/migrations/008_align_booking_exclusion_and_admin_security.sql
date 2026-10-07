-- ==============================================================================
-- Rent It Marketplace - Migration 008
-- 1. Align PostgreSQL Booking Exclusion Constraint with Application Reservation Statuses
-- 2. Remove untrusted metadata from public.is_admin() (Use profiles.role & app_metadata)
-- 3. Add database trigger preventing unauthorized profile role/status elevation
-- ==============================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. Hardened public.is_admin() Function
-- Authoritative check: relies strictly on public.profiles.role = 'admin' (database-enforced)
-- or server-controlled app_metadata (never client-writable user_metadata).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE clerk_user_id = (auth.jwt() ->> 'sub')
      AND role = 'admin'
  ) OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- 3. Trigger to prevent normal users from modifying role or status in public.profiles
CREATE OR REPLACE FUNCTION public.protect_profile_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If role or status is being modified
  IF (OLD.role IS DISTINCT FROM NEW.role) OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    -- Only verified administrators may change roles or account status
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Normal users cannot modify role or status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_roles ON public.profiles;
CREATE TRIGGER trg_protect_profile_roles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_roles();

-- 4. Align Booking Exclusion Constraint
-- Reservation-holding status set: ('pending', 'accepted', 'paid', 'active')
-- This prevents race conditions where concurrent requests attempt to reserve overlapping dates.
--
-- Strict Error Handling: If existing overlapping bookings prevent constraint creation,
-- the migration intentionally ABORTS and FAILS with an explicit exception detailing the conflict.
DO $$
DECLARE
  conflict_count integer;
BEGIN
  -- A. Pre-check for existing conflicting active/pending reservations
  SELECT count(*)
  INTO conflict_count
  FROM (
    SELECT 1
    FROM public.bookings b1
    JOIN public.bookings b2
      ON b1.listing_id = b2.listing_id
     AND b1.id < b2.id
    WHERE b1.status IN ('pending', 'accepted', 'paid', 'active')
      AND b2.status IN ('pending', 'accepted', 'paid', 'active')
      AND daterange(b1.start_date, b1.end_date, '[]') && daterange(b2.start_date, b2.end_date, '[]')
  ) conflicts;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION HALTED: % conflicting active/pending booking pairs found. Resolve these conflicts before applying no_overlapping_active_bookings constraint. Run diagnostic query: SELECT b1.id, b2.id, b1.listing_id, b1.start_date, b1.end_date FROM public.bookings b1 JOIN public.bookings b2 ON b1.listing_id = b2.listing_id AND b1.id < b2.id WHERE b1.status IN (''pending'',''accepted'',''paid'',''active'') AND b2.status IN (''pending'',''accepted'',''paid'',''active'') AND daterange(b1.start_date, b1.end_date, ''[]'') && daterange(b2.start_date, b2.end_date, ''[]'');', conflict_count;
  END IF;

  -- B. Drop constraint if it already exists with an older/different predicate
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_active_bookings'
  ) THEN
    ALTER TABLE public.bookings DROP CONSTRAINT no_overlapping_active_bookings;
  END IF;

  -- C. Add authoritative exclusion constraint matching application logic
  ALTER TABLE public.bookings
    ADD CONSTRAINT no_overlapping_active_bookings
    EXCLUDE USING gist (
      listing_id WITH =,
      daterange(start_date, end_date, '[]') WITH &&
    ) WHERE (status IN ('pending', 'accepted', 'paid', 'active'));

  -- D. Strictly verify constraint registration in pg_constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_active_bookings'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: Constraint no_overlapping_active_bookings was not created in pg_constraint.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- VERIFICATION QUERY (Run in Supabase SQL Editor to confirm installation):
-- SELECT conname, pg_get_constraintdef(c.oid)
-- FROM pg_constraint c
-- WHERE conname = 'no_overlapping_active_bookings';
-- ==============================================================================
