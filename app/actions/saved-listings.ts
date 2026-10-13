"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MarketplaceListingItem } from "@/lib/marketplace/mock-listings";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SaveListingResult {
  success: boolean;
  saved: boolean; // true = now saved, false = now unsaved
  error?: string;
  code?: "AUTH_REQUIRED" | "NOT_FOUND" | "ERROR";
}

export interface GetSavedIdsResult {
  savedIds: string[];
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Toggle save state of a listing for the calling authenticated user.
 * Returns the new saved state.
 *
 * SECURITY: Caller identity is derived server-side via Clerk auth().
 * A client-supplied user ID is never accepted.
 */
export async function toggleSaveListingAction(
  listingId: string
): Promise<SaveListingResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      success: false,
      saved: false,
      error: "You must be signed in to save listings.",
      code: "AUTH_REQUIRED",
    };
  }

  if (!listingId || typeof listingId !== "string") {
    return {
      success: false,
      saved: false,
      error: "Invalid listing ID.",
      code: "ERROR",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();

    // Check whether the listing is already saved
    const { data: existing, error: selectError } = await supabase
      .from("saved_listings")
      .select("id")
      .eq("user_id", userId)
      .eq("listing_id", listingId)
      .maybeSingle();

    if (selectError) {
      console.error("[toggleSaveListingAction] Select error:", selectError.message);
      return {
        success: false,
        saved: false,
        error: "Failed to check saved status. Please try again.",
        code: "ERROR",
      };
    }

    if (existing) {
      // Already saved — unsave it
      const { error: deleteError } = await supabase
        .from("saved_listings")
        .delete()
        .eq("id", existing.id)
        .eq("user_id", userId); // belt-and-suspenders ownership check

      if (deleteError) {
        console.error("[toggleSaveListingAction] Delete error:", deleteError.message);
        return {
          success: false,
          saved: true,
          error: "Failed to remove saved listing. Please try again.",
          code: "ERROR",
        };
      }

      revalidatePath("/dashboard/saved");
      revalidatePath("/listings");
      return { success: true, saved: false };
    } else {
      // Not saved — save it
      const { error: insertError } = await supabase
        .from("saved_listings")
        .insert({ user_id: userId, listing_id: listingId });

      if (insertError) {
        // 23505 = unique_violation; concurrent double-click race — treat as success
        if (insertError.code === "23505") {
          return { success: true, saved: true };
        }
        console.error("[toggleSaveListingAction] Insert error:", insertError.message);
        return {
          success: false,
          saved: false,
          error: "Failed to save listing. Please try again.",
          code: "ERROR",
        };
      }

      revalidatePath("/dashboard/saved");
      revalidatePath("/listings");
      return { success: true, saved: true };
    }
  } catch (err) {
    console.error("[toggleSaveListingAction] Unexpected error:", err);
    return {
      success: false,
      saved: false,
      error: "An unexpected error occurred.",
      code: "ERROR",
    };
  }
}

/**
 * Returns the set of listing IDs that the current user has saved.
 * Used to initialise heart state on listing cards without N+1 queries.
 * Returns an empty array for unauthenticated callers.
 */
export async function getSavedListingIds(): Promise<GetSavedIdsResult> {
  const { userId } = await auth();
  if (!userId) {
    return { savedIds: [] };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("saved_listings")
      .select("listing_id")
      .eq("user_id", userId);

    if (error) {
      console.warn("[getSavedListingIds] Error:", error.message);
      return { savedIds: [] };
    }

    return { savedIds: (data || []).map((r) => r.listing_id) };
  } catch (err) {
    console.warn("[getSavedListingIds] Unexpected error:", err);
    return { savedIds: [] };
  }
}

/**
 * Fetches the full listing details for all listings the current user has saved.
 * Excludes listings that have been hard-deleted (handled by ON DELETE CASCADE).
 * Archived/restricted listings are included so users can unsave them.
 */
export async function getSavedListings(): Promise<MarketplaceListingItem[]> {
  const { userId } = await auth();
  if (!userId) {
    return [];
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("saved_listings")
      .select(`
        listing_id,
        listing:listings(
          *,
          category:categories(*),
          listing_images(*)
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[getSavedListings] Error:", error.message);
      return [];
    }

    // Flatten and filter out nulls (listing deleted between save and fetch)
    const listings = (data || [])
      .map((row) => row.listing as MarketplaceListingItem | null)
      .filter((l): l is MarketplaceListingItem => l !== null);

    // Security: Strip sensitive asset_identifier (same as marketplace.ts)
    return listings.map((item) => {
      const safe = { ...item };
      delete (safe as Record<string, unknown>).asset_identifier;
      return safe;
    });
  } catch (err) {
    console.warn("[getSavedListings] Unexpected error:", err);
    return [];
  }
}

