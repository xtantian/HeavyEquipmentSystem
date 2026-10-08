import type { LucideIcon } from "lucide-react";
import {
  Building,
  Car,
  Smartphone,
  Laptop,
  Shirt,
  Sparkles,
  Crown,
  Dumbbell,
  HardHat,
  Bike,
  Truck,
  Package,
  Layers,
  Bus,
  Ship,
  Zap,
  Camera,
} from "lucide-react";
import { z } from "zod";
import type { AttributeFieldSchema } from "@/lib/supabase/types";

export interface MarketplaceCategoryDef {
  id: string;
  name: string;
  slug: string;
  iconName: string;
  description: string;
  countLabel: string;
  badge?: string;
  attributeSchema: AttributeFieldSchema[];
}

export const MARKETPLACE_CATEGORIES: MarketplaceCategoryDef[] = [
  {
    id: "c0000000-0000-0000-0000-000000000011",
    name: "Property",
    slug: "property",
    iconName: "Building",
    description: "Apartments, houses, event spaces, studios & commercial venues",
    countLabel: "24+ spaces",
    badge: "Real Estate",
    attributeSchema: [
      {
        key: "property_type",
        label: "Property Type",
        type: "select",
        options: ["Apartment", "House / Villa", "Commercial Space", "Event Venue", "Studio / Warehouse"],
        required: true,
      },
      { key: "bedrooms", label: "Bedrooms / Rooms", type: "number", required: false },
      { key: "bathrooms", label: "Bathrooms", type: "number", required: false },
      { key: "floor_area_sqm", label: "Floor Area (sqm)", type: "text", required: false },
      { key: "furnished", label: "Furnished", type: "boolean", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000002",
    name: "Cars",
    slug: "cars",
    iconName: "Car",
    description: "Sedans, SUVs, electric vehicles & light commercial trucks",
    countLabel: "38+ available",
    badge: "Popular",
    attributeSchema: [
      { key: "make", label: "Make", type: "text", required: true },
      { key: "model", label: "Model", type: "text", required: true },
      { key: "year", label: "Year", type: "number", required: true },
      {
        key: "transmission",
        label: "Transmission",
        type: "select",
        options: ["Automatic", "Manual"],
        required: true,
      },
      {
        key: "fuel_type",
        label: "Fuel Type",
        type: "select",
        options: ["Gasoline", "Diesel", "Electric", "Hybrid"],
        required: true,
      },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000013",
    name: "Mobile Phones & Gadgets",
    slug: "mobile-phones-gadgets",
    iconName: "Smartphone",
    description: "Flagship smartphones, tablets, handheld consoles & portable tech",
    countLabel: "31+ available",
    badge: "Tech",
    attributeSchema: [
      { key: "brand", label: "Brand", type: "text", required: true },
      { key: "model", label: "Model", type: "text", required: true },
      {
        key: "storage",
        label: "Storage",
        type: "select",
        options: ["64GB", "128GB", "256GB", "512GB", "1TB"],
        required: true,
      },
      {
        key: "condition",
        label: "Condition",
        type: "select",
        options: ["Brand New", "Like New", "Good Condition"],
        required: false,
      },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000014",
    name: "Computers & Tech",
    slug: "computers-tech",
    iconName: "Laptop",
    description: "Laptops, desktops, workstations, monitors & AV production kits",
    countLabel: "28+ units",
    attributeSchema: [
      {
        key: "device_type",
        label: "Device Type",
        type: "select",
        options: ["Laptop", "Desktop Workstation", "Monitor", "Audio / Video Setup", "Peripherals"],
        required: true,
      },
      { key: "brand", label: "Brand", type: "text", required: true },
      { key: "processor", label: "Processor / Chip", type: "text", required: false },
      { key: "ram_gb", label: "RAM (GB)", type: "number", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000015",
    name: "Men's Fashion",
    slug: "mens-fashion",
    iconName: "Shirt",
    description: "Formal suits, tuxedos, designer watches, jackets & footwear",
    countLabel: "45+ styles",
    attributeSchema: [
      {
        key: "item_type",
        label: "Item Type",
        type: "select",
        options: ["Suit / Tuxedo", "Blazer / Jacket", "Traditional / Formal Wear", "Shoes", "Watch / Accessories"],
        required: true,
      },
      { key: "brand", label: "Brand", type: "text", required: false },
      { key: "size", label: "Size", type: "text", required: true },
      { key: "color", label: "Color", type: "text", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000016",
    name: "Women's Fashion",
    slug: "womens-fashion",
    iconName: "Sparkles",
    description: "Gowns, evening wear, designer bags, jewelry & couture",
    countLabel: "52+ pieces",
    badge: "Trending",
    attributeSchema: [
      {
        key: "item_type",
        label: "Item Type",
        type: "select",
        options: ["Evening Gown", "Bridal / Formal", "Designer Handbag", "Fine Jewelry", "Traditional Attire"],
        required: true,
      },
      { key: "brand", label: "Brand / Designer", type: "text", required: false },
      { key: "size", label: "Size", type: "text", required: true },
      { key: "color", label: "Color", type: "text", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000017",
    name: "Luxury",
    slug: "luxury",
    iconName: "Crown",
    description: "High jewelry, luxury timepieces, supercars & exclusive collector items",
    countLabel: "18+ exclusives",
    badge: "VIP",
    attributeSchema: [
      {
        key: "item_type",
        label: "Category / Type",
        type: "select",
        options: ["Luxury Watch", "Designer Handbag", "Supercar", "Fine Jewelry", "High-End Audio / Decor"],
        required: true,
      },
      { key: "brand", label: "Brand / Maison", type: "text", required: true },
      { key: "authenticity_verified", label: "Certificate / Proof of Authenticity", type: "boolean", required: true },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000018",
    name: "Sports Equipment",
    slug: "sports-equipment",
    iconName: "Dumbbell",
    description: "Gym equipment, outdoor adventure, water sports, golf & cycling gear",
    countLabel: "34+ sets",
    attributeSchema: [
      {
        key: "sport_type",
        label: "Sport / Activity",
        type: "select",
        options: ["Fitness / Gym", "Cycling", "Water Sports", "Golf", "Camping & Outdoor", "Racquet Sports"],
        required: true,
      },
      { key: "brand", label: "Brand", type: "text", required: false },
      { key: "gear_included", label: "Safety Gear Included", type: "boolean", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000019",
    name: "Industrial",
    slug: "industrial",
    iconName: "HardHat",
    description: "Excavators, bulldozers, generators, lifts & industrial machinery",
    countLabel: "24+ units",
    badge: "Heavy Duty",
    attributeSchema: [
      { key: "operating_weight", label: "Operating Weight", type: "text", required: true },
      {
        key: "power_source",
        label: "Power Source",
        type: "select",
        options: ["Diesel", "Electric", "Hybrid", "Gasoline"],
        required: true,
      },
      { key: "max_reach", label: "Capacity / Reach / Output", type: "text", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000020",
    name: "Motorbikes",
    slug: "motorbikes",
    iconName: "Bike",
    description: "Street cruisers, sport bikes, delivery scooters & touring motorcycles",
    countLabel: "19+ available",
    attributeSchema: [
      { key: "make", label: "Make", type: "text", required: true },
      { key: "model", label: "Model", type: "text", required: true },
      { key: "engine_cc", label: "Engine Capacity (cc)", type: "number", required: true },
      { key: "helmet_included", label: "Helmet Included", type: "boolean", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000021",
    name: "Special Vehicles",
    slug: "special-vehicles",
    iconName: "Truck",
    description: "Passenger buses, boats, commercial vans, trailers & heavy haulers",
    countLabel: "16+ vehicles",
    attributeSchema: [
      {
        key: "vehicle_type",
        label: "Vehicle Type",
        type: "select",
        options: ["Bus / Passenger Van", "Boat / Marine Vessel", "Heavy Haul / Cargo Truck", "Trailer / Tow", "Forklift"],
        required: true,
      },
      { key: "capacity", label: "Passenger / Load Capacity", type: "text", required: false },
      { key: "operator_provided", label: "Licensed Driver / Operator Provided", type: "boolean", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000022",
    name: "Everything Else",
    slug: "everything-else",
    iconName: "Package",
    description: "Party supplies, musical instruments, DIY tools & miscellaneous rentals",
    countLabel: "40+ items",
    attributeSchema: [
      { key: "item_category", label: "Item Category", type: "text", required: true },
      {
        key: "condition",
        label: "Item Condition",
        type: "select",
        options: ["New / Pristine", "Excellent", "Good / Working Condition"],
        required: false,
      },
    ],
  },
];

export const categoryIconMap: Record<string, LucideIcon> = {
  Building,
  Car,
  Smartphone,
  Laptop,
  Shirt,
  Sparkles,
  Crown,
  Dumbbell,
  HardHat,
  Bike,
  Truck,
  Package,
  Layers,
  // legacy fallbacks
  Bus,
  Ship,
  Zap,
  Camera,
};

export const searchBarSchema = z
  .object({
    what: z.string().optional(),
    category: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: "End date must be on or after start date",
      path: ["endDate"],
    }
  );

export type SearchBarFormValues = z.infer<typeof searchBarSchema>;
