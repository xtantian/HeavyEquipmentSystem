-- ============================================================
-- Migration: 001_marketplace_expansion.sql
-- Purpose: Multi-category rental marketplace expansion
-- Run this script in the Supabase Dashboard SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ── 1. Categories Table ──────────────────────────────────────
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

-- ── 2. Listings Table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL,
  price_per_day numeric(10, 2) NOT NULL CHECK (price_per_day >= 0),
  images text[] NOT NULL DEFAULT '{}'::text[],
  location text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance', 'inactive', 'pending_review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Listing Images Table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Bookings Table with No-Overlap Constraint ────────────
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  renter_id text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_price numeric(10, 2) NOT NULL CHECK (total_price >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'paid', 'active', 'returned', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_booking_dates CHECK (end_date >= start_date),
  CONSTRAINT no_overlapping_active_bookings EXCLUDE USING gist (
    listing_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (status IN ('pending', 'accepted', 'paid', 'active'))
);

-- ── 5. Reviews Table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  reviewer_id text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 6. Profiles Table (Clerk Identity Mirror) ────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL UNIQUE,
  email text,
  first_name text,
  last_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'manager', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 7. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_listings_category_id ON public.listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_owner_id ON public.listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings(status);
CREATE INDEX IF NOT EXISTS idx_listing_images_listing_id ON public.listing_images(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_listing_id ON public.bookings(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_renter_id ON public.bookings(renter_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_profiles_clerk_user_id ON public.profiles(clerk_user_id);

-- ── 8. Row Level Security (RLS) ──────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Categories: readable by everyone
DROP POLICY IF EXISTS "Categories are readable by everyone" ON public.categories;
CREATE POLICY "Categories are readable by everyone" ON public.categories FOR SELECT USING (true);

-- Listings: readable if available or own, insertable/updatable only by owner/admin
DROP POLICY IF EXISTS "Listings are readable by everyone" ON public.listings;
CREATE POLICY "Listings are readable by everyone" ON public.listings FOR SELECT USING (
  status = 'available'
  OR (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
  OR (auth.jwt() ->> 'user_role') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
);

DROP POLICY IF EXISTS "Allow insert listings" ON public.listings;
CREATE POLICY "Allow insert listings" ON public.listings FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
  AND status IN ('available', 'pending_review')
);

DROP POLICY IF EXISTS "Owners can update listings" ON public.listings;
CREATE POLICY "Owners can update listings" ON public.listings FOR UPDATE USING (
  (
    (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    AND status NOT IN ('restricted', 'deleted')
  )
  OR (auth.jwt() ->> 'user_role') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
) WITH CHECK (
  (
    (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    AND status NOT IN ('restricted', 'deleted')
  )
  OR (auth.jwt() ->> 'user_role') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
);

DROP POLICY IF EXISTS "Owners can delete listings" ON public.listings;
CREATE POLICY "Owners can delete listings" ON public.listings FOR DELETE USING (
  (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
  OR (auth.jwt() ->> 'user_role') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
);

-- Listing Images: readable by everyone, modifiable only by listing owner or admin
DROP POLICY IF EXISTS "Listing images are readable by everyone" ON public.listing_images;
CREATE POLICY "Listing images are readable by everyone" ON public.listing_images FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert listing images" ON public.listing_images;
CREATE POLICY "Allow insert listing images" ON public.listing_images FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.listings
    WHERE listings.id = listing_images.listing_id
      AND (
        listings.owner_id = (auth.jwt() ->> 'sub')
        OR (auth.jwt() ->> 'user_role') = 'admin'
        OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
      )
  )
);

DROP POLICY IF EXISTS "Allow update listing images" ON public.listing_images;
CREATE POLICY "Allow update listing images" ON public.listing_images FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.listings
    WHERE listings.id = listing_images.listing_id
      AND (
        listings.owner_id = (auth.jwt() ->> 'sub')
        OR (auth.jwt() ->> 'user_role') = 'admin'
        OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
      )
  )
);

DROP POLICY IF EXISTS "Allow delete listing images" ON public.listing_images;
CREATE POLICY "Allow delete listing images" ON public.listing_images FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.listings
    WHERE listings.id = listing_images.listing_id
      AND (
        listings.owner_id = (auth.jwt() ->> 'sub')
        OR (auth.jwt() ->> 'user_role') = 'admin'
        OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
      )
  )
);

-- Bookings: readable by renter, owner, or admin
DROP POLICY IF EXISTS "Bookings are readable by everyone" ON public.bookings;
CREATE POLICY "Bookings are readable by everyone" ON public.bookings FOR SELECT USING (
  (auth.jwt() ->> 'sub' IS NOT NULL AND renter_id = (auth.jwt() ->> 'sub'))
  OR EXISTS (
    SELECT 1 FROM public.listings
    WHERE listings.id = bookings.listing_id
      AND listings.owner_id = (auth.jwt() ->> 'sub')
  )
  OR (auth.jwt() ->> 'user_role') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
);

DROP POLICY IF EXISTS "Users can insert bookings" ON public.bookings;
CREATE POLICY "Users can insert bookings" ON public.bookings FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'sub' IS NOT NULL AND renter_id = (auth.jwt() ->> 'sub'))
  AND status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.listings
    WHERE listings.id = bookings.listing_id
      AND listings.owner_id = (auth.jwt() ->> 'sub')
  )
);

