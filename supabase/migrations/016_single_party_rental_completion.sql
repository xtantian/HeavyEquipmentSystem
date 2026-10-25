-- ==============================================================================
-- Rent It Marketplace - Migration 016
-- Single-Party Rental Completion & Audit Trail
--
-- 1. Adds completed_by (text) and completed_at (timestamptz) to public.bookings
-- 2. Performance indexes for audit and completion lookups
-- 3. Hardened RLS update policy allowing single-party completion by either
--    the renter OR the equipment host without requiring second-party approval
-- 4. Prevents cancelled bookings from being marked as completed
-- ==============================================================================

BEGIN;

-- ── 1. Add completion audit columns to bookings ──────────────────────────────

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS completed_by text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.bookings.completed_by IS
  'Clerk user ID of the party (renter, equipment host, or administrator) who finalized and completed the rental.';

COMMENT ON COLUMN public.bookings.completed_at IS
  'Authoritative timestamp recorded when the rental transaction was finalized and marked completed.';

-- ── 2. Performance indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bookings_completed_by ON public.bookings(completed_by);
CREATE INDEX IF NOT EXISTS idx_bookings_completed_at ON public.bookings(completed_at DESC);

-- ── 3. Hardened Bookings UPDATE RLS Policy ────────────────────────────────────
-- Allows:
-- A. Renters can cancel their pending/accepted reservations OR complete active/accepted/paid/returned rentals with single confirmation.
-- B. Equipment owners can accept pending requests, decline/cancel pending/accepted requests, OR complete active/accepted/paid/returned rentals with single confirmation.
-- C. Invariant: Cancelled bookings can NEVER be marked completed.
-- D. Admins can transition bookings to any valid status.

DROP POLICY IF EXISTS "Parties can update booking status" ON public.bookings;
DROP POLICY IF EXISTS "Parties can update bookings" ON public.bookings;

CREATE POLICY "Parties can update booking status" ON public.bookings FOR UPDATE
USING (
  (auth.jwt() ->> 'sub' IS NOT NULL AND renter_id = (auth.jwt() ->> 'sub'))
  OR EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = bookings.listing_id
      AND l.owner_id = (auth.jwt() ->> 'sub')
  )
  OR public.is_active_admin()
)
WITH CHECK (
  (
    -- Renters can cancel or complete (cancelled bookings cannot be completed)
    (auth.jwt() ->> 'sub' IS NOT NULL AND renter_id = (auth.jwt() ->> 'sub'))
    AND (
      status = 'cancelled'
      OR (status = 'completed')
    )
  )
  OR (
    -- Equipment owners can accept, cancel/decline, or complete
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = bookings.listing_id
        AND l.owner_id = (auth.jwt() ->> 'sub')
    )
    AND status IN ('accepted', 'cancelled', 'completed')
  )
  OR public.is_active_admin()
);

COMMIT;

NOTIFY pgrst, 'reload schema';
