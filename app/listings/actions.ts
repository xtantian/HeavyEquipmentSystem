"use server";

// [IMPORT] Load external libraries, helper functions, and types required for this server action.
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/supabase/profile";
import type { Json } from "@/lib/supabase/types";
import {
  evaluateDuplicateSignals,
  normalizeAssetIdentifier,
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
  listingId?: string | null;
  status?: "available" | "pending_review" | "shadow_quarantined";
  error?: string;
  duplicate?: boolean;
  quarantined?: boolean;
  quarantineMessage?: string;
  existingListingId?: string;
  supersededOldListingId?: string;
  supersededOldListingTitle?: string;
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
    let { data: userProfile } = await supabase
      .from("profiles")
      .select("status")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (!userProfile) {
      const synced = await ensureUserProfile(userId);
      if (synced) {
        userProfile = { status: synced.status };
      }
    }

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

    // 4. Active Cooldown & Strike Enforcement
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

    // [DB] Fetch user's own active listings specifically to guarantee same-account duplicate detection
    const { data: userOwnListings } = await supabase
      .from("listings")
      .select("id, status, title, description, category_id, price_per_day, location, owner_id, asset_identifier, attributes, images")
      .eq("owner_id", userId)
      .not("status", "in", '("deleted","archived")');

    // Duplicate detection is strictly scoped to the same authenticated seller's inventory.
    // Cross-seller comparisons for duplicate blocking or quarantining are strictly disallowed.
    const existingCandidates = userOwnListings || [];

    // Strict Same-Seller Name Uniqueness Enforcement:
    // If the seller already has an active listing with that exact or normalized name (e.g., "Lamborghini"),
    // creation is completely aborted before any database write. It results in null and is never posted.
    const normalizedNewTitle = trimmedTitle.toLowerCase().replace(/\s+/g, " ");
    const existingSameNameListing = existingCandidates.find(
      (ext) => ext.title.trim().toLowerCase().replace(/\s+/g, " ") === normalizedNewTitle
    );

    if (existingSameNameListing) {
      return {
        success: false,
        listingId: null,
        duplicate: true,
        existingListingId: existingSameNameListing.id,
        code: "DUPLICATE_ASSET",
        error: `You have already listed equipment with the name "${existingSameNameListing.title}". Duplicate listings with the same name are not permitted and cannot be posted.`,
      };
    }

    let duplicateSignal: DuplicateDetectionResult | null = null;
    // [LOOP] Iterate over existing listings in the database to detect duplicate serials, specs, or images.
    for (const ext of existingCandidates) {
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

    // 6. Conditional Publishing Workflow:
    // No qualifying duplicate: Listing publishes immediately as 'available'
    // Qualifying same-seller duplicate: Created in supported review/quarantine state ('pending_review' or 'shadow_quarantined')
    let initialStatus: "available" | "pending_review" | "shadow_quarantined" = "available";
    let isQuarantined = false;
    let quarantineMsg: string | undefined;

    const isQualifyingDuplicate =
      duplicateSignal !== null &&
      duplicateSignal.isSameOwner &&
      (duplicateSignal.classification === "CONFIRMED_DUPLICATE" ||
        duplicateSignal.classification === "SUSPECTED_DUPLICATE");

    if (isQualifyingDuplicate && duplicateSignal) {
      initialStatus = duplicateSignal.classification === "CONFIRMED_DUPLICATE" ? "shadow_quarantined" : "pending_review";
      isQuarantined = true;
      quarantineMsg =
        "Your listing has been submitted and queued for verification because similar equipment attributes were detected on your account. It will become publicly visible once confirmed by operations.";

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

    // 8. Safe Post-Creation Duplicate Auto-Archive
    // Defers archiving until AFTER insertion succeeds to prevent corrupting older listings on failure.
    // Safe explicit rule: Archiving only occurs when there is an explicit identical physical asset identifier
    // (VIN, serial number, chassis number). Matching names or similar attributes alone NEVER auto-archive existing inventory.
    let supersededOldListingId: string | undefined;
    let supersededOldListingTitle: string | undefined;

    const normCandidateSerial = normalizeAssetIdentifier(rawAssetIdentifier);

    if (
      duplicateSignal?.classification === "CONFIRMED_DUPLICATE" &&
      duplicateSignal.isSameOwner &&
      duplicateSignal.existingListingId &&
      normCandidateSerial !== null // Strict requirement: must have a physical asset identifier
    ) {
      const duplicateIdsToArchive = (userOwnListings || [])
        .filter((ext) => {
          const normExtSerial = normalizeAssetIdentifier(ext.asset_identifier);
          return normExtSerial !== null && normExtSerial === normCandidateSerial;
        })
        .map((ext) => ext.id);

      if (duplicateIdsToArchive.length > 0) {
        supersededOldListingId = duplicateSignal.existingListingId;
        supersededOldListingTitle = duplicateSignal.existingListingTitle || trimmedTitle;

        const targetArchiveIds = duplicateIdsToArchive;

        try {
          // Query active/pending reservations to protect currently booked inventory
          const { data: busyBookings } = await supabase
            .from("bookings")
            .select("listing_id")
            .in("listing_id", targetArchiveIds)
            .in("status", ["pending", "accepted", "paid", "active"]);

          const busyListingIds = new Set((busyBookings || []).map((b) => b.listing_id));

          // Filter out rented listings and listings with active reservations
          const safeArchiveIds = targetArchiveIds.filter((id) => {
            const extRecord = (userOwnListings || []).find((l) => l.id === id);
            const isRented = extRecord?.status === "rented";
            const hasActiveReservation = busyListingIds.has(id);
            return !isRented && !hasActiveReservation;
          });

          if (safeArchiveIds.length > 0) {
            const { data: archivedRows, error: archiveError } = await supabase
              .from("listings")
              .update({
                status: "archived",
                updated_at: new Date().toISOString(),
              })
              .in("id", safeArchiveIds)
              .eq("owner_id", userId)
              .in("status", ["available", "pending_review", "inactive", "shadow_quarantined", "restricted"])
              .select("id");

            if (archiveError) {
              console.warn("[createListingAction] Non-fatal archive warning for older duplicates:", archiveError.message);
            } else if (!archivedRows || archivedRows.length === 0) {
              console.warn("[createListingAction] Zero older duplicate rows matched archive criteria (possibly modified concurrently).");
            }
          } else {
            console.info("[createListingAction] Skipped auto-archiving older duplicate listing(s) because they are rented or hold active reservations.");
          }
        } catch (checkErr) {
          console.warn("[createListingAction] Non-fatal error checking reservations for duplicate archive:", checkErr);
        }
      }
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

    // [RETURN] Send successful response back to the client form component.
    return {
      success: true,
      listingId: inserted.id,
      status: initialStatus,
      supersededOldListingId,
      supersededOldListingTitle,
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

/**
 * Authoritative Server Action allowing an equipment owner to edit and resubmit
 * a rejected or restricted listing back into 'pending_review' moderation queue.
 *
 * GUARANTEES:
 * 1. Strict owner authentication. Non-owners CANNOT edit or resubmit.
 * 2. Checks profile governance: blocks restricted, banned, or deleted profiles.
 * 3. Enforces valid status transitions: only pending_review, shadow_quarantined, or restricted with moderation_status === 'rejected'.
 * 4. Strictly validates all provided editable fields (title, description, price, location).
 * 5. Re-evaluates duplicate signals against owner and marketplace listings.
 * 6. Does NOT automatically approve the listing. Status is reset to 'pending_review' (or 'shadow_quarantined' if duplicate collision detected).
 * 7. Clears previous rejection reason and records resubmission audit metadata.
 * 8. Uses conditional database updates to eliminate race conditions.
 */
export async function resubmitListingAction(
  listingId: string,
  updatedData: Partial<CreateListingInput>
) {
  const { userId } = await auth();
  if (!userId) {
    return {
      success: false,
      error: "You must be signed in to resubmit a listing.",
      code: "AUTH_REQUIRED" as const,
    };
  }

  try {
    const supabase = await createSupabaseServerClient();

    // 1. Caller Profile Governance Check
    let { data: userProfile, error: profileError } = await supabase
      .from("profiles")
      .select("status")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (!userProfile && !profileError) {
      const synced = await ensureUserProfile(userId);
      if (synced) {
        userProfile = { status: synced.status };
      }
    }

    if (profileError) {
      console.warn("[resubmitListingAction] Profile status lookup warning:", profileError.message);
    }

    if (userProfile?.status === "restricted") {
      return {
        success: false,
        error: "Your account is currently restricted from managing or resubmitting listings. Please contact support.",
        code: "RESTRICTED" as const,
      };
    }

    if (userProfile?.status === "banned" || userProfile?.status === "deleted") {
      return {
        success: false,
        error: "Your account is suspended and cannot resubmit listings.",
        code: "RESTRICTED" as const,
      };
    }

    // 2. Active Cooldown & Strike Enforcement
    try {
      const { data: enforcements } = await supabase
        .from("duplicate_enforcements")
        .select("cooldown_until, strike_count")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      const latestEnforcement = enforcements?.[0] || null;
      if (latestEnforcement) {
        if (latestEnforcement.strike_count >= 3) {
          return {
            success: false,
            error: "Your account requires administrative verification before resubmitting equipment listings due to multiple duplicate violations.",
            code: "RESTRICTED" as const,
          };
        }

        if (latestEnforcement.cooldown_until) {
          const cooldownTime = new Date(latestEnforcement.cooldown_until).getTime();
          if (cooldownTime > Date.now()) {
            return {
              success: false,
              error: `Your account is temporarily in a listing cooldown until ${new Date(latestEnforcement.cooldown_until).toLocaleString()} due to duplicate equipment detection.`,
              code: "RESTRICTED" as const,
            };
          }
        }
      }
    } catch {
      // Non-fatal if table pending
    }

    // 3. Fetch existing listing record
    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("id, owner_id, status, title, description, category_id, price_per_day, location, images, asset_identifier, attributes")
      .eq("id", listingId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!listing) {
      return { success: false, error: "Listing not found.", code: "NOT_FOUND" as const };
    }

    // 4. Strict Ownership Verification
    if (listing.owner_id !== userId) {
      return {
        success: false,
        error: "Unauthorized: You do not own this listing.",
        code: "UNAUTHORIZED" as const,
      };
    }

    // 5. Status Transition Eligibility Check
    const existingAttrs = (listing.attributes || {}) as Record<string, unknown>;
    const isModerationRejected = listing.status === "restricted" && existingAttrs.moderation_status === "rejected";
    const isPending = listing.status === "pending_review" || listing.status === "shadow_quarantined";

    if (listing.status === "available") {
      return {
        success: false,
        error: "This listing is already active and available on the marketplace.",
        code: "INVALID_STATE" as const,
      };
    }

    if (listing.status === "deleted" || listing.status === "archived") {
      return {
        success: false,
        error: "Cannot resubmit a deleted or archived listing.",
        code: "INVALID_STATE" as const,
      };
    }

    if (listing.status === "restricted" && !isModerationRejected) {
      return {
        success: false,
        error: "This listing was restricted due to safety or administrative violations and cannot be self-resubmitted. Please contact support.",
        code: "RESTRICTED_VIOLATION" as const,
      };
    }

    if (!isPending && !isModerationRejected) {
      return {
        success: false,
        error: `Cannot resubmit a listing with current status '${listing.status}'.`,
        code: "INVALID_STATE" as const,
      };
    }

    // 6. Field Input Validation
    const finalTitle = updatedData.title !== undefined ? updatedData.title.trim() : listing.title;
    if (finalTitle.length < 3 || finalTitle.length > 120) {
      return {
        success: false,
        error: "Listing title must be between 3 and 120 characters.",
        code: "INVALID_INPUT" as const,
      };
    }

    const finalDescription = updatedData.description !== undefined ? updatedData.description.trim() : (listing.description || "");
    if (finalDescription.length < 10 || finalDescription.length > 3000) {
      return {
        success: false,
        error: "Listing description must be between 10 and 3,000 characters.",
        code: "INVALID_INPUT" as const,
      };
    }

    const finalPrice = updatedData.pricePerDay !== undefined ? Number(updatedData.pricePerDay) : Number(listing.price_per_day);
    if (isNaN(finalPrice) || finalPrice <= 0 || finalPrice > 5000000) {
      return {
        success: false,
        error: "Daily rental price must be a valid amount between ₱1 and ₱5,000,000.",
        code: "INVALID_INPUT" as const,
      };
    }

    const finalLocation = updatedData.location !== undefined ? updatedData.location.trim() : (listing.location || "");
    if (finalLocation.length < 3) {
      return {
        success: false,
        error: "Location must be at least 3 characters.",
        code: "INVALID_INPUT" as const,
      };
    }

    const finalImages = updatedData.images && updatedData.images.length > 0
      ? updatedData.images
      : (listing.images && listing.images.length > 0 ? listing.images : ["/images/equipment_loader.jpg"]);

    const finalRawAssetId = updatedData.assetIdentifier !== undefined
      ? updatedData.assetIdentifier
      : listing.asset_identifier;
    const finalAssetId = normalizeAssetIdentifier(finalRawAssetId);

    // 7. Duplicate Detection Re-Evaluation
    const mergedAttrs = {
      ...existingAttrs,
      ...(updatedData.attributes || {}),
    };

    const candidateProfile = {
      title: finalTitle,
      description: finalDescription,
      categoryId: listing.category_id,
      pricePerDay: finalPrice,
      location: finalLocation,
      serialOrVin: finalAssetId || undefined,
      images: finalImages,
      ownerId: userId,
      make: String(mergedAttrs.make || ""),
      model: String(mergedAttrs.model || ""),
    };

    // Fetch user's other listings (excluding current listing)
    const { data: userOtherListings } = await supabase
      .from("listings")
      .select("id, status, title, description, category_id, price_per_day, location, owner_id, asset_identifier, attributes, images")
      .eq("owner_id", userId)
      .neq("id", listingId)
      .not("status", "in", '("deleted","archived")');

    // Duplicate detection is strictly scoped to the seller's own listings
    const comparisonCandidates = userOtherListings || [];

    // Strict Same-Seller Name Uniqueness on Resubmission:
    const normalizedResubmitTitle = finalTitle.toLowerCase().replace(/\s+/g, " ");
    const existingSameNameOther = comparisonCandidates.find(
      (ext) => ext.title.trim().toLowerCase().replace(/\s+/g, " ") === normalizedResubmitTitle
    );

    if (existingSameNameOther) {
      return {
        success: false,
        error: `You already have an active listing with the name "${existingSameNameOther.title}". Duplicate listings with the same name are not permitted.`,
        code: "DUPLICATE_ASSET" as const,
      };
    }

    let duplicateSignal: DuplicateDetectionResult | null = null;
    for (const ext of comparisonCandidates) {
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

    let nextStatus: "pending_review" | "shadow_quarantined" = "pending_review";
    if (duplicateSignal?.requiresQuarantine) {
      nextStatus = "shadow_quarantined";
    }

    // 8. Assemble Updated Attributes & Update Payload
    const updatedAttrs = {
      ...mergedAttrs,
      moderation_status: nextStatus,
      rejection_reason: null,
      resubmitted_at: new Date().toISOString(),
      ...(duplicateSignal
        ? {
            resubmission_duplicate_warning: {
              confidence: duplicateSignal.confidence,
              reasons: duplicateSignal.reasons,
              classification: duplicateSignal.classification,
              evaluated_at: new Date().toISOString(),
            },
          }
        : {}),
    };

    const updatePayload = {
      status: nextStatus,
      title: finalTitle,
      description: finalDescription,
      price_per_day: finalPrice,
      location: finalLocation,
      images: finalImages,
      asset_identifier: finalAssetId,
      is_verified: false,
      verified_at: null,
      verified_by: null,
      attributes: updatedAttrs as unknown as Json,
      updated_at: new Date().toISOString(),
    };

    // 9. Execute Conditional Update
    // PostgreSQL RLS policy on public.listings blocks owners from updating listings with status = 'restricted'.
    // Since this server action has verified caller identity, ownership, governance, and that
    // moderation_status === 'rejected', we use the elevated client exclusively for this validated resubmission.
    let updateClient = supabase;
    if (listing.status === "restricted") {
      try {
        updateClient = createSupabaseServiceClient();
      } catch (err: unknown) {
        console.error("[resubmitListingAction] Failed to initialize service client:", err);
        return {
          success: false,
          error: "Server configuration error: elevated service credentials are required to process restricted listing resubmission.",
          code: "SERVICE_CONFIG_ERROR" as const,
        };
      }
    }

    // Conditional update matching listingId, owner_id, and expected status to eliminate concurrency races
    const { data: updatedRows, error: updateError } = await updateClient
      .from("listings")
      .update(updatePayload)
      .eq("id", listingId)
      .eq("owner_id", userId)
      .eq("status", listing.status)
      .select("id, status");

    if (updateError) throw new Error(updateError.message);
    if (!updatedRows || updatedRows.length === 0) {
      return {
        success: false,
        error: "Failed to resubmit listing: record modified concurrently or ownership mismatch.",
        code: "CONFLICT" as const,
      };
    }

    // 10. Safe Post-Resubmission Duplicate Auto-Archive
    // Defers archiving until AFTER resubmission succeeds to prevent corrupting older listings on failure.
    // Protects listings that are rented or hold active reservations.
    const normResubmitSerial = normalizeAssetIdentifier(finalAssetId);
    if (
      duplicateSignal?.classification === "CONFIRMED_DUPLICATE" &&
      duplicateSignal.isSameOwner &&
      duplicateSignal.existingListingId &&
      normResubmitSerial !== null
    ) {
      const duplicateIdsToArchive = (userOtherListings || [])
        .filter((ext) => {
          const normExtSerial = normalizeAssetIdentifier(ext.asset_identifier);
          return normExtSerial !== null && normExtSerial === normResubmitSerial;
        })
        .map((ext) => ext.id);

      if (duplicateIdsToArchive.length > 0) {
        const targetArchiveIds = duplicateIdsToArchive;

      try {
        // Query active/pending reservations to protect currently booked inventory
        const { data: busyBookings } = await supabase
          .from("bookings")
          .select("listing_id")
          .in("listing_id", targetArchiveIds)
          .in("status", ["pending", "accepted", "paid", "active"]);

        const busyListingIds = new Set((busyBookings || []).map((b) => b.listing_id));

        // Filter out rented listings and listings with active reservations
        const safeArchiveIds = targetArchiveIds.filter((id) => {
          const extRecord = (userOtherListings || []).find((l) => l.id === id);
          const isRented = extRecord?.status === "rented";
          const hasActiveReservation = busyListingIds.has(id);
          return !isRented && !hasActiveReservation;
        });

        if (safeArchiveIds.length > 0) {
          const { data: archivedRows, error: archiveError } = await supabase
            .from("listings")
            .update({
              status: "archived",
              updated_at: new Date().toISOString(),
            })
            .in("id", safeArchiveIds)
            .eq("owner_id", userId)
            .in("status", ["available", "pending_review", "inactive", "shadow_quarantined", "restricted"])
            .select("id");

          if (archiveError) {
            console.warn("[resubmitListingAction] Non-fatal archive warning for older duplicates:", archiveError.message);
          } else if (!archivedRows || archivedRows.length === 0) {
            console.warn("[resubmitListingAction] Zero older duplicate rows matched archive criteria (possibly modified concurrently).");
          }
        } else {
          console.info("[resubmitListingAction] Skipped auto-archiving older duplicate listing(s) because they are rented or hold active reservations.");
        }
      } catch (checkErr) {
        console.warn("[resubmitListingAction] Non-fatal error checking reservations for duplicate archive:", checkErr);
      }
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/listings");
    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/admin/listings");

    return {
      success: true,
      listingId,
      status: nextStatus,
      message:
        nextStatus === "shadow_quarantined"
          ? "Listing resubmitted and queued for operational verification due to similar equipment signals."
          : "Your listing has been updated and resubmitted for moderation review.",
    };
  } catch (err: unknown) {
    console.error("[resubmitListingAction] Error:", err);
    return {
      success: false,
      error: (err as Error).message || "Failed to resubmit listing.",
      code: "ERROR" as const,
    };
  }
}
