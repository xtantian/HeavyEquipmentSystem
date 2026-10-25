"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";

export interface SubmitListerReviewParams {
  bookingId: string;
  rating: number;
  comment?: string;
}

export interface SubmitListerReviewResult {
  success?: boolean;
  reviewId?: string;
  error?: string;
  code?:
    | "AUTH_REQUIRED"
    | "INVALID_INPUT"
    | "BOOKING_NOT_FOUND"
    | "NOT_ELIGIBLE"
    | "SELF_REVIEW"
    | "ALREADY_REVIEWED"
    | "DATABASE_ERROR";
}

/**
 * Authoritative Server Action to submit a Lister Review.
 *
 * Strict Enforcement:
 * 1. Authenticates current Clerk user via auth()
 * 2. Validates rating is integer 1 to 5
 * 3. Validates comment length (max 1000 characters) and strips dangerous content
 * 4. Checks booking exists in database and renter_id strictly matches authenticated user
 * 5. Checks rental completion status: booking status must be 'completed' or 'returned'
 * 6. Resolves lister_id from the listing owner in the database (never trusts client input)
 * 7. Enforces reviewer != lister (prevents self-review)
 * 8. Enforces one review per booking via database check and unique constraint
 * 9. Inserts using authenticated Supabase client
 * 10. Revalidates relevant paths
 */
interface AuthoritativeBookingParticipantContext {
  booking: {
    id: string;
    renter_id: string;
    status: string;
    listing_id: string;
  };
  listingOwnerId: string | null;
  listingId: string | null;
}

type RawBookingRecord = {
  id: string;
  renter_id: string;
  status: string;
  listing_id: string;
  listing?: unknown;
};

/**
 * Authoritatively resolves a booking and its parent listing owner.
 *
 * Guarantees:
 * 1. Checks user-scoped RLS client first, falling back to elevated service client
 *    if the user's Third-Party Auth token was blocked or unmapped in PostgREST.
 * 2. Correctly inspects both object and array representations of embedded listing relations.
 * 3. Falls back to direct listing lookup by listing_id to guarantee the owner ID is resolved
 *    even when the listing is not in 'available' status (e.g. rented or reserved).
 */
async function resolveAuthoritativeBooking(
  bookingId: string
): Promise<AuthoritativeBookingParticipantContext | null> {
  let rawBooking: RawBookingRecord | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("bookings")
      .select(`
        id,
        renter_id,
        status,
        listing_id,
        listing:listings(id, owner_id)
      `)
      .eq("id", bookingId)
      .maybeSingle();

    if (!error && data) {
      rawBooking = data as unknown as RawBookingRecord;
    }
  } catch (err) {
    console.warn("[resolveAuthoritativeBooking] User client query warning:", err);
  }

  // Elevate to service role client if user client query failed or returned no rows due to RLS
  if (!rawBooking) {
    try {
      const serviceClient = createSupabaseServiceClient();
      const { data: svcData, error: svcError } = await serviceClient
        .from("bookings")
        .select(`
          id,
          renter_id,
          status,
          listing_id,
          listing:listings(id, owner_id)
        `)
        .eq("id", bookingId)
        .maybeSingle();

      if (!svcError && svcData) {
        rawBooking = svcData as unknown as RawBookingRecord;
      }
    } catch (err) {
      console.error("[resolveAuthoritativeBooking] Service client query error:", err);
    }
  }

  if (!rawBooking) {
    return null;
  }

  // Extract listing owner ID and listing ID from embedded relation
  let listingOwnerId: string | null = null;
  let listingId: string | null = rawBooking.listing_id || null;

  const rawListing = rawBooking.listing;
  if (Array.isArray(rawListing) && rawListing.length > 0) {
    const first = rawListing[0] as { id?: string; owner_id?: string } | null;
    if (first?.owner_id) listingOwnerId = first.owner_id;
    if (first?.id) listingId = first.id;
  } else if (rawListing && typeof rawListing === "object") {
    const obj = rawListing as { id?: string; owner_id?: string };
    if (obj.owner_id) listingOwnerId = obj.owner_id;
    if (obj.id) listingId = obj.id;
  }

  // Direct lookup fallback if listing relation was omitted by PostgREST RLS
  if (!listingOwnerId && rawBooking.listing_id) {
    try {
      const serviceClient = createSupabaseServiceClient();
      const { data: directListing } = await serviceClient
        .from("listings")
        .select("id, owner_id")
        .eq("id", rawBooking.listing_id)
        .maybeSingle();

      if (directListing) {
        listingOwnerId = directListing.owner_id;
        listingId = directListing.id;
      }
    } catch (err) {
      console.warn("[resolveAuthoritativeBooking] Direct listing lookup error:", err);
    }
  }

  return {
    booking: {
      id: rawBooking.id,
      renter_id: rawBooking.renter_id,
      status: rawBooking.status,
      listing_id: rawBooking.listing_id,
    },
    listingOwnerId,
    listingId,
  };
}

