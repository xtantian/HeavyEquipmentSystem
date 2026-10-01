-- ============================================================
-- Migration: 002_create_equipment
-- Purpose:   Create the `equipment_categories` and `equipment`
--            tables with constraints, indexes, RLS policies,
--            and sample equipment fleet data.
--
-- Run this migration in your Supabase project using:
--   • Supabase Dashboard → SQL Editor → New query → paste & run
--   • OR: supabase db push  (if using the Supabase CLI)
--
-- Design Decisions & Integrity Rules
-- ──────────────────────────────────────────────────────────────
-- * Monetary values (daily_rate, weekly_rate) use numeric(10, 2)
--   for exact fixed-precision calculations.
-- * Status values are enforced strictly by CHECK constraints:
--   'available', 'reserved', 'maintenance', 'inactive'.
-- * ON DELETE RESTRICT on equipment.category_id prevents accidental
--   orphaning of machinery if a category is deleted.
-- * Timestamps use timestamptz (UTC) with auto-updating triggers.
-- * RLS allows public/client read access (anyone can browse the
--   catalog), while mutation (insert/update/delete) is restricted
--   to staff/manager/admin roles and the service role.
-- ============================================================

-- Ensure pgcrypto extension is active for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. Table: equipment_categories ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.equipment_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text,
  description text,
  icon_name   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- Unique category name constraint
  CONSTRAINT equipment_categories_name_key UNIQUE (name)
);

COMMENT ON TABLE public.equipment_categories IS
  'High-level classification for heavy equipment units (e.g., Excavators, Bulldozers).';

COMMENT ON COLUMN public.equipment_categories.name IS
  'Unique display name of the equipment category.';

COMMENT ON COLUMN public.equipment_categories.slug IS
  'URL-friendly kebab-case slug for category filtering.';

COMMENT ON COLUMN public.equipment_categories.icon_name IS
  'Lucide icon identifier matching UI rendering.';

-- ── 2. Table: equipment ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.equipment (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       uuid           NOT NULL,
  name              text           NOT NULL,
  model             text           NOT NULL,
  description       text,
  image_url         text,
  daily_rate        numeric(10, 2) NOT NULL,
  weekly_rate       numeric(10, 2) NOT NULL,
  status            text           NOT NULL DEFAULT 'available',
  power_source      text,
  operating_weight  text,
  specs             jsonb          NOT NULL DEFAULT '[]'::jsonb,
  suitable_projects text[]         NOT NULL DEFAULT '{}'::text[],
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now(),

  -- Foreign Key Constraint
  CONSTRAINT equipment_category_id_fkey
    FOREIGN KEY (category_id)
    REFERENCES public.equipment_categories(id)
    ON DELETE RESTRICT,

  -- Financial constraints: rates cannot be negative
  CONSTRAINT equipment_daily_rate_positive
    CHECK (daily_rate >= 0),
  CONSTRAINT equipment_weekly_rate_positive
    CHECK (weekly_rate >= 0),

  -- Operational status state constraint
  CONSTRAINT equipment_status_check
    CHECK (status IN ('available', 'reserved', 'maintenance', 'inactive'))
);

COMMENT ON TABLE public.equipment IS
  'Heavy equipment inventory units available for rental operations.';

COMMENT ON COLUMN public.equipment.category_id IS
  'Foreign key referencing public.equipment_categories(id).';

COMMENT ON COLUMN public.equipment.status IS
  'Operational status: available | reserved | maintenance | inactive.';

COMMENT ON COLUMN public.equipment.daily_rate IS
  'Standard 24-hour hire rate in USD (fixed precision).';

COMMENT ON COLUMN public.equipment.weekly_rate IS
  'Discounted 7-day hire rate in USD (fixed precision).';

COMMENT ON COLUMN public.equipment.specs IS
  'Structured technical specifications list: [{ label: string, value: string }].';

COMMENT ON COLUMN public.equipment.suitable_projects IS
  'Recommended industrial application tags.';

-- ── 3. Indexes ───────────────────────────────────────────────────────────────

-- Category name & slug lookup
CREATE INDEX IF NOT EXISTS equipment_categories_name_idx
  ON public.equipment_categories (name);

CREATE UNIQUE INDEX IF NOT EXISTS equipment_categories_slug_idx
  ON public.equipment_categories (slug)
  WHERE slug IS NOT NULL;

-- Equipment category foreign key filtering
CREATE INDEX IF NOT EXISTS equipment_category_id_idx
  ON public.equipment (category_id);

