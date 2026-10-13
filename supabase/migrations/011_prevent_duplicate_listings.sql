-- Migration: 011_prevent_duplicate_listings.sql
-- Description: Adds persistent inventory identity (asset_identifier) to listings
-- and enforces owner-scoped uniqueness to prevent duplicate listings of the same physical item.

BEGIN;

-- 1. Add asset_identifier column to public.listings if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'asset_identifier'
  ) THEN
    ALTER TABLE public.listings ADD COLUMN asset_identifier text;
  END IF;
END $$;

-- 2. Create partial unique index on owner_id and normalized asset_identifier
-- This guarantees that an owner cannot create multiple active/non-deleted listings
-- for the exact same physical asset (VIN, serial number, plate number, or inventory tag).
-- Concurrency race conditions will trigger a 23505 unique violation handled gracefully by the server.
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_owner_asset_identifier
ON public.listings (owner_id, lower(trim(asset_identifier)))
WHERE asset_identifier IS NOT NULL AND status != 'deleted';

-- 3. Index asset_identifier for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_listings_asset_identifier
ON public.listings (lower(trim(asset_identifier)))
WHERE asset_identifier IS NOT NULL;

COMMIT;
