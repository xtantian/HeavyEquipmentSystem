-- ==============================================================================
-- Rent It Marketplace - Consolidated Database Setup & Hardened RLS Migration
-- Complete Security, Data Integrity, and Schema Consistency
-- Run this script in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. Security Definer Helper Functions (Prevents RLS infinite recursion)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

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

-- 3. Create Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  icon text,
  description text,
  attribute_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create Listings Table
CREATE TABLE IF NOT EXISTS public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL DEFAULT (auth.jwt() ->> 'sub'),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  price_per_day numeric(10, 2) NOT NULL DEFAULT 0 CHECK (price_per_day >= 0),
  location text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  images text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance', 'inactive', 'pending_review', 'restricted', 'deleted')),
  is_reported boolean NOT NULL DEFAULT false,
  report_reason text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all columns exist in listings even if table was previously created
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'category_id') THEN
    ALTER TABLE public.listings ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'is_reported') THEN
    ALTER TABLE public.listings ADD COLUMN is_reported boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'report_reason') THEN
    ALTER TABLE public.listings ADD COLUMN report_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'deleted_at') THEN
    ALTER TABLE public.listings ADD COLUMN deleted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'attributes') THEN
    ALTER TABLE public.listings ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'images') THEN
    ALTER TABLE public.listings ADD COLUMN images text[] NOT NULL DEFAULT '{}'::text[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'status') THEN
    ALTER TABLE public.listings ADD COLUMN status text NOT NULL DEFAULT 'available';
  END IF;
END $$;

-- 5. Create Listing Images Table
CREATE TABLE IF NOT EXISTS public.listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Create Bookings Table with PostgreSQL Exclusion Constraint
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  renter_id text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_price numeric(10, 2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'paid', 'active', 'returned', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_booking_dates CHECK (end_date >= start_date)
);

-- Ensure exclusion constraint exists to prevent concurrent booking race conditions
DO $$
DECLARE
  conflict_count integer;
BEGIN
  -- Check for existing conflicting active/pending reservations
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
    RAISE EXCEPTION 'MIGRATION HALTED: % conflicting active/pending booking pairs found. Resolve these conflicts before applying no_overlapping_active_bookings constraint.', conflict_count;
  END IF;

  -- Drop constraint if exists to ensure authoritative predicate is applied
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_active_bookings'
  ) THEN
    ALTER TABLE public.bookings DROP CONSTRAINT no_overlapping_active_bookings;
  END IF;

  ALTER TABLE public.bookings
    ADD CONSTRAINT no_overlapping_active_bookings
    EXCLUDE USING gist (
      listing_id WITH =,
      daterange(start_date, end_date, '[]') WITH &&
    ) WHERE (status IN ('pending', 'accepted', 'paid', 'active'));

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_active_bookings'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: Constraint no_overlapping_active_bookings was not created in pg_constraint.';
  END IF;
END $$;

-- 7. Create Reviews Table
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  reviewer_id text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Create Profiles Table (Clerk Identity Mirror)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL UNIQUE,
  email text,
  first_name text,
  last_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'manager', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'restricted', 'banned', 'deleted')),
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure profiles has status & phone columns if created previously
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status') THEN
    ALTER TABLE public.profiles ADD COLUMN status text NOT NULL DEFAULT 'active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone') THEN
    ALTER TABLE public.profiles ADD COLUMN phone text;
  END IF;
END $$;

-- 9. Create Listing Reports Table
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

-- 10. Create Admin Audit Logs Table
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id text NOT NULL,
  admin_email text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_listings_category_id ON public.listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_owner_id ON public.listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings(status);
