-- Migration: 010_update_marketplace_categories.sql
-- Description: Updates marketplace categories to the 12 authoritative categories,
-- safely remapping legacy listings and preserving all existing data without violating foreign keys.

BEGIN;

-- 1. Upsert the 12 Authoritative Categories
INSERT INTO public.categories (id, name, slug, icon, description, attribute_schema)
VALUES
  (
    'c0000000-0000-0000-0000-000000000011',
    'Property',
    'property',
    'Building',
    'Apartments, houses, event spaces, studios & commercial venues',
    '[
      {"key": "property_type", "label": "Property Type", "type": "select", "options": ["Apartment", "House / Villa", "Commercial Space", "Event Venue", "Studio / Warehouse"], "required": true},
      {"key": "bedrooms", "label": "Bedrooms / Rooms", "type": "number", "required": false},
      {"key": "bathrooms", "label": "Bathrooms", "type": "number", "required": false},
      {"key": "floor_area_sqm", "label": "Floor Area (sqm)", "type": "text", "required": false},
      {"key": "furnished", "label": "Furnished", "type": "boolean", "required": false}
    ]'::jsonb
  ),
  (
    'c0000000-0000-0000-0000-000000000002',
    'Cars',
    'cars',
    'Car',
    'Sedans, SUVs, electric vehicles & light commercial trucks',
    '[
      {"key": "make", "label": "Make", "type": "text", "required": true},
      {"key": "model", "label": "Model", "type": "text", "required": true},
      {"key": "year", "label": "Year", "type": "number", "required": true},
      {"key": "transmission", "label": "Transmission", "type": "select", "options": ["Automatic", "Manual"], "required": true},
      {"key": "fuel_type", "label": "Fuel Type", "type": "select", "options": ["Gasoline", "Diesel", "Electric", "Hybrid"], "required": true}
    ]'::jsonb
  ),
  (
    'c0000000-0000-0000-0000-000000000013',
    'Mobile Phones & Gadgets',
    'mobile-phones-gadgets',
    'Smartphone',
    'Flagship smartphones, tablets, handheld consoles & portable tech',
    '[
      {"key": "brand", "label": "Brand", "type": "text", "required": true},
      {"key": "model", "label": "Model", "type": "text", "required": true},
      {"key": "storage", "label": "Storage", "type": "select", "options": ["64GB", "128GB", "256GB", "512GB", "1TB"], "required": true},
      {"key": "condition", "label": "Condition", "type": "select", "options": ["Brand New", "Like New", "Good Condition"], "required": false}
    ]'::jsonb
  ),
  (
    'c0000000-0000-0000-0000-000000000014',
    'Computers & Tech',
    'computers-tech',
    'Laptop',
    'Laptops, desktops, workstations, monitors & AV production kits',
    '[
      {"key": "device_type", "label": "Device Type", "type": "select", "options": ["Laptop", "Desktop Workstation", "Monitor", "Audio / Video Setup", "Peripherals"], "required": true},
      {"key": "brand", "label": "Brand", "type": "text", "required": true},
      {"key": "processor", "label": "Processor / Chip", "type": "text", "required": false},
      {"key": "ram_gb", "label": "RAM (GB)", "type": "number", "required": false}
    ]'::jsonb
  ),
  (
    'c0000000-0000-0000-0000-000000000015',
    'Men''s Fashion',
    'mens-fashion',
    'Shirt',
    'Formal suits, tuxedos, designer watches, jackets & footwear',
    '[
      {"key": "item_type", "label": "Item Type", "type": "select", "options": ["Suit / Tuxedo", "Blazer / Jacket", "Traditional / Formal Wear", "Shoes", "Watch / Accessories"], "required": true},
      {"key": "brand", "label": "Brand", "type": "text", "required": false},
      {"key": "size", "label": "Size", "type": "text", "required": true},
      {"key": "color", "label": "Color", "type": "text", "required": false}
    ]'::jsonb
  ),
  (
    'c0000000-0000-0000-0000-000000000016',
    'Women''s Fashion',
    'womens-fashion',
    'Sparkles',
    'Gowns, evening wear, designer bags, jewelry & couture',
    '[
      {"key": "item_type", "label": "Item Type", "type": "select", "options": ["Evening Gown", "Bridal / Formal", "Designer Handbag", "Fine Jewelry", "Traditional Attire"], "required": true},
      {"key": "brand", "label": "Brand / Designer", "type": "text", "required": false},
      {"key": "size", "label": "Size", "type": "text", "required": true},
      {"key": "color", "label": "Color", "type": "text", "required": false}
    ]'::jsonb
  ),
  (
    'c0000000-0000-0000-0000-000000000017',
    'Luxury',
    'luxury',
    'Crown',
    'High jewelry, luxury timepieces, supercars & exclusive collector items',
    '[
      {"key": "item_type", "label": "Category / Type", "type": "select", "options": ["Luxury Watch", "Designer Handbag", "Supercar", "Fine Jewelry", "High-End Audio / Decor"], "required": true},
      {"key": "brand", "label": "Brand / Maison", "type": "text", "required": true},
      {"key": "authenticity_verified", "label": "Certificate / Proof of Authenticity", "type": "boolean", "required": true}
    ]'::jsonb
  ),
  (
    'c0000000-0000-0000-0000-000000000018',
    'Sports Equipment',
    'sports-equipment',
    'Dumbbell',
    'Gym equipment, outdoor adventure, water sports, golf & cycling gear',
    '[
      {"key": "sport_type", "label": "Sport / Activity", "type": "select", "options": ["Fitness / Gym", "Cycling", "Water Sports", "Golf", "Camping & Outdoor", "Racquet Sports"], "required": true},
      {"key": "brand", "label": "Brand", "type": "text", "required": false},
      {"key": "gear_included", "label": "Safety Gear Included", "type": "boolean", "required": false}
    ]'::jsonb
  ),
  (
    'c0000000-0000-0000-0000-000000000019',
    'Industrial',
    'industrial',
    'HardHat',
    'Excavators, bulldozers, generators, lifts & industrial machinery',
    '[
      {"key": "operating_weight", "label": "Operating Weight", "type": "text", "required": true},
      {"key": "power_source", "label": "Power Source", "type": "select", "options": ["Diesel", "Electric", "Hybrid", "Gasoline"], "required": true},
      {"key": "max_reach", "label": "Capacity / Reach / Output", "type": "text", "required": false}
    ]'::jsonb
  ),
  (
    'c0000000-0000-0000-0000-000000000020',
    'Motorbikes',
    'motorbikes',
    'Bike',
    'Street cruisers, sport bikes, delivery scooters & touring motorcycles',
    '[
      {"key": "make", "label": "Make", "type": "text", "required": true},
      {"key": "model", "label": "Model", "type": "text", "required": true},
      {"key": "engine_cc", "label": "Engine Capacity (cc)", "type": "number", "required": true},
      {"key": "helmet_included", "label": "Helmet Included", "type": "boolean", "required": false}
    ]'::jsonb
  ),
  (
    'c0000000-0000-0000-0000-000000000021',
    'Special Vehicles',
    'special-vehicles',
    'Truck',
    'Passenger buses, boats, commercial vans, trailers & heavy haulers',
    '[
      {"key": "vehicle_type", "label": "Vehicle Type", "type": "select", "options": ["Bus / Passenger Van", "Boat / Marine Vessel", "Heavy Haul / Cargo Truck", "Trailer / Tow", "Forklift"], "required": true},
      {"key": "capacity", "label": "Passenger / Load Capacity", "type": "text", "required": false},
      {"key": "operator_provided", "label": "Licensed Driver / Operator Provided", "type": "boolean", "required": false}
    ]'::jsonb
  ),
  (
    'c0000000-0000-0000-0000-000000000022',
    'Everything Else',
    'everything-else',
    'Package',
    'Party supplies, musical instruments, DIY tools & miscellaneous rentals',
    '[
      {"key": "item_category", "label": "Item Category", "type": "text", "required": true},
      {"key": "condition", "label": "Item Condition", "type": "select", "options": ["New / Pristine", "Excellent", "Good / Working Condition"], "required": false}
    ]'::jsonb
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  attribute_schema = EXCLUDED.attribute_schema,
  updated_at = now();

