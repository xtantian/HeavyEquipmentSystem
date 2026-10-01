import "server-only";

import { createSupabaseServerClient } from "./server";
import type { EquipmentRow, EquipmentCategoryRow, EquipmentStatus } from "./types";

export interface EquipmentWithCategory extends EquipmentRow {
  category?: EquipmentCategoryRow | null;
}

/**
 * Retrieves all active equipment categories from Supabase.
 */
export async function getEquipmentCategories(): Promise<EquipmentCategoryRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("equipment_categories")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("[supabase/equipment] Error fetching categories:", error.message);
      return [];
    }

    return data ?? [];
  } catch (err) {
    console.error("[supabase/equipment] Unexpected error fetching categories:", err);
    return [];
  }
}

/**
 * Retrieves equipment fleet items with optional category and status filtering.
 */
export async function getEquipmentList(options?: {
  categoryId?: string;
  status?: EquipmentStatus;
  limit?: number;
}): Promise<EquipmentWithCategory[]> {
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("equipment")
      .select(`
        *,
        category:equipment_categories(*)
      `)
      .order("name", { ascending: true });

    if (options?.categoryId) {
      query = query.eq("category_id", options.categoryId);
    }

    if (options?.status) {
      query = query.eq("status", options.status);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[supabase/equipment] Error fetching equipment list:", error.message);
      return [];
    }

    return (data as unknown as EquipmentWithCategory[]) ?? [];
  } catch (err) {
    console.error("[supabase/equipment] Unexpected error fetching equipment list:", err);
    return [];
  }
}

/**
 * Retrieves a single equipment unit by its primary UUID.
 */
export async function getEquipmentById(id: string): Promise<EquipmentWithCategory | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("equipment")
      .select(`
        *,
        category:equipment_categories(*)
      `)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error(`[supabase/equipment] Error fetching equipment ${id}:`, error.message);
      return null;
    }

    return (data as unknown as EquipmentWithCategory) ?? null;
  } catch (err) {
    console.error(`[supabase/equipment] Unexpected error fetching equipment ${id}:`, err);
    return null;
  }
}
