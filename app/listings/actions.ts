"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  evaluateDuplicateSignals,
  checkCategoryQuota,
  type DuplicateDetectionResult,
} from "@/lib/marketplace/integrity";

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
  quarantined?: boolean;
  quarantineMessage?: string;
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

  // Normalize asset identifier (strip whitespace, hyphens, and convert to lowercase)
  const rawAssetIdentifier = input.assetIdentifier?.trim();
  const normalizedAssetId = rawAssetIdentifier
    ? rawAssetIdentifier.toLowerCase().replace(/[^a-z0-9]/gi, "")
    : null;

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

    // 4. Category Stock-Slot Quota Enforcement
    const { data: userCatListings } = await supabase
      .from("listings")
      .select("id")
      .eq("owner_id", userId)
      .eq("category_id", catId)
      .not("status", "in", '("deleted","archived")');

    const activeCatCount = userCatListings?.length || 0;
    const quota = checkCategoryQuota(activeCatCount);
    if (!quota.allowed) {
      return {
        success: false,
        error: `You have reached the maximum active equipment allowance (${quota.maxAllowed}) for this category. Please manage your existing inventory or upgrade your account tier.`,
        code: "INVALID_INPUT",
      };
    }

    // 5. Active Cooldown & Strike Enforcement
    let latestEnforcement: { cooldown_until: string | null; strike_count: number } | null = null;
    try {
      const { data: enforcements } = await supabase
        .from("duplicate_enforcements")
        .select("cooldown_until, strike_count")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      latestEnforcement = enforcements?.[0] || null;

      if (latestEnforcement) {
        if (latestEnforcement.strike_count >= 3) {
          return {
            success: false,
            error: "Your account requires administrative verification before publishing new equipment listings due to multiple duplicate violations.",
            code: "RESTRICTED",
          };
        }

        if (latestEnforcement.cooldown_until) {
          const cooldownTime = new Date(latestEnforcement.cooldown_until).getTime();
          if (cooldownTime > Date.now()) {
            return {
              success: false,
              error: `Your account is temporarily in a listing cooldown until ${new Date(latestEnforcement.cooldown_until).toLocaleString()} due to duplicate equipment detection.`,
              code: "RESTRICTED",
            };
          }
        }
      }
    } catch {
      // Non-fatal if table pending
    }

    // Ensure fallback image if none uploaded
    const finalImages =
      input.images && input.images.length > 0
        ? input.images
        : ["/images/equipment_loader.jpg"];

    // 6. Multi-Attribute Duplicate Signals & Visual Match Evaluation
    const candidateProfile = {
      title: trimmedTitle,
      description: trimmedDesc,
      categoryId: catId,
      pricePerDay: price,
      location: trimmedLoc,
      serialOrVin: rawAssetIdentifier,
      images: finalImages,
      ownerId: userId,
      make: String(input.attributes?.make || ""),
      model: String(input.attributes?.model || ""),
    };

    const { data: existingCandidates } = await supabase
      .from("listings")
      .select("id, title, description, category_id, price_per_day, location, owner_id, asset_identifier, attributes, images")
      .not("status", "in", '("deleted","archived")')
      .limit(60);

    let duplicateSignal: DuplicateDetectionResult | null = null;
    for (const ext of existingCandidates || []) {
      const signal = evaluateDuplicateSignals(candidateProfile, {
        id: ext.id,
        title: ext.title,
        description: ext.description || "",
        categoryId: ext.category_id,
        pricePerDay: ext.price_per_day,
        location: ext.location || "",
        ownerId: ext.owner_id,
        assetIdentifier: ext.asset_identifier,
        attributes: (ext.attributes || {}) as Record<string, unknown>,
        images: ext.images || [],
      });

      if (signal.classification === "CONFIRMED_DUPLICATE" || signal.classification === "SUSPECTED_DUPLICATE") {
        duplicateSignal = signal;
        break;
      }
    }

    // Exact physical asset match for same owner -> block with direct resolution link
    if (duplicateSignal?.classification === "CONFIRMED_DUPLICATE" && duplicateSignal.isSameOwner) {
      return {
        success: false,
        duplicate: true,
        existingListingId: duplicateSignal.existingListingId,
        code: "DUPLICATE_ASSET",
        error: `You already have an active listing for this physical item ("${duplicateSignal.existingListingTitle || trimmedTitle}"). Please manage or edit your existing listing instead of creating another one.`,
      };
    }

    // Quarantine suspect items or cross-account collisions
    let initialStatus: "available" | "shadow_quarantined" = "available";
    let isQuarantined = false;
    let quarantineMsg: string | undefined;

    if (duplicateSignal?.requiresQuarantine) {
      initialStatus = "shadow_quarantined";
      isQuarantined = true;
      quarantineMsg =
        "Your listing has been submitted and queued for verification because similar equipment attributes were detected. It will become publicly visible once confirmed by operations.";

      try {
        const currentStrikes = latestEnforcement?.strike_count || 0;
        const nextStrikes = currentStrikes + 1;
        const cooldownHours = nextStrikes >= 2 ? 24 : 0;
        const cooldownUntil =
          cooldownHours > 0
            ? new Date(Date.now() + cooldownHours * 60 * 60 * 1000).toISOString()
            : null;

        await supabase
          .from("duplicate_enforcements")
          .insert({
            user_id: userId,
            strike_count: nextStrikes,
            cooldown_until: cooldownUntil,
            reason: duplicateSignal.classification,
            target_asset_fingerprint: duplicateSignal.existingListingId || null,
          });
      } catch {
        // Non-fatal if table pending
      }
    }

    // 7. Insert listing into database
    const insertPayload = {
      owner_id: userId,
      category_id: catId,
      title: trimmedTitle,
      description: trimmedDesc,
      price_per_day: price,
      location: trimmedLoc,
      attributes: (input.attributes || {}) as unknown as Json,
      images: finalImages,
      status: initialStatus,
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
      quarantined: isQuarantined,
      quarantineMessage: quarantineMsg,
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
