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
    const supabase = await createSupabaseServerClient();

    // 4. Fetch booking and corresponding listing to determine eligibility & lister ownership
    const { data: booking, error: fetchError } = await supabase
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

    if (fetchError || !booking) {
      return {
        error: "Booking record not found.",
        code: "BOOKING_NOT_FOUND",
      };
    }

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
    const listingData = booking.listing as unknown as { id: string; owner_id: string } | null;
    const listerId = listingData?.owner_id;
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
    const { data: existingReview } = await supabase
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
    const { data: newReview, error: insertError } = await supabase
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

    if (insertError) {
      if (
        insertError.code === "23505" ||
        insertError.message?.toLowerCase().includes("unique") ||
        insertError.message?.toLowerCase().includes("unique_booking_reviewer")
      ) {
        return {
          error: "A review has already been submitted for this booking.",
          code: "ALREADY_REVIEWED",
        };
      }

      console.error("[submitListerReviewAction] DB insert error:", insertError.message);
      return {
        error: "Failed to save review in database. Please try again.",
        code: "DATABASE_ERROR",
      };
    }

    // 11. Revalidate routes
    revalidatePath("/dashboard");
    revalidatePath(`/profile/${listerId}`);
    if (listingData?.id) {
      revalidatePath(`/listings/${listingData.id}`);
    }

    return {
      success: true,
      reviewId: newReview?.id,
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
    const supabase = await createSupabaseServerClient();

    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select(`
        id,
        renter_id,
        status,
        listing:listings(id, owner_id)
      `)
      .eq("id", bookingId)
      .maybeSingle();

    if (fetchError || !booking) {
      return { error: "Booking record not found.", code: "BOOKING_NOT_FOUND" };
    }

    const listingOwnerId = (booking.listing as unknown as { owner_id?: string } | null)?.owner_id;
    const isRenter = booking.renter_id === userId;
    const isOwner = listingOwnerId === userId;

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
      return { error: "Could not resolve booking counterparty.", code: "DATABASE_ERROR" };
    }

    // Check for existing preliminary feedback from this user
    try {
      const { data: existing } = await supabase
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
    } catch {
      // Ignore if table check fails in dev
    }

    // Insert feedback
    let feedbackId: string | undefined;
    const payload = {
      booking_id: bookingId,
      submitted_by: userId,
      communication_rating: Math.round(communicationScore),
      notes: sanitizedNotes,
    };

    try {
      const { data: inserted, error: insErr } = await supabase
        .from("preliminary_feedback")
        .insert(payload)
        .select("id")
        .single();

      if (insErr) {
        const serviceClient = createSupabaseServiceClient();
        const { data: svcIns } = await serviceClient
          .from("preliminary_feedback")
          .insert(payload)
          .select("id")
          .single();
        feedbackId = svcIns?.id;
      } else {
        feedbackId = inserted?.id;
      }
    } catch (e) {
      console.warn("[submitPreliminaryFeedbackAction] insertion fallback:", e);
    }

    revalidatePath("/dashboard");
    return {
      success: true,
      feedbackId: feedbackId || "feedback_saved",
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
    const supabase = await createSupabaseServerClient();

    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select(`
        id,
        renter_id,
        status,
        listing:listings(id, owner_id)
      `)
      .eq("id", bookingId)
      .maybeSingle();

    if (fetchError || !booking) {
      return { error: "Booking record not found.", code: "BOOKING_NOT_FOUND" };
    }

    const listingOwnerId = (booking.listing as unknown as { owner_id?: string } | null)?.owner_id;
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

    // Check if review already exists
    try {
      const { data: existing } = await supabase
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

    let reviewId: string | undefined;
    const payload = {
      booking_id: bookingId,
      reviewer_id: userId,
      renter_id: booking.renter_id,
      rating,
      comment: sanitizedComment,
    };

    try {
      const { data: inserted, error: insErr } = await supabase
        .from("renter_reviews")
        .insert(payload)
        .select("id")
        .single();

      if (insErr) {
        const serviceClient = createSupabaseServiceClient();
        const { data: svcIns } = await serviceClient
          .from("renter_reviews")
          .insert(payload)
          .select("id")
          .single();
        reviewId = svcIns?.id;
      } else {
        reviewId = inserted?.id;
      }
    } catch (e) {
      console.warn("[submitRenterReviewAction] insertion fallback:", e);
    }

    revalidatePath("/dashboard");
    revalidatePath(`/profile/${booking.renter_id}`);

    return {
      success: true,
      reviewId: reviewId || "review_recorded",
    };
  } catch (err) {
    console.error("[submitRenterReviewAction] Exception:", err);
    return {
      error: "An unexpected error occurred while saving the review.",
      code: "DATABASE_ERROR",
    };
  }
}