CREATE INDEX IF NOT EXISTS idx_listing_images_listing_id ON public.listing_images(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_listing_id ON public.bookings(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_renter_id ON public.bookings(renter_id);
CREATE INDEX IF NOT EXISTS idx_profiles_clerk_user_id ON public.profiles(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_listing_reports_listing_id ON public.listing_reports(listing_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);

-- 12. Grant Schema Permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- 13. Enable Row Level Security (RLS) on All Tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- 14. Purge ALL Historical / Insecure / Overlapping Policies
DROP POLICY IF EXISTS "Categories are readable by everyone" ON public.categories;
DROP POLICY IF EXISTS "Listings are readable by everyone" ON public.listings;
DROP POLICY IF EXISTS "Allow insert listings" ON public.listings;
DROP POLICY IF EXISTS "Owners can update listings" ON public.listings;
DROP POLICY IF EXISTS "Owners can delete listings" ON public.listings;
DROP POLICY IF EXISTS "Owners and admins can update listings" ON public.listings;
DROP POLICY IF EXISTS "Owners and admins can delete listings" ON public.listings;
DROP POLICY IF EXISTS "Signed-in users can insert own listings" ON public.listings;
DROP POLICY IF EXISTS "Owners can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Owners can delete own listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can update all listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can delete all listings" ON public.listings;
DROP POLICY IF EXISTS "Anyone can select listings" ON public.listings;
DROP POLICY IF EXISTS "Listing images are readable by everyone" ON public.listing_images;
DROP POLICY IF EXISTS "Allow insert listing images" ON public.listing_images;
DROP POLICY IF EXISTS "Allow update listing images" ON public.listing_images;
DROP POLICY IF EXISTS "Allow delete listing images" ON public.listing_images;
DROP POLICY IF EXISTS "Bookings are readable by everyone" ON public.bookings;
DROP POLICY IF EXISTS "Users can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Parties can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Parties can update booking status" ON public.bookings;
DROP POLICY IF EXISTS "Profiles are readable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "Allow insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can submit a listing report" ON public.listing_reports;
DROP POLICY IF EXISTS "Admins can view and manage reports" ON public.listing_reports;
DROP POLICY IF EXISTS "Admins can view and manage all reports" ON public.listing_reports;
DROP POLICY IF EXISTS "Admins can manage audit logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Reviews are readable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "Allow write reviews" ON public.reviews;

-- 15. Secure Authoritative Policies: Categories
-- Public read-only; mutations require administrator
CREATE POLICY "Categories are readable by everyone"
  ON public.categories FOR SELECT
  USING (true);

-- 16. Secure Authoritative Policies: Listings
-- Public users can view only 'available' listings
-- Listing owners can view their own listings (any status)
-- Administrators can view all listings
CREATE POLICY "Listings select policy"
  ON public.listings FOR SELECT
  USING (
    status = 'available'
    OR (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    OR public.is_admin()
  );

-- Authenticated users can insert listings owned by themselves with valid initial status
CREATE POLICY "Listings insert policy"
  ON public.listings FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    AND status IN ('available', 'pending_review')
  );

-- Owners can update their own listings (unless restricted/deleted); admins can update all
CREATE POLICY "Listings update policy"
  ON public.listings FOR UPDATE
  USING (
    (
      (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
      AND status NOT IN ('restricted', 'deleted')
    )
    OR public.is_admin()
  )
  WITH CHECK (
    (
      (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
      AND status NOT IN ('restricted', 'deleted')
    )
    OR public.is_admin()
  );

-- Owners can delete their own listings; admins can delete any listing
CREATE POLICY "Listings delete policy"
  ON public.listings FOR DELETE
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    OR public.is_admin()
  );

-- 17. Secure Authoritative Policies: Listing Images
-- Public can view images; only listing owner or admin can insert/update/delete
CREATE POLICY "Listing images select policy"
  ON public.listing_images FOR SELECT
  USING (true);

CREATE POLICY "Listing images insert policy"
  ON public.listing_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = listing_images.listing_id
        AND (listings.owner_id = (auth.jwt() ->> 'sub') OR public.is_admin())
    )
  );

CREATE POLICY "Listing images update policy"
  ON public.listing_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = listing_images.listing_id
        AND (listings.owner_id = (auth.jwt() ->> 'sub') OR public.is_admin())
    )
  );

CREATE POLICY "Listing images delete policy"
  ON public.listing_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = listing_images.listing_id
        AND (listings.owner_id = (auth.jwt() ->> 'sub') OR public.is_admin())
    )
  );

-- 18. Secure Authoritative Policies: Bookings
-- Renter can view own bookings; owner can view bookings for their listings; admins can view all
CREATE POLICY "Bookings select policy"
  ON public.bookings FOR SELECT
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND renter_id = (auth.jwt() ->> 'sub'))
    OR EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = bookings.listing_id
        AND listings.owner_id = (auth.jwt() ->> 'sub')
    )
    OR public.is_admin()
  );

