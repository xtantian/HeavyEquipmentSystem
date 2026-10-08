-- ==============================================================================
-- Rent It Marketplace - Migration 009
-- Production Lister Reviews & Ratings System
-- 
-- 1. Create public.lister_reviews table with integrity constraints
-- 2. Add performance indexes for lister reputation aggregation
-- 3. Implement hardened Row Level Security (RLS) policies
-- 4. Enable public safe profile read policy for public marketplace viewing
-- ==============================================================================

-- 1. Create lister_reviews table
CREATE TABLE IF NOT EXISTS public.lister_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id text NOT NULL,
  lister_id text NOT NULL,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text CHECK (comment IS NULL OR (char_length(comment) <= 1000)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Anti-abuse constraints:
  -- Prevent users from reviewing themselves
  CONSTRAINT check_no_self_review CHECK (reviewer_id <> lister_id),
  -- One review per completed rental booking
  CONSTRAINT unique_booking_reviewer UNIQUE (booking_id, reviewer_id)
);

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_lister_reviews_lister_id ON public.lister_reviews(lister_id);
CREATE INDEX IF NOT EXISTS idx_lister_reviews_reviewer_id ON public.lister_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_lister_reviews_booking_id ON public.lister_reviews(booking_id);
CREATE INDEX IF NOT EXISTS idx_lister_reviews_created_at ON public.lister_reviews(created_at DESC);

-- 3. Automatic updated_at trigger
DROP TRIGGER IF EXISTS trg_set_lister_reviews_updated_at ON public.lister_reviews;
CREATE TRIGGER trg_set_lister_reviews_updated_at
  BEFORE UPDATE ON public.lister_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 4. Grant schema permissions
GRANT ALL ON TABLE public.lister_reviews TO postgres, anon, authenticated, service_role;

-- 5. Row Level Security (RLS)
ALTER TABLE public.lister_reviews ENABLE ROW LEVEL SECURITY;

-- 5a. Public SELECT policy: Anyone can view public lister reviews
DROP POLICY IF EXISTS "Lister reviews select policy" ON public.lister_reviews;
CREATE POLICY "Lister reviews select policy"
  ON public.lister_reviews FOR SELECT
  USING (true);

-- 5b. Authenticated INSERT policy:
-- Strict authorization requirements:
-- 1. Caller identity must match reviewer_id (from Clerk JWT)
-- 2. Caller cannot review themselves
-- 3. Booking must exist and belong to the reviewer (renter_id = auth.jwt()->>'sub')
-- 4. Booking must belong to the lister's listing
-- 5. Booking status must strictly be 'completed' or 'returned'
DROP POLICY IF EXISTS "Lister reviews insert policy" ON public.lister_reviews;
CREATE POLICY "Lister reviews insert policy"
  ON public.lister_reviews FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND reviewer_id = (auth.jwt() ->> 'sub'))
    AND reviewer_id <> lister_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.listings l ON l.id = b.listing_id
      WHERE b.id = lister_reviews.booking_id
        AND b.renter_id = (auth.jwt() ->> 'sub')
        AND l.owner_id = lister_reviews.lister_id
        AND b.status IN ('returned', 'completed')
    )
  );

-- 5c. Authenticated UPDATE policy:
-- Original reviewer can edit their comment or rating; admins can moderate
DROP POLICY IF EXISTS "Lister reviews update policy" ON public.lister_reviews;
CREATE POLICY "Lister reviews update policy"
  ON public.lister_reviews FOR UPDATE
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND reviewer_id = (auth.jwt() ->> 'sub'))
    OR public.is_admin()
  )
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND reviewer_id = (auth.jwt() ->> 'sub'))
    OR public.is_admin()
  );

-- 5d. Authenticated DELETE policy:
-- Original reviewer or admin can delete
DROP POLICY IF EXISTS "Lister reviews delete policy" ON public.lister_reviews;
CREATE POLICY "Lister reviews delete policy"
  ON public.lister_reviews FOR DELETE
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND reviewer_id = (auth.jwt() ->> 'sub'))
    OR public.is_admin()
  );

-- 6. Safe Public Profiles Read Policy
-- Allow reading public profile data for active users (first_name, last_name, avatar_url, role, created_at)
-- while preserving strict write protection.
DROP POLICY IF EXISTS "Profiles public select policy" ON public.profiles;
CREATE POLICY "Profiles public select policy"
  ON public.profiles FOR SELECT
  USING (
    status = 'active'
    OR (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
    OR public.is_admin()
  );

NOTIFY pgrst, 'reload schema';
