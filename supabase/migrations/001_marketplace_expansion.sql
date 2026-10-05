-- Migration: 001_marketplace_expansion.sql
-- Multi-category rental marketplace expansion

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Categories table
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

-- Listings table with JSONB attributes
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

-- Bookings table with no-overlap constraint
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
  ) WHERE (status NOT IN ('cancelled', 'completed', 'returned'))
);

-- Reviews table
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  reviewer_id text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Listing Images table
CREATE TABLE IF NOT EXISTS public.listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_listings_category_id ON public.listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_owner_id ON public.listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_listing_id ON public.bookings(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_renter_id ON public.bookings(renter_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);

-- RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are readable by everyone" ON public.categories FOR SELECT USING (true);

CREATE POLICY "Listings are readable by everyone" ON public.listings FOR SELECT USING (true);
CREATE POLICY "Owners can insert listings" ON public.listings FOR INSERT WITH CHECK (auth.uid()::text = owner_id OR true);
CREATE POLICY "Owners can update listings" ON public.listings FOR UPDATE USING (auth.uid()::text = owner_id);
CREATE POLICY "Owners can delete listings" ON public.listings FOR DELETE USING (auth.uid()::text = owner_id);

CREATE POLICY "Users can view relevant bookings" ON public.bookings FOR SELECT USING (
  renter_id = auth.uid()::text OR 
  listing_id IN (SELECT id FROM public.listings WHERE owner_id = auth.uid()::text)
);
CREATE POLICY "Users can insert bookings" ON public.bookings FOR INSERT WITH CHECK (
  renter_id = auth.uid()::text OR true
);
CREATE POLICY "Parties can update booking status" ON public.bookings FOR UPDATE USING (
  renter_id = auth.uid()::text OR 
  listing_id IN (SELECT id FROM public.listings WHERE owner_id = auth.uid()::text)
);

CREATE POLICY "Reviews are readable by everyone" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Renters can write reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid()::text = reviewer_id OR true);

-- Seed Categories
INSERT INTO public.categories (name, slug, icon, description, attribute_schema) VALUES
  ('Heavy Equipment', 'heavy-equipment', 'HardHat', 'Excavators, bulldozers, cranes & earthmovers', '[
    {"key": "operating_weight", "label": "Operating Weight", "type": "text", "required": true},
    {"key": "power_source", "label": "Power Source", "type": "select", "options": ["Diesel", "Electric", "Hybrid"], "required": true},
    {"key": "max_reach", "label": "Max Reach / Dig Depth", "type": "text", "required": false}
  ]'::jsonb),
  ('Cars', 'cars', 'Car', 'Sedans, SUVs, electric vehicles & light trucks', '[
    {"key": "make", "label": "Make", "type": "text", "required": true},
    {"key": "model", "label": "Model", "type": "text", "required": true},
    {"key": "year", "label": "Year", "type": "number", "required": true},
    {"key": "transmission", "label": "Transmission", "type": "select", "options": ["Automatic", "Manual"], "required": true},
    {"key": "fuel_type", "label": "Fuel Type", "type": "select", "options": ["Gasoline", "Diesel", "Electric", "Hybrid"], "required": true}
  ]'::jsonb),
  ('Buses', 'buses', 'Bus', 'Commercial shuttles, coaches & transit vans', '[
    {"key": "passenger_capacity", "label": "Passenger Capacity", "type": "number", "required": true},
    {"key": "driver_provided", "label": "Driver Provided", "type": "boolean", "required": false},
    {"key": "ac_equipped", "label": "Air Conditioned", "type": "boolean", "required": false}
  ]'::jsonb),
  ('Motorcycles', 'motorcycles', 'Bike', 'Street bikes, cruisers, scooters & off-road bikes', '[
    {"key": "engine_cc", "label": "Engine Capacity (cc)", "type": "number", "required": true},
    {"key": "helmet_included", "label": "Helmet Included", "type": "boolean", "required": false}
  ]'::jsonb),
  ('Boats', 'boats', 'Ship', 'Motor yachts, speedboats, pontoons & jet skis', '[
    {"key": "length_ft", "label": "Length (ft)", "type": "number", "required": true},
    {"key": "passenger_capacity", "label": "Passenger Capacity", "type": "number", "required": true},
    {"key": "captain_included", "label": "Captain Included", "type": "boolean", "required": false}
  ]'::jsonb),
  ('Generators', 'generators', 'Zap', 'Industrial backup generators & portable silent power', '[
    {"key": "power_output", "label": "Power Output (kVA/kW)", "type": "text", "required": true},
    {"key": "fuel_type", "label": "Fuel Type", "type": "select", "options": ["Diesel", "Gasoline", "Propane", "Solar"], "required": true},
    {"key": "noise_level", "label": "Noise Level (dBA)", "type": "text", "required": false}
  ]'::jsonb),
  ('Cameras', 'cameras', 'Camera', 'Cinema cameras, mirrorless bodies, cinema lenses & lighting', '[
    {"key": "sensor_size", "label": "Sensor Type", "type": "select", "options": ["Full Frame", "Super 35", "APS-C", "Medium Format"], "required": true},
    {"key": "lens_mount", "label": "Lens Mount", "type": "text", "required": false},
    {"key": "max_resolution", "label": "Max Resolution", "type": "select", "options": ["4K", "6K", "8K"], "required": true}
  ]'::jsonb),
  ('Phones', 'phones', 'Smartphone', 'Premium smartphones, satellite phones & production devices', '[
    {"key": "brand", "label": "Brand", "type": "text", "required": true},
    {"key": "model", "label": "Model", "type": "text", "required": true},
    {"key": "storage", "label": "Storage (GB)", "type": "select", "options": ["128GB", "256GB", "512GB", "1TB"], "required": true},
    {"key": "os", "label": "Operating System", "type": "select", "options": ["iOS", "Android"], "required": true}
  ]'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  attribute_schema = EXCLUDED.attribute_schema;