-- Authenticated renters can create bookings with initial status 'pending' (cannot book own listing)
CREATE POLICY "Bookings insert policy"
  ON public.bookings FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND renter_id = (auth.jwt() ->> 'sub'))
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = bookings.listing_id
        AND listings.owner_id = (auth.jwt() ->> 'sub')
    )
  );

-- Status transitions:
-- Renter can only cancel their own pending reservation.
-- Listing owner can accept or cancel reservation requests.
-- Admin can update to any valid status.
CREATE POLICY "Bookings update policy"
  ON public.bookings FOR UPDATE
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND renter_id = (auth.jwt() ->> 'sub'))
    OR EXISTS (
      SELECT 1 FROM public.listings
      WHERE listings.id = bookings.listing_id
        AND listings.owner_id = (auth.jwt() ->> 'sub')
    )
    OR public.is_admin()
  )
  WITH CHECK (
    (
      (auth.jwt() ->> 'sub' IS NOT NULL AND renter_id = (auth.jwt() ->> 'sub'))
      AND status = 'cancelled'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.listings
        WHERE listings.id = bookings.listing_id
          AND listings.owner_id = (auth.jwt() ->> 'sub')
      )
      AND status IN ('accepted', 'cancelled')
    )
    OR public.is_admin()
  );

-- 19. Secure Authoritative Policies: Profiles
-- Users can view their own profile; admins can view all profiles
CREATE POLICY "Profiles select policy"
  ON public.profiles FOR SELECT
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
    OR public.is_admin()
  );

-- Users can insert their own profile on signup with default role 'customer' and status 'active'
CREATE POLICY "Profiles insert policy"
  ON public.profiles FOR INSERT
  WITH CHECK (
    (
      (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
      AND role = 'customer'
      AND status = 'active'
    )
    OR public.is_admin()
  );

-- Users can update their own profile, but CANNOT self-escalate role or status; admins can update all
CREATE POLICY "Profiles update policy"
  ON public.profiles FOR UPDATE
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
    OR public.is_admin()
  )
  WITH CHECK (
    (
      (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
      AND role = (SELECT role FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub'))
      AND status = (SELECT status FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub'))
    )
    OR public.is_admin()
  );

-- Trigger to guarantee that normal users can NEVER escalate role or un-restrict status
CREATE OR REPLACE FUNCTION public.protect_profile_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.role IS DISTINCT FROM NEW.role) OR (OLD.status IS DISTINCT FROM NEW.status) THEN
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

-- 20. Secure Authoritative Policies: Reviews
CREATE POLICY "Reviews select policy"
  ON public.reviews FOR SELECT
  USING (true);

CREATE POLICY "Reviews insert policy"
  ON public.reviews FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND reviewer_id = (auth.jwt() ->> 'sub'))
  );

-- 21. Secure Authoritative Policies: Reports & Audit Logs
-- Anyone can submit a violation report
CREATE POLICY "Listing reports insert policy"
  ON public.listing_reports FOR INSERT
  WITH CHECK (true);

-- Only admins can view, update, or resolve reports
CREATE POLICY "Listing reports admin policy"
  ON public.listing_reports FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Only admins can view or record audit logs
CREATE POLICY "Admin audit logs policy"
  ON public.admin_audit_logs FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 22. Supabase Storage Bucket for Listing Images
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public listing image access" ON storage.objects;
CREATE POLICY "Public listing image access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-images');

DROP POLICY IF EXISTS "Anyone can upload listing images" ON storage.objects;
CREATE POLICY "Anyone can upload listing images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'listing-images');

DROP POLICY IF EXISTS "Anyone can update listing images" ON storage.objects;
CREATE POLICY "Anyone can update listing images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'listing-images');