-- 2. Remap Existing Listings Associated with Legacy Categories
-- Remap Heavy Equipment & Generators -> Industrial
UPDATE public.listings
SET category_id = 'c0000000-0000-0000-0000-000000000019'
WHERE category_id IN (
  SELECT id FROM public.categories WHERE slug IN ('heavy-equipment', 'generators')
);

-- Remap Motorcycles -> Motorbikes
UPDATE public.listings
SET category_id = 'c0000000-0000-0000-0000-000000000020'
WHERE category_id IN (
  SELECT id FROM public.categories WHERE slug = 'motorcycles'
);

-- Remap Phones -> Mobile Phones & Gadgets
UPDATE public.listings
SET category_id = 'c0000000-0000-0000-0000-000000000013'
WHERE category_id IN (
  SELECT id FROM public.categories WHERE slug = 'phones'
);

-- Remap Buses & Boats -> Special Vehicles
UPDATE public.listings
SET category_id = 'c0000000-0000-0000-0000-000000000021'
WHERE category_id IN (
  SELECT id FROM public.categories WHERE slug IN ('buses', 'boats')
);

-- Remap Cameras -> Computers & Tech
UPDATE public.listings
SET category_id = 'c0000000-0000-0000-0000-000000000014'
WHERE category_id IN (
  SELECT id FROM public.categories WHERE slug = 'cameras'
);

-- 3. Delete Legacy Categories That Are No Longer Used
DELETE FROM public.categories
WHERE slug IN ('heavy-equipment', 'buses', 'motorcycles', 'boats', 'generators', 'cameras', 'phones');

COMMIT;
