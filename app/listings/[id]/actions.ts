"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
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
  code?:
    | "AUTH_REQUIRED"
    | "DEMO_LISTING"
    | "INVALID_ID"
    | "NOT_FOUND"
    | "PERMISSION_DENIED"
    | "DB_ERROR"
    | "OWN_LISTING"
    | "OVERLAP"
    | "INVALID_DATES"
    | "UNAVAILABLE"
    | "ERROR";
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

  const correlationId = crypto.randomUUID();

  // 3. Separate mock/demo listings from real UUID database listings
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isMockListing = listingId.startsWith("lst-") || listingId.startsWith("mock-");

  if (isMockListing) {
    console.warn("[createBookingAction] Booking requested on demo/mock listing:", {
      correlationId,
      listingId,
    });
    return {
      error: "This is a demonstration listing and cannot accept rental bookings. Please select an active marketplace listing.",
      code: "DEMO_LISTING",
    };
  }

  if (!UUID_REGEX.test(listingId)) {
    console.warn("[createBookingAction] Invalid listing identifier format:", {
      correlationId,
      listingId,
    });
    return {
      error: "The requested equipment listing identifier is invalid.",
      code: "INVALID_ID",
    };
  }

  // 4. Connect to Supabase with authenticated caller client
  try {
    const supabase = await createSupabaseServerClient();

    // 5. Check user profile account status (fail-closed, with lazy-sync fallback)
    const { data: initialProfile, error: profileError } = await supabase
      .from("profiles")
      .select("status")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    let userProfile = initialProfile;

    if (profileError) {
      console.error("[createBookingAction] Profile status lookup database error:", {
        correlationId,
        listingId,
        code: profileError.code,
        errorDetails: profileError.message,
      });
      return {
        error: "A database error occurred while verifying your account. Please try again later.",
        code: "DB_ERROR",
      };
    }

    // If profile is not found, the user may have just signed up before webhook sync finished.
    // Perform an authoritative lazy-sync using the authenticated currentUser() session.
    if (!userProfile) {
      try {
        const user = await currentUser();
        if (user && user.id === userId) {
          const primaryEmail =
            user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
              ?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;

          const { data: syncedProfile, error: syncError } = await supabase
            .from("profiles")
            .upsert(
              {
                clerk_user_id: user.id,
                email: primaryEmail,
                first_name: user.firstName ?? null,
                last_name: user.lastName ?? null,
                avatar_url: user.imageUrl || null,
                role: "customer",
                status: "active",
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "clerk_user_id",
                ignoreDuplicates: false,
              }
            )
            .select("status")
            .single();

          if (!syncError && syncedProfile) {
            userProfile = syncedProfile;
            console.info("[createBookingAction] Auto-synced missing user profile on demand:", {
              correlationId,
              userId,
            });
          }
        }
      } catch (syncErr) {
        console.warn("[createBookingAction] Lazy profile sync attempt failed:", syncErr);
      }
    }

    if (!userProfile) {
      console.warn("[createBookingAction] User profile not found for authenticated user:", {
        correlationId,
        listingId,
        userId,
      });
      return {
        error: "Your user profile could not be found or verified. Please try again later.",
        code: "DB_ERROR",
      };
    }

    if (userProfile.status === "restricted") {
      console.warn("[createBookingAction] Restricted user attempted booking:", {
        correlationId,
        listingId,
        status: userProfile.status,
      });
      return {
        error: "Your account is currently restricted from submitting rental requests.",
        code: "ERROR",
      };
    }
    if (userProfile.status === "banned" || userProfile.status === "deleted") {
      console.warn("[createBookingAction] Suspended user attempted booking:", {
        correlationId,
        listingId,
        status: userProfile.status,
      });
      return {
        error: "Your account is suspended and cannot initiate rental bookings.",
        code: "ERROR",
      };
    }

    // 6. Fetch authoritative listing from database
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("id, owner_id, status, price_per_day, title")
      .eq("id", listingId)
      .maybeSingle();

    if (listingError) {
      console.error("[createBookingAction] Database query error for listing:", {
        correlationId,
        listingId,
        code: listingError.code,
        errorDetails: listingError.message,
      });

      // Permission denied / RLS denial
      if (listingError.code === "42501") {
        return {
          error: "You do not have permission to view or book this listing.",
          code: "PERMISSION_DENIED",
        };
      }

      return {
        error: "A database error occurred while retrieving the listing. Please try again later.",
        code: "DB_ERROR",
      };
    }

    if (!listing) {
      console.warn("[createBookingAction] Listing ID not found in database:", {
        correlationId,
        listingId,
      });
      return {
        error: "The requested equipment listing was not found.",
        code: "NOT_FOUND",
      };
    }

    // 6. Authoritative listing status check: ONLY 'available' can be booked
    if (listing.status !== "available") {
      console.warn("[createBookingAction] Listing unavailable for booking:", {
        correlationId,
        listingId,
        status: listing.status,
      });

      let safeStatusMessage: string;
      const statusValue = listing.status as string;
      if (statusValue === "archived") {
        safeStatusMessage = "This equipment listing has been archived and is no longer available for booking.";
      } else if (statusValue === "restricted") {
        safeStatusMessage = "This equipment listing is restricted and cannot be booked.";
      } else if (statusValue === "deleted") {
        safeStatusMessage = "This equipment listing has been removed and is no longer available.";
      } else if (statusValue === "maintenance") {
        safeStatusMessage = "This equipment is currently undergoing maintenance and cannot be booked.";
      } else if (statusValue === "inactive") {
        safeStatusMessage = "This equipment listing is currently inactive and cannot be booked.";
      } else {
        safeStatusMessage = `This equipment is currently ${listing.status} and cannot be booked.`;
      }

      return {
        error: safeStatusMessage,
        code: "UNAVAILABLE",
      };
    }

    // 7. Prevent booking own listing
    if (listing.owner_id && listing.owner_id === userId) {
      console.info("[createBookingAction] Owner attempted booking own listing:", {
        correlationId,
        listingId,
        userId,
      });
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
    const { data: overlappingBookings, error: overlapError } = await supabase
      .from("bookings")
      .select("id")
      .eq("listing_id", listingId)
      .in("status", [...RESERVATION_BLOCKING_STATUSES])
      .lte("start_date", endDate)
      .gte("end_date", startDate);

    if (overlapError) {
      console.error("[createBookingAction] Database error checking booking overlap:", {
        correlationId,
        listingId,
        code: overlapError.code,
        errorDetails: overlapError.message,
      });
      return {
        error: "A database error occurred while verifying reservation availability. Please try again later.",
        code: "DB_ERROR",
      };
    }

    if (overlappingBookings && overlappingBookings.length > 0) {
      console.info("[createBookingAction] Overlapping reservation conflict detected:", {
        correlationId,
        listingId,
        conflictCount: overlappingBookings.length,
      });
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
        console.warn("[createBookingAction] Exclusion constraint violation on insert:", {
          correlationId,
          listingId,
          code: errorCode,
        });
        return {
          error: "These dates conflict with an existing reservation. Please select different dates.",
          code: "OVERLAP",
        };
      }

      console.error("[createBookingAction] Database insert error:", {
        correlationId,
        listingId,
        code: errorCode,
        errorDetails: insertError.message,
      });
      return {
        error: "Unable to submit your booking right now. Please try again.",
        code: "ERROR",
      };
    }

    if (!newBooking?.id) {
      console.error("[createBookingAction] Booking insertion returned empty ID:", {
        correlationId,
        listingId,
      });
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

    console.error("[createBookingAction] Server exception:", {
      listingId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      error: "Unable to submit your booking right now. Please try again.",
      code: "ERROR",
    };
  }
}