export async function submitListerReviewAction(
  params: SubmitListerReviewParams
): Promise<SubmitListerReviewResult> {
  const { bookingId, rating, comment } = params;

  // 1. Strict Clerk Authentication
  const { userId } = await auth();
  if (!userId) {
    return {
      error: "You must be signed in to submit a review.",
      code: "AUTH_REQUIRED",
    };
  }

  // 2. Validate rating (1 to 5, integer only)
  if (!rating || typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return {
      error: "Please provide a valid star rating between 1 and 5.",
      code: "INVALID_INPUT",
    };
  }

  // 3. Validate comment length and sanity
  const sanitizedComment = comment?.trim() || null;
  if (sanitizedComment && sanitizedComment.length > 1000) {
    return {
      error: "Review comments must not exceed 1,000 characters.",
      code: "INVALID_INPUT",
    };
  }

  try {
    // 4. Fetch booking and corresponding listing to determine eligibility & lister ownership
    const resolved = await resolveAuthoritativeBooking(bookingId);
    if (!resolved) {
      return {
        error: "Booking record not found.",
        code: "BOOKING_NOT_FOUND",
      };
    }

    const { booking, listingOwnerId, listingId } = resolved;

    // 5. Verify caller is the actual renter of this booking (prevents IDOR)
    if (booking.renter_id !== userId) {
      return {
        error: "Unauthorized: You can only review rentals that you booked.",
        code: "NOT_ELIGIBLE",
      };
    }

    // 6. Verify booking reached eligible completion status
    const eligibleStatuses = ["completed", "returned"];
    if (!eligibleStatuses.includes(booking.status)) {
      return {
        error: `Only completed or returned rentals can be reviewed. Current rental status is: ${booking.status}.`,
        code: "NOT_ELIGIBLE",
      };
    }

    // 7. Resolve authoritative lister_id
    const listerId = listingOwnerId;
    if (!listerId) {
      return {
        error: "Unable to verify the equipment owner for this rental.",
        code: "DATABASE_ERROR",
      };
    }

    // 8. Prevent self-review
    if (listerId === userId) {
      return {
        error: "You cannot review yourself as an equipment host.",
        code: "SELF_REVIEW",
      };
    }

    // 9. Prevent duplicate review for this booking
    const serviceClient = createSupabaseServiceClient();
    const { data: existingReview } = await serviceClient
      .from("lister_reviews")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("reviewer_id", userId)
      .maybeSingle();

    if (existingReview) {
      return {
        error: "You have already submitted a review for this completed rental.",
        code: "ALREADY_REVIEWED",
      };
    }

    // 10. Perform authoritative database insertion
    const { data: newReview, error: insertError } = await serviceClient
      .from("lister_reviews")
      .insert({
        booking_id: bookingId,
        reviewer_id: userId,
        lister_id: listerId,
        rating,
        comment: sanitizedComment,
      })
      .select("id")
      .single();

    if (insertError || !newReview) {
      if (
        insertError?.code === "23505" ||
        insertError?.message?.toLowerCase().includes("unique") ||
        insertError?.message?.toLowerCase().includes("unique_booking_reviewer")
      ) {
        return {
          error: "A review has already been submitted for this booking.",
          code: "ALREADY_REVIEWED",
        };
      }
      console.error("[submitListerReviewAction] DB insert error:", insertError?.message);
      return {
        error: "Failed to save review in database. Please try again.",
        code: "DATABASE_ERROR",
      };
    }

    // 11. Revalidate routes
    revalidatePath("/dashboard");
    revalidatePath(`/profile/${listerId}`);
    if (listingId) {
      revalidatePath(`/listings/${listingId}`);
    }

    return {
      success: true,
      reviewId: newReview.id,
    };
  } catch (err) {
    console.error("[submitListerReviewAction] Server exception:", err);
    return {
      error: "An unexpected error occurred while submitting your review.",
      code: "DATABASE_ERROR",
    };
  }
}