DROP POLICY IF EXISTS "Parties can update booking status" ON public.bookings;
CREATE POLICY "Parties can update booking status" ON public.bookings FOR UPDATE USING (
  (auth.jwt() ->> 'sub' IS NOT NULL AND renter_id = (auth.jwt() ->> 'sub'))
  OR EXISTS (
    SELECT 1 FROM public.listings
    WHERE listings.id = bookings.listing_id
      AND listings.owner_id = (auth.jwt() ->> 'sub')
  )
  OR (auth.jwt() ->> 'user_role') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
) WITH CHECK (
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
  OR (auth.jwt() ->> 'user_role') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
);

-- Reviews: readable by everyone, insertable by authenticated users
DROP POLICY IF EXISTS "Reviews are readable by everyone" ON public.reviews;
CREATE POLICY "Reviews are readable by everyone" ON public.reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow write reviews" ON public.reviews;
CREATE POLICY "Allow write reviews" ON public.reviews FOR INSERT WITH CHECK (
  auth.jwt() ->> 'sub' IS NOT NULL AND reviewer_id = (auth.jwt() ->> 'sub')
);

-- Profiles: readable only by owner or admin
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (
  (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
  OR (auth.jwt() ->> 'user_role') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.clerk_user_id = (auth.jwt() ->> 'sub') AND p.role = 'admin')
);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'customer' AND status = 'active')
  OR (auth.jwt() ->> 'user_role') = 'admin'
);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (
  (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
  OR (auth.jwt() ->> 'user_role') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.clerk_user_id = (auth.jwt() ->> 'sub') AND p.role = 'admin')
) WITH CHECK (
  (
    (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
    AND role = (SELECT role FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub'))
    AND status = (SELECT status FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub'))
  )
  OR (auth.jwt() ->> 'user_role') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.clerk_user_id = (auth.jwt() ->> 'sub') AND p.role = 'admin')
);

-- ── 9. Supabase Storage: listing-images bucket & policies ─────
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

-- ── 10. Seed Categories with Stable Deterministic UUIDs ──────
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

-- ── 11. Seed Initial Marketplace Listings ───────────────────
INSERT INTO public.listings (
  id,
  owner_id,
  category_id,
  title,
  description,
  price_per_day,
  images,
  location,
  attributes,
  status
) VALUES
  (
    'e0000000-0000-0000-0000-000000000001',
    'system_seed',
    'c0000000-0000-0000-0000-000000000001',
    'Caterpillar 320 GC Hydraulic Excavator',
    '20.5-tonne crawler excavator optimized for high-volume trenching, site bulk earthworks and utility installation.',
    450.00,
    ARRAY['https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=1200&q=80'],
    'Heavy Fleet Depot • Transport required',
    '{"operating_weight": "20,500 kg", "power_source": "Diesel", "max_reach": "9.87 m", "security_deposit": 1500}'::jsonb,
    'available'
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    'system_seed',
    'c0000000-0000-0000-0000-000000000002',
    'Tesla Model 3 Long Range AWD (2024)',
    'Dual motor all-wheel drive, premium audio, Autopilot, 340+ mile real-world range. Clean, fully charged on handover.',
    85.00,
    ARRAY['https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=1200&q=80'],
    'Metro Downtown • Free pickup',
    '{"make": "Tesla", "model": "Model 3", "year": 2024, "transmission": "Automatic", "fuel_type": "Electric", "security_deposit": 250}'::jsonb,
    'available'
  ),
  (
    'e0000000-0000-0000-0000-000000000003',
    'system_seed',
    'c0000000-0000-0000-0000-000000000001',
    'CAT D6T XL Track-Type Bulldozer',
    'Engineered for precision earth clearing, heavy site grading, and bulk leveling with VPAT blade and Cat Grade with 3D.',
    520.00,
    ARRAY['https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=1200&q=80'],
    'Logistics Hub North • Transport required',
    '{"operating_weight": "21,300 kg", "power_source": "Diesel", "security_deposit": 1800}'::jsonb,
    'available'
  ),
  (
    'e0000000-0000-0000-0000-000000000004',
    'system_seed',
    'c0000000-0000-0000-0000-000000000005',
    'Sea Ray Sundancer 320 Sports Cruiser',
    'Twin MerCruiser 350HP engines, bow lounge, air-conditioned cabin, wet bar, and Garmin navigation. Perfect for harbor & offshore rentals.',
    750.00,
    ARRAY['https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=1200&q=80'],
    'Marina North Dock • Marina pickup',
    '{"length_ft": 32, "passenger_capacity": 10, "captain_included": true, "fuel_type": "Gasoline", "security_deposit": 1000}'::jsonb,
    'available'
  ),
  (
    'e0000000-0000-0000-0000-000000000005',
    'system_seed',
    'c0000000-0000-0000-0000-000000000006',
    'Cummins 50 kVA Silent Diesel Generator Set',
    'Acoustically insulated canopy with 65 dBA noise level, auto-transfer switch compatible, continuous power rating with 24-hour base tank.',
    160.00,
    ARRAY['https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80'],
    'Central Power Yard • Delivery & setup available',
    '{"power_output": "50 kVA / 40 kW", "fuel_type": "Diesel", "noise_level": "65 dBA @ 7m", "security_deposit": 500}'::jsonb,
    'available'
  ),
  (
    'e0000000-0000-0000-0000-000000000006',
    'system_seed',
    'c0000000-0000-0000-0000-000000000007',
    'Sony FX3 Cinema Line Full-Frame Kit',
    'Includes cage, XLR top handle, 2x 160GB CFexpress Type A cards, 4x NP-FZ100 batteries, and Sony 24-70mm f/2.8 GM II lens.',
    140.00,
    ARRAY['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80'],
    'Arts District • In-store or courier',
    '{"sensor_size": "Full Frame", "lens_mount": "Sony E-mount", "max_resolution": "4K 120p", "security_deposit": 600}'::jsonb,
    'available'
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  price_per_day = EXCLUDED.price_per_day,
  images = EXCLUDED.images,
  location = EXCLUDED.location,
  attributes = EXCLUDED.attributes,
  status = EXCLUDED.status;

-- ── 12. Seed Primary Images into listing_images ──────────────
INSERT INTO public.listing_images (id, listing_id, image_url, is_primary, sort_order)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=1200&q=80', true, 0),
  ('d0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=1200&q=80', true, 0),
  ('d0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=1200&q=80', true, 0),
  ('d0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=1200&q=80', true, 0),
  ('d0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000005', 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80', true, 0),
  ('d0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000006', 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80', true, 0)
ON CONFLICT (id) DO UPDATE SET
  image_url = EXCLUDED.image_url;
