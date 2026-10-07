CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text DEFAULT (auth.jwt() ->> 'sub'),
  category_id text,
  title text NOT NULL,
  description text NOT NULL,
  price_per_day numeric NOT NULL DEFAULT 0,
  location text NOT NULL,
  attributes jsonb DEFAULT '{}'::jsonb,
  images text[] DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can select listings" ON public.listings;
DROP POLICY IF EXISTS "Listings are readable by everyone" ON public.listings;
DROP POLICY IF EXISTS "Listings select policy" ON public.listings;
CREATE POLICY "Anyone can select listings"
  ON public.listings
  FOR SELECT
  USING (
    status = 'available'
    OR (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    OR (auth.jwt() ->> 'user_role') = 'admin'
  );

DROP POLICY IF EXISTS "Signed-in users can insert own listings" ON public.listings;
DROP POLICY IF EXISTS "Allow insert listings" ON public.listings;
DROP POLICY IF EXISTS "Listings insert policy" ON public.listings;
CREATE POLICY "Signed-in users can insert own listings"
  ON public.listings
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub') IS NOT NULL
    AND (owner_id = (auth.jwt() ->> 'sub'))
    AND status IN ('available', 'pending_review')
  );

DROP POLICY IF EXISTS "Owners can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Owners can update listings" ON public.listings;
DROP POLICY IF EXISTS "Owners and admins can update listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can update all listings" ON public.listings;
DROP POLICY IF EXISTS "Listings update policy" ON public.listings;
CREATE POLICY "Owners can update own listings"
  ON public.listings
  FOR UPDATE
  USING (
    (
      (auth.jwt() ->> 'sub') = owner_id
      AND status NOT IN ('restricted', 'deleted')
    )
    OR (auth.jwt() ->> 'user_role') = 'admin'
  )
  WITH CHECK (
    (
      (auth.jwt() ->> 'sub') = owner_id
      AND status NOT IN ('restricted', 'deleted')
    )
    OR (auth.jwt() ->> 'user_role') = 'admin'
  );

DROP POLICY IF EXISTS "Owners can delete own listings" ON public.listings;
DROP POLICY IF EXISTS "Owners can delete listings" ON public.listings;
DROP POLICY IF EXISTS "Owners and admins can delete listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can delete all listings" ON public.listings;
DROP POLICY IF EXISTS "Listings delete policy" ON public.listings;
CREATE POLICY "Owners can delete own listings"
  ON public.listings
  FOR DELETE
  USING (
    (auth.jwt() ->> 'sub') = owner_id
    OR (auth.jwt() ->> 'user_role') = 'admin'
  );

NOTIFY pgrst, 'reload schema';