export interface SubmitPreliminaryFeedbackParams {
  bookingId: string;
  communicationScore: number;
  punctualityScore: number;
  coordinationNotes?: string;
}

export interface SubmitPreliminaryFeedbackResult {
  success?: boolean;
  feedbackId?: string;
  error?: string;
  code?:
    | "AUTH_REQUIRED"
    | "INVALID_INPUT"
    | "BOOKING_NOT_FOUND"
    | "NOT_ELIGIBLE"
    | "ALREADY_SUBMITTED"
    | "DATABASE_ERROR";
}

/**
 * Authoritative Server Action for Preliminary Coordination Feedback on accepted rentals.
 * NOTE: This feedback is private to platform operations and strictly EXCLUDED from public star ratings.
 */
export async function submitPreliminaryFeedbackAction(
  params: SubmitPreliminaryFeedbackParams
): Promise<SubmitPreliminaryFeedbackResult> {
  const { bookingId, communicationScore, punctualityScore, coordinationNotes } = params;

  const { userId } = await auth();
  if (!userId) {
    return {
      error: "You must be signed in to submit coordination feedback.",
      code: "AUTH_REQUIRED",
    };
  }

  if (
    !communicationScore ||
    communicationScore < 1 ||
    communicationScore > 5 ||
    !punctualityScore ||
    punctualityScore < 1 ||
    punctualityScore > 5
  ) {
    return {
      error: "Please provide valid scores (1-5) for communication and punctuality.",
      code: "INVALID_INPUT",
    };
  }

  const sanitizedNotes = coordinationNotes?.trim() || null;
  if (sanitizedNotes && sanitizedNotes.length > 1000) {
    return {
      error: "Coordination notes must not exceed 1,000 characters.",
      code: "INVALID_INPUT",
    };
  }

  try {
    const resolved = await resolveAuthoritativeBooking(bookingId);
    if (!resolved) {
      return { error: "Booking record not found.", code: "BOOKING_NOT_FOUND" };
    }

    const { booking, listingOwnerId } = resolved;
    const isRenter = booking.renter_id === userId;
    const isOwner = Boolean(listingOwnerId && listingOwnerId === userId);

    if (!isRenter && !isOwner) {
      return {
        error: "Unauthorized: You are not a registered participant in this booking.",
        code: "NOT_ELIGIBLE",
      };
    }

    // Must be in an active coordination status
    const validStatuses = ["accepted", "paid", "active", "confirmed", "in_progress"];
    if (!validStatuses.includes(booking.status)) {
      return {
        error: `Preliminary coordination feedback can only be submitted for accepted bookings (current status: ${booking.status}).`,
        code: "NOT_ELIGIBLE",
      };
    }

    const counterpartyId = isRenter ? listingOwnerId : booking.renter_id;
    if (!counterpartyId) {
      console.warn(
        `[submitPreliminaryFeedbackAction] Could not resolve counterparty: bookingId=${bookingId}, isRenter=${isRenter}, listingOwnerId=${listingOwnerId}, renter_id=${booking.renter_id}`
      );
      return { error: "Could not resolve booking counterparty.", code: "DATABASE_ERROR" };
    }

    const serviceClient = createSupabaseServiceClient();

    // Check for existing preliminary feedback from this user
    try {
      const { data: existing } = await serviceClient
        .from("preliminary_feedback")
        .select("id")
        .eq("booking_id", bookingId)
        .eq("submitted_by", userId)
        .maybeSingle();

      if (existing) {
        return {
          error: "You have already submitted preliminary coordination feedback for this booking.",
          code: "ALREADY_SUBMITTED",
        };
      }
    } catch (checkErr) {
      console.warn("[submitPreliminaryFeedbackAction] Duplicate check warning:", checkErr);
    }

    // Insert feedback
    const payload = {
      booking_id: bookingId,
      submitted_by: userId,
      communication_rating: Math.round(communicationScore),
      notes: sanitizedNotes,
    };

    const { data: inserted, error: insErr } = await serviceClient
      .from("preliminary_feedback")
      .insert(payload)
      .select("id")
      .single();

    if (insErr || !inserted) {
      if (
        insErr?.code === "23505" ||
        insErr?.message?.toLowerCase().includes("unique") ||
        insErr?.message?.toLowerCase().includes("unique_preliminary_feedback")
      ) {
        return {
          error: "You have already submitted preliminary coordination feedback for this booking.",
          code: "ALREADY_SUBMITTED",
        };
      }
      console.error("[submitPreliminaryFeedbackAction] DB insert error:", insErr?.message);
      return {
        error: "Failed to save coordination feedback in database.",
        code: "DATABASE_ERROR",
      };
    }

    revalidatePath("/dashboard");
    return {
      success: true,
      feedbackId: inserted.id,
    };
  } catch (err) {
    console.error("[submitPreliminaryFeedbackAction] Exception:", err);
    return {
      error: "An unexpected error occurred while saving coordination feedback.",
      code: "DATABASE_ERROR",
    };
  }
}