-- Operational status filtering (e.g. finding available equipment)
CREATE INDEX IF NOT EXISTS equipment_status_idx
  ON public.equipment (status);

-- Rate-based sorting and filtering
CREATE INDEX IF NOT EXISTS equipment_daily_rate_idx
  ON public.equipment (daily_rate);

-- Name search
CREATE INDEX IF NOT EXISTS equipment_name_idx
  ON public.equipment (name);

-- ── 4. Triggers: keep updated_at current ─────────────────────────────────────

-- Re-use the existing public.set_updated_at() function from migration 001
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

DROP TRIGGER IF EXISTS equipment_categories_set_updated_at ON public.equipment_categories;
CREATE TRIGGER equipment_categories_set_updated_at
  BEFORE UPDATE ON public.equipment_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS equipment_set_updated_at ON public.equipment;
CREATE TRIGGER equipment_set_updated_at
  BEFORE UPDATE ON public.equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── 5. Row Level Security (RLS) ──────────────────────────────────────────────

ALTER TABLE public.equipment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

-- Helper function: verify if current request caller is staff, manager, or admin
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE clerk_user_id = (auth.jwt() ->> 'sub')
      AND role IN ('staff', 'manager', 'admin')
  );
$$;

COMMENT ON FUNCTION public.is_staff_or_admin() IS
  'Returns true if the caller JWT matches a profile with staff, manager, or admin role.';

-- ── Policies for equipment_categories ──

-- Public read access: Anyone (anon or authenticated) can browse categories
DROP POLICY IF EXISTS "equipment_categories_select" ON public.equipment_categories;
CREATE POLICY "equipment_categories_select"
  ON public.equipment_categories
  FOR SELECT
  USING (true);

-- Staff/admin write access
DROP POLICY IF EXISTS "equipment_categories_insert" ON public.equipment_categories;
CREATE POLICY "equipment_categories_insert"
  ON public.equipment_categories
  FOR INSERT
  WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS "equipment_categories_update" ON public.equipment_categories;
CREATE POLICY "equipment_categories_update"
  ON public.equipment_categories
  FOR UPDATE
  USING (public.is_staff_or_admin())
  WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS "equipment_categories_delete" ON public.equipment_categories;
CREATE POLICY "equipment_categories_delete"
  ON public.equipment_categories
  FOR DELETE
  USING (public.is_staff_or_admin());

-- ── Policies for equipment ──

-- Public read access: Anyone (anon or authenticated) can view equipment inventory
DROP POLICY IF EXISTS "equipment_select" ON public.equipment;
CREATE POLICY "equipment_select"
  ON public.equipment
  FOR SELECT
  USING (true);

-- Staff/admin write access
DROP POLICY IF EXISTS "equipment_insert" ON public.equipment;
CREATE POLICY "equipment_insert"
  ON public.equipment
  FOR INSERT
  WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS "equipment_update" ON public.equipment;
CREATE POLICY "equipment_update"
  ON public.equipment
  FOR UPDATE
  USING (public.is_staff_or_admin())
  WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS "equipment_delete" ON public.equipment;
CREATE POLICY "equipment_delete"
  ON public.equipment
  FOR DELETE
  USING (public.is_staff_or_admin());

-- ── 6. Sample Fleet Data Seeding ─────────────────────────────────────────────

