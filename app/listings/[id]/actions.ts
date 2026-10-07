"use server";

import { auth } from "@clerk/nextjs/server";
import { parseISO, isBefore, startOfToday } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RESERVATION_BLOCKING_STATUSES } from "@/lib/supabase/marketplace";
import { calculateInclusiveRentalDays, calculateRentalTotalPrice } from "@/lib/utils";

export interface CreateBookingParams {
  listingId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalPrice?: number; // Client-supplied hint; server recalculates authoritatively
}

export interface CreateBookingResult {
  success?: boolean;
  bookingId?: string;
  serverTotalPrice?: number;
  error?: string;
  code?: "AUTH_REQUIRED" | "OWN_LISTING" | "OVERLAP" | "INVALID_DATES" | "UNAVAILABLE" | "ERROR";
}

/**
 * Authoritative Server Action for creating an equipment rental booking.
 *
 * SECURITY & DATA INTEGRITY GUARANTEES:
 * 1. Strict authentication via Clerk `auth()`.
 * 2. Input validation for date sequence and past date restrictions.
 * 3. Authoritative server-side price calculation using database `price_per_day`.
 *    Client-supplied price is NEVER trusted or inserted directly.
 * 4. Authoritative listing availability check (status must strictly be 'available').
 * 5. Prevents owners from booking their own equipment.
 * 6. Checks renter account governance status (restricted, banned, deleted).
 * 7. Server-side overlap checks and PostgreSQL exclusion constraint handling.
 * 8. NO false success via mock data fallback — failed DB operations return clear errors.
 */
export async function createBookingAction(
  params: CreateBookingParams
): Promise<CreateBookingResult> {
  const { listingId, startDate, endDate } = params;

  // 1. Requires login
  const { userId } = await auth();
  if (!userId) {
    return {
      error: "You must be signed in to request a booking.",
      code: "AUTH_REQUIRED",
    };
  }

  // 2. Validate date inputs
  if (!startDate || !endDate) {
    return {
      error: "Please select both a start date and an end date.",
      code: "INVALID_DATES",
    };
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const today = startOfToday();

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return {
      error: "Invalid rental dates specified.",
      code: "INVALID_DATES",
    };
  }

  if (isBefore(start, today)) {
    return {
      error: "Rental start date cannot be in the past.",
      code: "INVALID_DATES",
    };
  }

  if (isBefore(end, start)) {
    return {
      error: "Rental end date must be on or after the start date.",
      code: "INVALID_DATES",
    };
  }

  // 3. Connect to Supabase with authenticated caller client
  try {
    const supabase = await createSupabaseServerClient();

    // 4. Check user profile account status
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("status")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (userProfile?.status === "restricted") {
      return {
        error: "Your account is currently restricted from submitting rental requests.",
        code: "ERROR",
      };
    }
    if (userProfile?.status === "banned" || userProfile?.status === "deleted") {
      return {
        error: "Your account is suspended and cannot initiate rental bookings.",
        code: "ERROR",
      };
    }

    // 5. Fetch authoritative listing from database
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("id, owner_id, status, price_per_day, title")
      .eq("id", listingId)
      .maybeSingle();

    if (listingError || !listing) {
      return {
        error: "Equipment listing not found or is no longer available.",
        code: "ERROR",
      };
    }

    // 6. Authoritative listing status check: ONLY 'available' can be booked
    if (listing.status !== "available") {
      return {
        error: `This equipment is currently ${listing.status} and cannot be booked.`,
        code: "UNAVAILABLE",
      };
    }

    // 7. Prevent booking own listing
    if (listing.owner_id && listing.owner_id === userId) {
      return {
        error: "You cannot book your own listing.",
        code: "OWN_LISTING",
      };
    }

    // 8. Server-side authoritative price calculation (NEVER trust client price)
    const pricePerDay = Number(listing.price_per_day);
    if (isNaN(pricePerDay) || pricePerDay < 0) {
      return {
        error: "Invalid equipment daily rate in database.",
        code: "ERROR",
      };
    }

    const rentalDays = calculateInclusiveRentalDays(start, end);
    if (rentalDays < 1) {
      return {
        error: "Rental duration must be at least 1 day.",
        code: "INVALID_DATES",
      };
    }

    const authoritativeTotalPrice = calculateRentalTotalPrice(pricePerDay, start, end);

    // 9. Server-side overlap check against active reservations
    const { data: overlappingBookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("listing_id", listingId)
      .in("status", [...RESERVATION_BLOCKING_STATUSES])
      .lte("start_date", endDate)
      .gte("end_date", startDate);

    if (overlappingBookings && overlappingBookings.length > 0) {
      return {
        error: "These dates conflict with an existing reservation. Please select different dates.",
        code: "OVERLAP",
      };
    }

    // 10. Insert booking into database
    const { data: newBooking, error: insertError } = await supabase
      .from("bookings")
      .insert({
        listing_id: listingId,
        renter_id: userId,
        start_date: startDate,
        end_date: endDate,
        total_price: authoritativeTotalPrice,
        status: "pending",
      })
      .select("id, total_price")
      .single();

    if (insertError) {
      const errorMsg = (insertError.message || "").toLowerCase();
      const errorCode = insertError.code || "";

      // PostgreSQL 23P01 is exclusion_violation
      if (
        errorCode === "23P01" ||
        errorMsg.includes("exclusion") ||
        errorMsg.includes("overlap") ||
        errorMsg.includes("no_overlapping_active_bookings") ||
        errorMsg.includes("conflicting") ||
        errorMsg.includes("range")
      ) {
        return {
          error: "These dates conflict with an existing reservation. Please select different dates.",
          code: "OVERLAP",
        };
      }

      console.error("[createBookingAction] Database insert error:", insertError.message);
      return {
        error: "Unable to submit your booking right now. Please try again.",
        code: "ERROR",
      };
    }

    if (!newBooking?.id) {
      return {
        error: "Unable to submit your booking right now. Please try again.",
        code: "ERROR",
      };
    }

    return {
      success: true,
      bookingId: newBooking.id,
      serverTotalPrice: authoritativeTotalPrice,
    };
  } catch (err: unknown) {
    const errObj = err as { code?: string; message?: string };
    if (
      errObj?.code === "23P01" ||
      errObj?.message?.toLowerCase().includes("overlap") ||
      errObj?.message?.toLowerCase().includes("exclusion")
    ) {
      return {
        error: "These dates conflict with an existing reservation. Please select different dates.",
        code: "OVERLAP",
      };
    }

    console.error("[createBookingAction] Server exception:", err);
    return {
      error: "Unable to submit your booking right now. Please try again.",
      code: "ERROR",
    };
  }
}