export interface SubmitRenterReviewParams {
  bookingId: string;
  rating: number;
  comment?: string;
}

export interface SubmitRenterReviewResult {
  success?: boolean;
  reviewId?: string;
  error?: string;
  code?:
    | "AUTH_REQUIRED"
    | "INVALID_INPUT"
    | "BOOKING_NOT_FOUND"
    | "NOT_ELIGIBLE"
    | "SELF_REVIEW"
    | "ALREADY_REVIEWED"
    | "DATABASE_ERROR";
}

/**
 * Authoritative Server Action for Equipment Host reviewing a Renter (Reciprocal Review).
 * Eligible strictly on 'completed' or 'returned' bookings.
 */
export async function submitRenterReviewAction(
  params: SubmitRenterReviewParams
): Promise<SubmitRenterReviewResult> {
  const { bookingId, rating, comment } = params;

  const { userId } = await auth();
  if (!userId) {
    return {
      error: "You must be signed in to submit a review.",
      code: "AUTH_REQUIRED",
    };
  }

  if (!rating || typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return {
      error: "Please provide a valid rating between 1 and 5 stars.",
      code: "INVALID_INPUT",
    };
  }

  const sanitizedComment = comment?.trim() || null;
  if (sanitizedComment && sanitizedComment.length > 1000) {
    return {
      error: "Review comment must not exceed 1,000 characters.",
      code: "INVALID_INPUT",
    };
  }

  try {
    const resolved = await resolveAuthoritativeBooking(bookingId);
    if (!resolved) {
      return { error: "Booking record not found.", code: "BOOKING_NOT_FOUND" };
    }

    const { booking, listingOwnerId } = resolved;

    if (listingOwnerId !== userId) {
      return {
        error: "Unauthorized: Only the equipment host can review the renter.",
        code: "NOT_ELIGIBLE",
      };
    }

    if (!["completed", "returned"].includes(booking.status)) {
      return {
        error: `Only completed or returned rentals can receive verified reviews (current: ${booking.status}).`,
        code: "NOT_ELIGIBLE",
      };
    }

    if (booking.renter_id === userId) {
      return {
        error: "You cannot review yourself.",
        code: "SELF_REVIEW",
      };
    }

    const serviceClient = createSupabaseServiceClient();

    // Check if review already exists
    try {
      const { data: existing } = await serviceClient
        .from("renter_reviews")
        .select("id")
        .eq("booking_id", bookingId)
        .eq("reviewer_id", userId)
        .maybeSingle();

      if (existing) {
        return {
          error: "You have already reviewed the renter for this booking.",
          code: "ALREADY_REVIEWED",
        };
      }
    } catch {
      // Non-fatal if table check errors
    }

    const payload = {
      booking_id: bookingId,
      reviewer_id: userId,
      renter_id: booking.renter_id,
      rating,
      comment: sanitizedComment,
    };

    const { data: inserted, error: insErr } = await serviceClient
      .from("renter_reviews")
      .insert(payload)
      .select("id")
      .single();

    if (insErr || !inserted) {
      if (
        insErr?.code === "23505" ||
        insErr?.message?.toLowerCase().includes("unique") ||
        insErr?.message?.toLowerCase().includes("unique_renter_review")
      ) {
        return {
          error: "You have already reviewed the renter for this booking.",
          code: "ALREADY_REVIEWED",
        };
      }
      console.error("[submitRenterReviewAction] DB insert error:", insErr?.message);
      return {
        error: "Failed to save the review in database.",
        code: "DATABASE_ERROR",
      };
    }

    revalidatePath("/dashboard");
    revalidatePath(`/profile/${booking.renter_id}`);

    return {
      success: true,
      reviewId: inserted.id,
    };
  } catch (err) {
    console.error("[submitRenterReviewAction] Exception:", err);
    return {
      error: "An unexpected error occurred while saving the review.",
      code: "DATABASE_ERROR",
    };
  }
}