-- Seed Categories
INSERT INTO public.equipment_categories (id, name, slug, description, icon_name)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'Excavators',
    'excavators',
    'Hydraulic crawler and wheeled excavators for deep excavation, foundation trenches, and bulk earthmoving.',
    'Truck'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'Backhoe Loaders',
    'backhoes',
    'Versatile dual-action machines for trenching, loading, backfilling, and utility installations.',
    'Wrench'
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'Bulldozers',
    'bulldozers',
    'Heavy track-type tractors engineered for land clearing, bulk earth pushing, and precision grade finishing.',
    'HardHat'
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    'Wheel Loaders',
    'wheel-loaders',
    'High-capacity front-end articulation loaders for aggregate handling, stockpiling, and truck loading.',
    'Boxes'
  ),
  (
    'a0000000-0000-0000-0000-000000000005',
    'Cranes',
    'cranes',
    'Rough-terrain and all-terrain telescopic boom cranes for heavy industrial hoisting and structural erection.',
    'Compass'
  ),
  (
    'a0000000-0000-0000-0000-000000000006',
    'Forklifts',
    'forklifts',
    'High-capacity industrial and rough-terrain telehandlers and forklifts for material placement and yard operations.',
    'Layers'
  ),
  (
    'a0000000-0000-0000-0000-000000000007',
    'Dump Trucks',
    'dump-trucks',
    'Articulated and rigid off-highway haul trucks for bulk quarry transport and site spoil removal.',
    'Truck'
  ),
  (
    'a0000000-0000-0000-0000-000000000008',
    'Road Rollers',
    'road-rollers',
    'Single and tandem vibratory drum rollers for soil stabilization, aggregate base compaction, and asphalt paving.',
    'Cog'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name;

-- Seed Equipment
INSERT INTO public.equipment (
  id,
  category_id,
  name,
  model,
  description,
  image_url,
  daily_rate,
  weekly_rate,
  status,
  power_source,
  operating_weight,
  specs,
  suitable_projects
)
VALUES
  (
    'e0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'CAT 336 Hydraulic Excavator',
    'CAT 336-07 Next Gen',
    'Tier 4 Final crawler excavator with integrated 2D grade assist, high ambient cooling, and reinforced heavy-duty boom for continuous quarry and foundation work.',
    '/images/equipment_excavator.jpg',
    1250.00,
    6250.00,
    'available',
    '234 kW (314 HP) Diesel',
    '37,200 kg',
    '[{"label": "Operating Weight", "value": "37,200 kg"}, {"label": "Net Power", "value": "234 kW / 314 HP"}, {"label": "Max Dig Depth", "value": "7.52 m"}, {"label": "Bucket Capacity", "value": "2.28 m³"}]'::jsonb,
    ARRAY['Deep Foundation Trenching', 'Civil Infrastructure', 'Mass Earth Excavation']
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000004',
    'CAT 982M High-Lift Wheel Loader',
    'CAT 982M Series III',
    'Heavy-duty wheel loader optimized for high-volume truck loading, quarry aggregate handling, and bank-loading operations with quick-cycle transmission.',
    '/images/equipment_loader.jpg',
    1100.00,
    5500.00,
    'available',
    '318 kW (426 HP) Diesel',
    '35,500 kg',
    '[{"label": "Operating Weight", "value": "35,500 kg"}, {"label": "Net Power", "value": "318 kW / 426 HP"}, {"label": "Bucket Capacity", "value": "5.4 m³"}, {"label": "Dump Clearance", "value": "3.72 m"}]'::jsonb,
    ARRAY['Quarry Operations', 'Aggregate Hauling', 'Bulk Loading Facilities']
  ),
  (
    'e0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000003',
    'CAT D11 Heavy Track Bulldozer',
    'CAT D11T Heavy Dozer',
    'Flagship heavy track bulldozer equipped with severe-service semi-U blade, dual-shank hydraulic ripper, and automated blade stabilization for high-volume ripping.',
    '/images/equipment_dozer.jpg',
    2200.00,
    11000.00,
    'available',
    '634 kW (850 HP) Diesel',
    '104,236 kg',
    '[{"label": "Operating Weight", "value": "104,236 kg"}, {"label": "Net Power", "value": "634 kW / 850 HP"}, {"label": "Blade Capacity", "value": "27.2 m³"}, {"label": "Ripper Type", "value": "Dual Shank Hydraulic"}]'::jsonb,
    ARRAY['Mine Reclamation', 'Mass Land Clearing', 'Highway Grade Construction']
  ),
  (
    'e0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000002',
    'JCB 3CX Eco Backhoe Loader',
    'JCB 3CX Plus Eco',
    'High-mobility four-wheel drive backhoe loader with front loader bucket, side-shift extending dipper rear boom, and low-emissions fuel-efficient powertrain.',
    '/images/equipment_backhoe.jpg',
    650.00,
    3250.00,
    'available',
    '81 kW (109 HP) Turbo Diesel',
    '8,135 kg',
    '[{"label": "Operating Weight", "value": "8,135 kg"}, {"label": "Net Power", "value": "81 kW / 109 HP"}, {"label": "Max Dig Depth", "value": "5.46 m (Extending)"}, {"label": "Loader Bucket", "value": "1.0 m³"}]'::jsonb,
    ARRAY['Utility Line Installation', 'Urban Infrastructure', 'Site Prep & Backfilling']
  ),
  (
    'e0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000005',
    'Grove RT9150E Rough-Terrain Crane',
    'Grove RT9150E Hydro',
    'High-tonnage rough-terrain hydraulic mobile crane with 6-section megaform boom, inverted outrigger jacks, and multi-mode 4-wheel steering for rugged jobsites.',
    '/images/equipment_crane.jpg',
    2400.00,
    12000.00,
    'reserved',
    '261 kW (350 HP) Cummins Diesel',
    '89,500 kg',
    '[{"label": "Max Lift Capacity", "value": "135 metric tons"}, {"label": "Max Main Boom", "value": "60.0 m"}, {"label": "Max Tip Height", "value": "95.0 m"}, {"label": "Outrigger Stance", "value": "8.5 m x 8.5 m"}]'::jsonb,
    ARRAY['Steel Erection', 'Industrial Plant Assembly', 'Heavy Modular Hoisting']
  ),
  (
    'e0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000008',
    'CAT CS12 GC Vibratory Compactor',
    'CAT CS12 GC Smooth Drum',
    'High-performance single-drum soil compactor featuring dual amplitude vibration, high static linear load, and pod-style eccentric weight systems for consistent compaction.',
    '/images/equipment_roller.jpg',
    580.00,
    2900.00,
    'available',
    '90 kW (121 HP) Diesel',
    '12,300 kg',
    '[{"label": "Operating Weight", "value": "12,300 kg"}, {"label": "Drum Width", "value": "2,134 mm"}, {"label": "Static Linear Load", "value": "33.5 kg/cm"}, {"label": "Centrifugal Force", "value": "250 kN"}]'::jsonb,
    ARRAY['Highway Sub-base Compaction', 'Commercial Pad Prep', 'Runway Subgrade']
  ),
  (
    'e0000000-0000-0000-0000-000000000007',
    'a0000000-0000-0000-0000-000000000001',
    'Komatsu PC210LC-11 Hydraulic Excavator',
    'PC210LC-11 Heavy Duty',
    'Medium-range tracked excavator currently undergoing scheduled 1,000-hour hydraulic system inspection and track tension adjustment.',
    '/images/equipment_excavator.jpg',
    950.00,
    4750.00,
    'maintenance',
    '123 kW (165 HP) Turbo Diesel',
    '22,120 kg',
    '[{"label": "Operating Weight", "value": "22,120 kg"}, {"label": "Net Power", "value": "123 kW / 165 HP"}, {"label": "Max Dig Depth", "value": "6.62 m"}, {"label": "Bucket Capacity", "value": "1.20 m³"}]'::jsonb,
    ARRAY['Pipeline Excavation', 'Road Rehabilitation', 'Site Earthworks']
  ),
  (
    'e0000000-0000-0000-0000-000000000008',
    'a0000000-0000-0000-0000-000000000006',
    'Hyster H360HD Heavy-Duty Forklift',
    'Hyster H360HD-EC',
    'Heavy-duty pneumatic tire forklift engineered for port container terminals, steel yards, and precast concrete staging.',
    '/images/equipment_loader.jpg',
    780.00,
    3900.00,
    'available',
    '129 kW (172 HP) Cummins QSB',
    '19,800 kg',
    '[{"label": "Rated Capacity", "value": "16,329 kg (36,000 lbs)"}, {"label": "Load Center", "value": "1,200 mm"}, {"label": "Lift Height", "value": "5.5 m"}]'::jsonb,
    ARRAY['Port Operations', 'Steel Fabrication Yards', 'Precast Concrete Handling']
  ),
  (
    'e0000000-0000-0000-0000-000000000009',
    'a0000000-0000-0000-0000-000000000007',
    'Volvo A40G Articulated Hauler',
    'Volvo A40G Off-Highway',
    'Off-highway articulated hauler reserved as auxiliary site backup unit, currently marked inactive during fleet reassignment.',
    '/images/equipment_dozer.jpg',
    1850.00,
    9250.00,
    'inactive',
    '350 kW (469 HP) Diesel',
    '30,700 kg',
    '[{"label": "Payload Capacity", "value": "39,000 kg"}, {"label": "Body Volume", "value": "24.0 m³"}, {"label": "Top Speed", "value": "57 km/h"}]'::jsonb,
    ARRAY['Heavy Quarry Hauling', 'Dam Construction', 'Mining Overburden']
  )
ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  model = EXCLUDED.model,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  daily_rate = EXCLUDED.daily_rate,
  weekly_rate = EXCLUDED.weekly_rate,
  status = EXCLUDED.status,
  power_source = EXCLUDED.power_source,
  operating_weight = EXCLUDED.operating_weight,
  specs = EXCLUDED.specs,
  suitable_projects = EXCLUDED.suitable_projects;
