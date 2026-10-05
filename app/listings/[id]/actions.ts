"use server";

import { auth } from "@clerk/nextjs/server";
import { parseISO, isBefore, startOfToday } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMarketplaceListingById } from "@/lib/supabase/marketplace";
import { MOCK_BOOKINGS } from "@/lib/marketplace/mock-listings";

export interface CreateBookingParams {
  listingId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalPrice: number;
}

export interface CreateBookingResult {
  success?: boolean;
  bookingId?: string;
  error?: string;
  code?: "AUTH_REQUIRED" | "OWN_LISTING" | "OVERLAP" | "INVALID_DATES" | "ERROR";
}

export async function createBookingAction(
  params: CreateBookingParams
): Promise<CreateBookingResult> {
  const { listingId, startDate, endDate, totalPrice } = params;

  // 1. Requires login
  const { userId } = await auth();
  if (!userId) {
    return {
      error: "You must be signed in to request a booking.",
      code: "AUTH_REQUIRED",
    };
  }

  // 2. Validate date range
  if (!startDate || !endDate) {
    return {
      error: "Please select both a start date and an end date.",
      code: "INVALID_DATES",
    };
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const today = startOfToday();

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

  // 3. Blocks booking own listing
  const listing = await getMarketplaceListingById(listingId);
  if (!listing) {
    return {
      error: "Listing not found.",
      code: "ERROR",
    };
  }

  if (listing.owner_id && listing.owner_id === userId) {
    return {
      error: "You cannot book your own listing.",
      code: "OWN_LISTING",
    };
  }

  // 4. Try Supabase insert with overlap constraint
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("bookings")
      .insert({
        listing_id: listingId,
        renter_id: userId,
        start_date: startDate,
        end_date: endDate,
        total_price: totalPrice,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      const errorMsg = (error.message || "").toLowerCase();
      const errorCode = error.code || "";

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

      console.warn("[createBookingAction] Supabase error, falling back to local check:", error.message);
    } else if (data?.id) {
      return {
        success: true,
        bookingId: data.id,
      };
    }
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
    console.warn("[createBookingAction] Supabase exception, using fallback check:", err);
  }

  // 5. Fallback: check overlap against mock bookings with active status
  const isOverlapping = MOCK_BOOKINGS.some((b) => {
    if (b.listing_id !== listingId) return false;
    if (!["accepted", "paid", "active"].includes(b.status)) return false;
    return !(endDate < b.start_date || startDate > b.end_date);
  });

  if (isOverlapping) {
    return {
      error: "These dates conflict with an existing reservation. Please select different dates.",
      code: "OVERLAP",
    };
  }

  const mockBookingId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  MOCK_BOOKINGS.push({
    id: mockBookingId,
    listing_id: listingId,
    renter_id: userId,
    start_date: startDate,
    end_date: endDate,
    total_price: totalPrice,
    status: "pending",
    created_at: new Date().toISOString(),
  });

  return {
    success: true,
    bookingId: mockBookingId,
  };
}
