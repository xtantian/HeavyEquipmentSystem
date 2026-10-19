"use server";

// [IMPORT] Load external libraries, helper functions, and types required for this server action.
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  evaluateDuplicateSignals,
  checkCategoryQuota,
  type DuplicateDetectionResult,
} from "@/lib/marketplace/integrity";

// [TYPE] Interface defining the shape of incoming data when creating a listing.
// TypeScript ensures that the form caller passes all mandatory properties.
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

// [TYPE] Interface defining the structured outcome returned to the frontend component.
// It tells the user interface if the creation succeeded, was quarantined, or failed with a reason.
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
// [FUNC] + [ASYNC] + [PARAM] Asynchronous Server Action executed directly on the Node.js server.
// Parameter `input` receives form field values submitted by the user.
export async function createListingAction(
  input: CreateListingInput
): Promise<CreateListingResult> {
  // 1. Authenticate caller
  // [AUTH] + [ASYNC] Retrieve authenticated user session directly from Clerk server cookies.
  // We never trust a user ID sent in the request body from the browser.
  const { userId } = await auth();

  // [IF] + [RETURN] Check if the visitor is signed in.
  // If not authenticated, immediately halt and reject the request with code AUTH_REQUIRED.
  if (!userId) {
    return {
      success: false,
      error: "You must be signed in to create a listing.",
      code: "AUTH_REQUIRED",
    };
  }

  // 2. Validate input fields
  // [DECL] + [INIT] + [METHOD] Trim leading and trailing whitespace to sanitize raw strings.
  const trimmedTitle = input.title?.trim();
  const trimmedDesc = input.description?.trim();
  const trimmedLoc = input.location?.trim();
  const catId = input.categoryId?.trim();
  const price = Number(input.pricePerDay);

  // [VALIDATION] + [IF] + [RETURN] Ensure the listing title has at least 3 non-space characters.
  if (!trimmedTitle || trimmedTitle.length < 3) {
    return {
      success: false,
      error: "Listing title must be at least 3 characters.",
      code: "INVALID_INPUT",
    };
  }

  // [VALIDATION] + [IF] + [RETURN] Check that description is not empty.
  if (!trimmedDesc) {
    return {
      success: false,
      error: "Please provide a detailed description of your item.",
      code: "INVALID_INPUT",
    };
  }

  // [VALIDATION] + [IF] + [RETURN] Verify that a physical pickup or mobilization location was provided.
  if (!trimmedLoc) {
    return {
      success: false,
      error: "Please provide a pickup / rental location.",
      code: "INVALID_INPUT",
    };
  }

  // [VALIDATION] + [IF] + [RETURN] Ensure a valid equipment category UUID was selected.
  if (!catId) {
    return {
      success: false,
      error: "Please select a category for your item.",
      code: "INVALID_INPUT",
    };
  }

  // [VALIDATION] + [IF] + [RETURN] Reject non-numeric or negative daily rental prices.
  if (isNaN(price) || price < 0) {
    return {
      success: false,
      error: "Please enter a valid non-negative daily rental rate.",
      code: "INVALID_INPUT",
    };
  }

  // Normalize asset identifier (strip whitespace, hyphens, and convert to lowercase)
  // [DECL] + [INIT] Standardize physical serial/VIN so 'CAT-123' and 'cat 123' match identical machinery.
  const rawAssetIdentifier = input.assetIdentifier?.trim();
  const normalizedAssetId = rawAssetIdentifier
    ? rawAssetIdentifier.toLowerCase().replace(/[^a-z0-9]/gi, "")
    : null;

  // [ERROR] Wrap external database queries in try/catch to gracefully handle network issues or constraint violations.
  try {
    // [DB] + [ASYNC] Obtain an authenticated Supabase client that forwards the current user's session token.
    const supabase = await createSupabaseServerClient();

    // 3. Verify user account governance status
    // [DB] + [METHOD] Query the user's account status from the profiles table.
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("status")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    // [IF] + [RETURN] Prevent restricted users from publishing listings.
    if (userProfile?.status === "restricted") {
      return {
        success: false,
        error: "Your account is currently restricted from creating new listings. Please contact support.",
        code: "RESTRICTED",
      };
    }

    // [IF] + [RETURN] Prevent banned or deleted accounts from posting.
    if (userProfile?.status === "banned" || userProfile?.status === "deleted") {
      return {
        success: false,
        error: "Your account is suspended and cannot post listings.",
        code: "RESTRICTED",
      };
    }

    // 4. Category Stock-Slot Quota Enforcement
    // [DB] Query existing non-deleted listings owned by this user in this category.
    const { data: userCatListings } = await supabase
      .from("listings")
      .select("id")
      .eq("owner_id", userId)
      .eq("category_id", catId)
      .not("status", "in", '("deleted","archived")');

    // [DECL] + [INIT] Calculate total active listings the user currently owns in this category.
    const activeCatCount = userCatListings?.length || 0;
    // [FUNC] Check business rule quota limits (e.g., maximum allowable power tools or heavy equipment).
    const quota = checkCategoryQuota(activeCatCount);
    // [IF] + [RETURN] Stop and return an error if user exceeds quota.
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
      // [DB] Query the moderation history table to inspect any previous duplicate violations.
      const { data: enforcements } = await supabase
        .from("duplicate_enforcements")
        .select("cooldown_until, strike_count")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      latestEnforcement = enforcements?.[0] || null;

      // [IF] Check if user has active disciplinary restrictions.
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
          // [IF] Check if the temporary cooldown expiration date is still in the future.
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
    // [ARRAY] + [IF] Use uploaded images, or assign a default fallback placeholder picture.
    const finalImages =
      input.images && input.images.length > 0
        ? input.images
        : ["/images/equipment_loader.jpg"];

    // 6. Multi-Attribute Duplicate Signals & Visual Match Evaluation
    // [OBJ] Package candidate attributes for the integrity scoring algorithm.
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

    // [DB] Fetch recent active marketplace listings to compare candidate against.
    const { data: existingCandidates } = await supabase
      .from("listings")
      .select("id, title, description, category_id, price_per_day, location, owner_id, asset_identifier, attributes, images")
      .not("status", "in", '("deleted","archived")')
      .limit(60);

    let duplicateSignal: DuplicateDetectionResult | null = null;
    // [LOOP] Iterate over existing listings in the database to detect duplicate serials, specs, or images.
    for (const ext of existingCandidates || []) {
      // [FUNC] Run domain scoring algorithm comparing candidate vs existing record.
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

      // [IF] If a high-confidence collision is flagged, capture signal and break early.
      if (signal.classification === "CONFIRMED_DUPLICATE" || signal.classification === "SUSPECTED_DUPLICATE") {
        duplicateSignal = signal;
        break;
      }
    }

    // Exact physical asset match for same owner -> block with direct resolution link
    // [IF] + [RETURN] Same user trying to relist the same equipment -> reject with link to manage existing.
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
    // [DECL] Default status is 'available', but suspect cross-account serials are quarantined for review.
    let initialStatus: "available" | "shadow_quarantined" = "available";
    let isQuarantined = false;
    let quarantineMsg: string | undefined;

    // [IF] Check if the integrity evaluation requires administrative shadow quarantine.
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

        // [DB] Record a duplicate enforcement strike against the user in the database.
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
    // [OBJ] Prepare the row payload to be inserted into the public.listings table.
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

    // [DB] + [ASYNC] + [METHOD] Insert the listing record and request back the generated UUID.
    const { data: inserted, error: insertError } = await supabase
      .from("listings")
      .insert(insertPayload)
      .select("id")
      .single();

    // [IF] Handle potential insertion errors, including concurrent race conditions.
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

        // [RETURN] Return user-friendly duplicate asset rejection.
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
    // [DECL] + [INIT] Set data structure prevents duplicate image URLs from being inserted twice.
    const seenUrls = new Set<string>();
    // [ARRAY] + [METHOD] Filter array to retain only unique, trimmed image URLs.
    const uniqueImages = finalImages.filter((url) => {
      const trimmed = (url || "").trim();
      if (!trimmed || seenUrls.has(trimmed)) return false;
      seenUrls.add(trimmed);
      return true;
    });

    // [IF] Check if any unique images remain to populate the relation table.
    if (uniqueImages.length > 0) {
      // [ARRAY] + [METHOD] Map each image URL to a relation table row object with sort order.
      const relationRows = uniqueImages.map((imageUrl, idx) => ({
        listing_id: inserted.id,
        image_url: imageUrl,
        is_primary: idx === 0,
        sort_order: idx,
      }));

      // [DB] Insert normalized image rows into the listing_images table.
      const { error: imagesError } = await supabase
        .from("listing_images")
        .insert(relationRows);

      if (imagesError) {
        console.warn("[createListingAction] Warning inserting listing_images:", imagesError.message);
      }
    }

    // [METHOD] Invalidate Next.js cache so visitors immediately see new listings without stale cache.
    revalidatePath("/listings");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/equipment");

    // [RETURN] Send successful response back to the client form component.
    return {
      success: true,
      listingId: inserted.id,
      quarantined: isQuarantined,
      quarantineMessage: quarantineMsg,
    };
  } catch (err: unknown) {
    // [ERROR] Catch any unexpected unhandled runtime exception and return structured error.
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