-- 23. Seed Marketplace Categories
INSERT INTO public.categories (id, name, slug, icon, description, attribute_schema) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Heavy Equipment', 'heavy-equipment', 'HardHat', 'Excavators, bulldozers, cranes & earthmovers', '[
    {"key": "operating_weight", "label": "Operating Weight", "type": "text", "required": true},
    {"key": "power_source", "label": "Power Source", "type": "select", "options": ["Diesel", "Electric", "Hybrid"], "required": true},
    {"key": "max_reach", "label": "Max Reach / Dig Depth", "type": "text", "required": false}
  ]'::jsonb),
  ('c0000000-0000-0000-0000-000000000002', 'Cars', 'cars', 'Car', 'Sedans, SUVs, electric vehicles & light trucks', '[
    {"key": "make", "label": "Make", "type": "text", "required": true},
    {"key": "model", "label": "Model", "type": "text", "required": true},
    {"key": "year", "label": "Year", "type": "number", "required": true},
    {"key": "transmission", "label": "Transmission", "type": "select", "options": ["Automatic", "Manual"], "required": true},
    {"key": "fuel_type", "label": "Fuel Type", "type": "select", "options": ["Gasoline", "Diesel", "Electric", "Hybrid"], "required": true}
  ]'::jsonb),
  ('c0000000-0000-0000-0000-000000000003', 'Buses', 'buses', 'Bus', 'Commercial shuttles, coaches & transit vans', '[
    {"key": "passenger_capacity", "label": "Passenger Capacity", "type": "number", "required": true},
    {"key": "driver_provided", "label": "Driver Provided", "type": "boolean", "required": false},
    {"key": "ac_equipped", "label": "Air Conditioned", "type": "boolean", "required": false}
  ]'::jsonb),
  ('c0000000-0000-0000-0000-000000000004', 'Motorcycles', 'motorcycles', 'Bike', 'Street bikes, cruisers, scooters & off-road bikes', '[
    {"key": "engine_cc", "label": "Engine Capacity (cc)", "type": "number", "required": true},
    {"key": "helmet_included", "label": "Helmet Included", "type": "boolean", "required": false}
  ]'::jsonb),
  ('c0000000-0000-0000-0000-000000000005', 'Boats', 'boats', 'Ship', 'Motor yachts, speedboats, pontoons & jet skis', '[
    {"key": "length_ft", "label": "Length (ft)", "type": "number", "required": true},
    {"key": "passenger_capacity", "label": "Passenger Capacity", "type": "number", "required": true},
    {"key": "captain_included", "label": "Captain Included", "type": "boolean", "required": false}
  ]'::jsonb),
  ('c0000000-0000-0000-0000-000000000006', 'Generators', 'generators', 'Zap', 'Industrial backup generators & portable silent power', '[
    {"key": "power_output", "label": "Power Output (kVA/kW)", "type": "text", "required": true},
    {"key": "fuel_type", "label": "Fuel Type", "type": "select", "options": ["Diesel", "Gasoline", "Propane", "Solar"], "required": true},
    {"key": "noise_level", "label": "Noise Level (dBA)", "type": "text", "required": false}
  ]'::jsonb),
  ('c0000000-0000-0000-0000-000000000007', 'Cameras', 'cameras', 'Camera', 'Cinema cameras, mirrorless bodies, cinema lenses & lighting', '[
    {"key": "sensor_size", "label": "Sensor Type", "type": "select", "options": ["Full Frame", "Super 35", "APS-C", "Medium Format"], "required": true},
    {"key": "lens_mount", "label": "Lens Mount", "type": "text", "required": false},
    {"key": "max_resolution", "label": "Max Resolution", "type": "select", "options": ["4K", "6K", "8K"], "required": true}
  ]'::jsonb),
  ('c0000000-0000-0000-0000-000000000008', 'Phones', 'phones', 'Smartphone', 'Premium smartphones, satellite phones & production devices', '[
    {"key": "brand", "label": "Brand", "type": "text", "required": true},
    {"key": "model", "label": "Model", "type": "text", "required": true},
    {"key": "storage", "label": "Storage (GB)", "type": "select", "options": ["128GB", "256GB", "512GB", "1TB"], "required": true},
    {"key": "os", "label": "Operating System", "type": "select", "options": ["iOS", "Android"], "required": true}
  ]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  attribute_schema = EXCLUDED.attribute_schema;

-- 24. Refresh PostgREST Schema Cache Immediately
NOTIFY pgrst, 'reload schema';
