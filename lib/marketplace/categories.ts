import type { LucideIcon } from "lucide-react";
import {
  HardHat,
  Car,
  Bus,
  Bike,
  Ship,
  Zap,
  Camera,
  Smartphone,
  Layers,
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
    id: "c0000000-0000-0000-0000-000000000001",
    name: "Heavy Equipment",
    slug: "heavy-equipment",
    iconName: "HardHat",
    description: "Excavators, bulldozers, cranes & earthmovers for construction",
    countLabel: "24+ units",
    badge: "Industrial",
    attributeSchema: [
      { key: "operating_weight", label: "Operating Weight", type: "text", required: true },
      {
        key: "power_source",
        label: "Power Source",
        type: "select",
        options: ["Diesel", "Electric", "Hybrid"],
        required: true,
      },
      { key: "max_reach", label: "Max Reach / Dig Depth", type: "text", required: false },
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
    id: "c0000000-0000-0000-0000-000000000003",
    name: "Buses",
    slug: "buses",
    iconName: "Bus",
    description: "Passenger shuttles, charter coaches & group transit vans",
    countLabel: "14+ available",
    attributeSchema: [
      { key: "passenger_capacity", label: "Passenger Capacity", type: "number", required: true },
      { key: "driver_provided", label: "Driver Provided", type: "boolean", required: false },
      { key: "ac_equipped", label: "Air Conditioned", type: "boolean", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000004",
    name: "Motorcycles",
    slug: "motorcycles",
    iconName: "Bike",
    description: "Street cruisers, sport bikes, delivery scooters & dirt bikes",
    countLabel: "19+ available",
    attributeSchema: [
      { key: "engine_cc", label: "Engine Capacity (cc)", type: "number", required: true },
      { key: "helmet_included", label: "Helmet Included", type: "boolean", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000005",
    name: "Boats",
    slug: "boats",
    iconName: "Ship",
    description: "Motor yachts, speedboats, pontoons & commercial tenders",
    countLabel: "11+ available",
    badge: "Marine",
    attributeSchema: [
      { key: "length_ft", label: "Length (ft)", type: "number", required: true },
      { key: "passenger_capacity", label: "Passenger Capacity", type: "number", required: true },
      { key: "captain_included", label: "Captain Included", type: "boolean", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000006",
    name: "Generators",
    slug: "generators",
    iconName: "Zap",
    description: "High-capacity standby diesel generators & portable silent sets",
    countLabel: "27+ available",
    attributeSchema: [
      { key: "power_output", label: "Power Output (kVA/kW)", type: "text", required: true },
      {
        key: "fuel_type",
        label: "Fuel Type",
        type: "select",
        options: ["Diesel", "Gasoline", "Propane", "Solar"],
        required: true,
      },
      { key: "noise_level", label: "Noise Level (dBA)", type: "text", required: false },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000007",
    name: "Cameras",
    slug: "cameras",
    iconName: "Camera",
    description: "Cinema cameras, high-res mirrorless, cine lenses & lighting rigs",
    countLabel: "42+ available",
    badge: "Pro Video",
    attributeSchema: [
      {
        key: "sensor_size",
        label: "Sensor Type",
        type: "select",
        options: ["Full Frame", "Super 35", "APS-C", "Medium Format"],
        required: true,
      },
      { key: "lens_mount", label: "Lens Mount", type: "text", required: false },
      {
        key: "max_resolution",
        label: "Max Resolution",
        type: "select",
        options: ["4K", "6K", "8K"],
        required: true,
      },
    ],
  },
  {
    id: "c0000000-0000-0000-0000-000000000008",
    name: "Phones",
    slug: "phones",
    iconName: "Smartphone",
    description: "Flagship smartphones, satellite handsets & enterprise mobile kits",
    countLabel: "31+ available",
    attributeSchema: [
      { key: "brand", label: "Brand", type: "text", required: true },
      { key: "model", label: "Model", type: "text", required: true },
      {
        key: "storage",
        label: "Storage",
        type: "select",
        options: ["128GB", "256GB", "512GB", "1TB"],
        required: true,
      },
      {
        key: "os",
        label: "Operating System",
        type: "select",
        options: ["iOS", "Android"],
        required: true,
      },
    ],
  },
];

export const categoryIconMap: Record<string, LucideIcon> = {
  HardHat,
  Car,
  Bus,
  Bike,
  Ship,
  Zap,
  Camera,
  Smartphone,
  Layers,
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
