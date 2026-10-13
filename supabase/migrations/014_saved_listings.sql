-- ============================================================
-- Migration: 014_saved_listings.sql
-- Purpose:   Saved (favorited) listings feature.
--
-- SECURITY ARCHITECTURE:
-- 1. Identity is derived strictly from Clerk via auth.jwt() ->> 'sub'.
-- 2. RLS ensures users can only see and manage their own saved listings.
-- 3. A unique constraint at the DB level prevents duplicate saves
--    regardless of race conditions or duplicate client requests.
-- 4. Soft-deleted or unavailable listings are handled at query time;
--    the FK ON DELETE CASCADE removes orphaned saves automatically
--    if the listing itself is hard-deleted.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.saved_listings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,   -- Clerk user ID (auth.jwt() ->> 'sub')
  listing_id  uuid        NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate saves at the database level
  CONSTRAINT saved_listings_user_listing_unique UNIQUE (user_id, listing_id)
);

COMMENT ON TABLE public.saved_listings IS
  'Stores which listings each authenticated user has saved/favorited. '
  'Identity is the Clerk user ID stored in user_id. '
  'The unique constraint prevents duplicate saves regardless of client behaviour.';

-- Indexes for efficient per-user and per-listing lookups
CREATE INDEX IF NOT EXISTS idx_saved_listings_user_id     ON public.saved_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_listings_listing_id  ON public.saved_listings(listing_id);

ALTER TABLE public.saved_listings ENABLE ROW LEVEL SECURITY;

-- Users can only read their own saved listings
DROP POLICY IF EXISTS "Users can view own saved listings" ON public.saved_listings;
CREATE POLICY "Users can view own saved listings"
  ON public.saved_listings
  FOR SELECT
  USING (
    (auth.jwt() ->> 'sub') IS NOT NULL
    AND user_id = (auth.jwt() ->> 'sub')
  );

-- Users can save listings (insert) only for themselves
DROP POLICY IF EXISTS "Users can save listings" ON public.saved_listings;
CREATE POLICY "Users can save listings"
  ON public.saved_listings
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub') IS NOT NULL
    AND user_id = (auth.jwt() ->> 'sub')
  );

-- Users can remove only their own saved listings
DROP POLICY IF EXISTS "Users can remove own saved listings" ON public.saved_listings;
CREATE POLICY "Users can remove own saved listings"
  ON public.saved_listings
  FOR DELETE
  USING (
    (auth.jwt() ->> 'sub') IS NOT NULL
    AND user_id = (auth.jwt() ->> 'sub')
  );

-- Table grants for postgREST roles
GRANT ALL ON TABLE public.saved_listings TO postgres, service_role;
GRANT SELECT, INSERT, DELETE ON public.saved_listings TO authenticated;

NOTIFY pgrst, 'reload schema';
