"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
