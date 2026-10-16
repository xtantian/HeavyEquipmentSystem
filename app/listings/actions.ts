"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export interface CreateListingInput {
  title: string;
  description: string;
  categoryId: string;
  pricePerDay: number;
  location: string;
  images: string[];
  attributes: Record<string, unknown>;
  assetIdentifier?: string; // Private persistent physical inventory identity (VIN, Serial, Plate, Machine PIN, Unit ID)
}

export interface CreateListingResult {
  success: boolean;
  listingId?: string;
  error?: string;
  duplicate?: boolean;
  existingListingId?: string;
  code?: "AUTH_REQUIRED" | "RESTRICTED" | "DUPLICATE_ASSET" | "INVALID_INPUT" | "ERROR";
}

/**
 * Authoritative Server Action to create a new rental listing with duplicate physical asset prevention.
 *
 * GUARANTEES:
 * 1. Strict server-side caller identity derivation via Clerk auth(). Client cannot spoof owner_id.
 * 2. Governance check: Restricted/banned accounts cannot create listings.
 * 3. Physical Item Identity Validation:
 *    - Does NOT identify duplicates using title alone (two separate cars can have the same title).
 *    - Normalizes assetIdentifier (VIN, Serial Number, Plate, Machine PIN, Inventory Tag).
 *    - Enforces owner-scoped uniqueness so the owner cannot register the same physical item multiple times.
 *    - Database-level partial unique index ensures concurrent requests cannot bypass check.
 *    - If duplicate is found, returns an actionable error linking directly to the existing listing.
 * 4. Sensitive assetIdentifier is stored securely and never exposed on public marketplace cards.
 */
export async function createListingAction(
  input: CreateListingInput
): Promise<CreateListingResult> {
  // 1. Authenticate caller
  const { userId } = await auth();
  if (!userId) {
    return {
      success: false,
      error: "You must be signed in to create a listing.",
      code: "AUTH_REQUIRED",
    };
  }

  // 2. Validate input fields
  const trimmedTitle = input.title?.trim();
  const trimmedDesc = input.description?.trim();
  const trimmedLoc = input.location?.trim();
  const catId = input.categoryId?.trim();
  const price = Number(input.pricePerDay);

  if (!trimmedTitle || trimmedTitle.length < 3) {
    return {
      success: false,
      error: "Listing title must be at least 3 characters.",
      code: "INVALID_INPUT",
    };
  }

  if (!trimmedDesc) {
    return {
      success: false,
      error: "Please provide a detailed description of your item.",
      code: "INVALID_INPUT",
    };
  }

  if (!trimmedLoc) {
    return {
      success: false,
      error: "Please provide a pickup / rental location.",
      code: "INVALID_INPUT",
    };
  }

  if (!catId) {
    return {
      success: false,
      error: "Please select a category for your item.",
      code: "INVALID_INPUT",
    };
  }

  if (isNaN(price) || price < 0) {
    return {
      success: false,
      error: "Please enter a valid non-negative daily rental rate.",
      code: "INVALID_INPUT",
    };
  }

  const rawAssetIdentifier = input.assetIdentifier?.trim();
  const normalizedAssetId = rawAssetIdentifier ? rawAssetIdentifier.toLowerCase() : null;

  try {
    const supabase = await createSupabaseServerClient();

    // 3. Verify user account governance status
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("status")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (userProfile?.status === "restricted") {
      return {
        success: false,
        error: "Your account is currently restricted from creating new listings. Please contact support.",
        code: "RESTRICTED",
      };
    }

    if (userProfile?.status === "banned" || userProfile?.status === "deleted") {
      return {
        success: false,
        error: "Your account is suspended and cannot post listings.",
        code: "RESTRICTED",
      };
    }

    // 4. Duplicate physical item detection
    if (normalizedAssetId) {
      const { data: existingAssetListing } = await supabase
        .from("listings")
        .select("id, title, status")
        .eq("owner_id", userId)
        .ilike("asset_identifier", normalizedAssetId)
        .neq("status", "deleted")
        .maybeSingle();

      if (existingAssetListing) {
        return {
          success: false,
          duplicate: true,
          existingListingId: existingAssetListing.id,
          code: "DUPLICATE_ASSET",
          error: `You already have an active listing for this physical item ("${existingAssetListing.title}"). Please manage or edit your existing listing instead of creating another one.`,
        };
      }
    }

    // Ensure fallback image if none uploaded
    const finalImages =
      input.images && input.images.length > 0
        ? input.images
        : ["/images/equipment_loader.jpg"];

    // 5. Insert listing into database
    const insertPayload = {
      owner_id: userId,
      category_id: catId,
      title: trimmedTitle,
      description: trimmedDesc,
      price_per_day: price,
      location: trimmedLoc,
      attributes: (input.attributes || {}) as unknown as Json,
      images: finalImages,
      status: "available" as const,
      asset_identifier: normalizedAssetId ? rawAssetIdentifier : null,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("listings")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError) {
      // PostgreSQL 23505 = unique_violation (concurrent submission collision)
      if (
        insertError.code === "23505" ||
        insertError.message?.toLowerCase().includes("unique") ||
        insertError.message?.toLowerCase().includes("asset_identifier")
      ) {
        // Find existing listing to provide link
        const { data: collisionListing } = await supabase
          .from("listings")
          .select("id, title")
          .eq("owner_id", userId)
          .ilike("asset_identifier", normalizedAssetId || "")
          .neq("status", "deleted")
          .maybeSingle();

        return {
          success: false,
          duplicate: true,
          existingListingId: collisionListing?.id,
          code: "DUPLICATE_ASSET",
          error: `You already have an active listing for this physical item ("${collisionListing?.title || trimmedTitle}"). Please manage or edit your existing listing instead of creating another one.`,
        };
      }

      console.error("[createListingAction] Insert error:", insertError.message);
      return {
        success: false,
        error: "Failed to publish listing. Please check your details and try again.",
        code: "ERROR",
      };
    }

    if (!inserted?.id) {
      return {
        success: false,
        error: "Listing could not be created.",
        code: "ERROR",
      };
    }

    // 6. Populate listing_images relation table with ordering and deduplication
    const seenUrls = new Set<string>();
    const uniqueImages = finalImages.filter((url) => {
      const trimmed = (url || "").trim();
      if (!trimmed || seenUrls.has(trimmed)) return false;
      seenUrls.add(trimmed);
      return true;
    });

    if (uniqueImages.length > 0) {
      const relationRows = uniqueImages.map((imageUrl, idx) => ({
        listing_id: inserted.id,
        image_url: imageUrl,
        is_primary: idx === 0,
        sort_order: idx,
      }));

      const { error: imagesError } = await supabase
        .from("listing_images")
        .insert(relationRows);

      if (imagesError) {
        console.warn("[createListingAction] Warning inserting listing_images:", imagesError.message);
      }
    }

    revalidatePath("/listings");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/equipment");

    return {
      success: true,
      listingId: inserted.id,
    };
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || "";
    if (errorMsg.includes("23505") || errorMsg.includes("unique")) {
      return {
        success: false,
        duplicate: true,
        code: "DUPLICATE_ASSET",
        error: "A listing for this physical item is already registered in your inventory.",
      };
    }

    console.error("[createListingAction] Unexpected exception:", err);
    return {
      success: false,
      error: "An unexpected error occurred while creating your listing. Please try again.",
      code: "ERROR",
    };
  }
}
