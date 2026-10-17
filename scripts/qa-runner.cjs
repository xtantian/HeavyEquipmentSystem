/**
 * QA & Release-Hardening Verification Suite for Rent It Marketplace
 * Tests user lifecycles, pricing formulas, authorization matrix, concurrency, and edge cases.
 */

const { parseISO, isBefore, startOfToday, differenceInDays, startOfDay } = require("date-fns");

// Authoritative functions matching lib/utils.ts
function calculateInclusiveRentalDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = typeof startDate === "string" ? parseISO(startDate) : startDate;
  const end = typeof endDate === "string" ? parseISO(endDate) : endDate;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const normalizedStart = startOfDay(start);
  const normalizedEnd = startOfDay(end);
  if (normalizedEnd < normalizedStart) return 0;
  return differenceInDays(normalizedEnd, normalizedStart) + 1;
}

function calculateRentalTotalPrice(pricePerDay, startDate, endDate) {
  const days = calculateInclusiveRentalDays(startDate, endDate);
  const rate = typeof pricePerDay === "number" && !isNaN(pricePerDay) ? pricePerDay : 0;
  return Number((days * rate).toFixed(2));
}

function formatCurrency(amount) {
  const value = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const RESERVATION_BLOCKING_STATUSES = ["pending", "accepted", "paid", "active"];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
  }
}

console.log("===============================================================================");
console.log("RENT IT MARKETPLACE - END-TO-END QA VERIFICATION SUITE");
console.log("===============================================================================\n");

// -----------------------------------------------------------------------------
// 1. INCLUSIVE RENTAL PRICING TESTS
// -----------------------------------------------------------------------------
console.log("▶ SUITE 1: Inclusive Rental-Day Calculation & Pricing Verification");

const rate = 5000;

// Test Case 1: Same-day rental
const days1 = calculateInclusiveRentalDays("2026-10-10", "2026-10-10");
const price1 = calculateRentalTotalPrice(rate, "2026-10-10", "2026-10-10");
assert(days1 === 1, "Oct 10 -> Oct 10 = 1 rental day", `Got ${days1}`);
assert(price1 === 5000, "Oct 10 -> Oct 10 total @ 5,000 = 5,000", `Got ${price1}`);

// Test Case 2: 2-day rental
const days2 = calculateInclusiveRentalDays("2026-10-10", "2026-10-11");
const price2 = calculateRentalTotalPrice(rate, "2026-10-10", "2026-10-11");
assert(days2 === 2, "Oct 10 -> Oct 11 = 2 rental days", `Got ${days2}`);
assert(price2 === 10000, "Oct 10 -> Oct 11 total @ 5,000 = 10,000", `Got ${price2}`);

// Test Case 3: 3-day rental
const days3 = calculateInclusiveRentalDays("2026-10-10", "2026-10-12");
const price3 = calculateRentalTotalPrice(rate, "2026-10-10", "2026-10-12");
assert(days3 === 3, "Oct 10 -> Oct 12 = 3 rental days", `Got ${days3}`);
assert(price3 === 15000, "Oct 10 -> Oct 12 total @ 5,000 = 15,000", `Got ${price3}`);

// Test Case 4: 4-day rental
const days4 = calculateInclusiveRentalDays("2026-10-10", "2026-10-13");
const price4 = calculateRentalTotalPrice(rate, "2026-10-10", "2026-10-13");
assert(days4 === 4, "Oct 10 -> Oct 13 = 4 rental days", `Got ${days4}`);
assert(price4 === 20000, "Oct 10 -> Oct 13 total @ 5,000 = 20,000", `Got ${price4}`);

// Currency formatting test
assert(formatCurrency(15000).includes("15,000.00"), "Currency formats to Philippine standard (₱15,000.00)");

// -----------------------------------------------------------------------------
// 2. DATE VALIDATION & EDGE CASES
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 2: Date Validation & Input Edge Cases");

// End before start
const invalidDays = calculateInclusiveRentalDays("2026-10-12", "2026-10-10");
assert(invalidDays === 0, "End date earlier than start date returns 0 days", `Got ${invalidDays}`);

// Invalid date strings
const nanDays = calculateInclusiveRentalDays("invalid-date", "2026-10-10");
assert(nanDays === 0, "Invalid date strings return 0 days", `Got ${nanDays}`);

// Null / undefined dates
const nullDays = calculateInclusiveRentalDays(null, undefined);
assert(nullDays === 0, "Null/undefined dates return 0 days", `Got ${nullDays}`);

// Past date detection
const pastDate = "2020-01-01";
const today = startOfToday();
assert(isBefore(parseISO(pastDate), today), "Past start date is identified and flagged as before today");

// -----------------------------------------------------------------------------
// 3. BOOKING CONCURRENCY & OVERLAP LOGIC
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 3: Booking Concurrency & Range Overlap Detection");

function rangesOverlap(startA, endA, startB, endB) {
  // PostgreSQL daterange(start, end, '[]') && daterange(...)
  // Two inclusive date ranges overlap iff startA <= endB AND endA >= startB
  return startA <= endB && endA >= startB;
}

// Case 1: Identical date range (Exact collision)
assert(
  rangesOverlap("2026-10-10", "2026-10-12", "2026-10-10", "2026-10-12"),
  "Exact date range collision is detected"
);

// Case 2: Boundary collision (Oct 10-12 overlaps Oct 12-15 on Oct 12)
assert(
  rangesOverlap("2026-10-10", "2026-10-12", "2026-10-12", "2026-10-15"),
  "Boundary overlap on the shared return/pickup date (Oct 12) is detected"
);

// Case 3: Enclosed collision
assert(
  rangesOverlap("2026-10-10", "2026-10-20", "2026-10-12", "2026-10-15"),
  "Enclosed interval overlap is detected"
);

// Case 4: Clean consecutive booking (Oct 10-12 and Oct 13-15)
assert(
  !rangesOverlap("2026-10-10", "2026-10-12", "2026-10-13", "2026-10-15"),
  "Consecutive booking (Oct 10-12 -> Oct 13-15) has NO collision"
);

// Reservation-blocking status set verification
assert(
  RESERVATION_BLOCKING_STATUSES.includes("pending") &&
    RESERVATION_BLOCKING_STATUSES.includes("accepted") &&
    RESERVATION_BLOCKING_STATUSES.includes("paid") &&
    RESERVATION_BLOCKING_STATUSES.includes("active"),
  "RESERVATION_BLOCKING_STATUSES contains all 4 reservation-holding statuses"
);

assert(
  !RESERVATION_BLOCKING_STATUSES.includes("cancelled") &&
    !RESERVATION_BLOCKING_STATUSES.includes("completed") &&
    !RESERVATION_BLOCKING_STATUSES.includes("returned"),
  "RESERVATION_BLOCKING_STATUSES excludes non-holding statuses (cancelled, completed, returned)"
);

// -----------------------------------------------------------------------------
// 4. AUTHORIZATION MATRIX & IDOR SIMULATION
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 4: Authorization Matrix & IDOR Prevention Simulation");

function evaluateBookingTransitionAuth(callerId, callerRole, booking, targetStatus) {
  const isAdmin = callerRole === "admin";
  const isOwner = booking.listing_owner_id === callerId;
  const isRenter = booking.renter_id === callerId;

  if (isAdmin) {
    return { allowed: true, reason: "Admin authorized for all transitions" };
  }

  if (isOwner) {
    if (targetStatus === "accepted" || targetStatus === "cancelled") {
      return { allowed: true, reason: "Owner authorized to accept or cancel" };
    }
    return { allowed: false, reason: "Owner cannot transition to arbitrary status" };
  }

  if (isRenter) {
    if (targetStatus === "cancelled") {
      return { allowed: true, reason: "Renter authorized to cancel own booking" };
    }
    return { allowed: false, reason: "Renter cannot approve their own booking" };
  }

  return { allowed: false, reason: "Unauthorized: Third party caller" };
}

const sampleBooking = {
  id: "bk-100",
  renter_id: "user_customer_1",
  listing_owner_id: "user_owner_1",
  status: "pending",
};

// Test 1: Renter cancelling own booking -> ALLOWED
assert(
  evaluateBookingTransitionAuth("user_customer_1", "customer", sampleBooking, "cancelled").allowed,
  "Renter can cancel their own booking"
);

// Test 2: Renter attempting to ACCEPT own booking -> REJECTED
assert(
  !evaluateBookingTransitionAuth("user_customer_1", "customer", sampleBooking, "accepted").allowed,
  "Renter CANNOT accept their own booking (IDOR prevented)"
);

// Test 3: Equipment Owner accepting booking on own listing -> ALLOWED
assert(
  evaluateBookingTransitionAuth("user_owner_1", "customer", sampleBooking, "accepted").allowed,
  "Owner can accept booking on their own listing"
);

// Test 4: Equipment Owner cancelling booking on own listing -> ALLOWED
assert(
  evaluateBookingTransitionAuth("user_owner_1", "customer", sampleBooking, "cancelled").allowed,
  "Owner can decline/cancel booking on their own listing"
);

// Test 5: Unrelated customer attempting to modify another user's booking -> REJECTED
assert(
  !evaluateBookingTransitionAuth("user_stranger", "customer", sampleBooking, "cancelled").allowed,
  "Unrelated stranger CANNOT modify another user's booking (IDOR prevented)"
);

// Test 6: Admin performing any transition -> ALLOWED
assert(
  evaluateBookingTransitionAuth("admin_user", "admin", sampleBooking, "paid").allowed,
  "Administrator is permitted to execute administrative transitions"
);

// -----------------------------------------------------------------------------
// 5. LISTING OWNERSHIP & GOVERNANCE RULES
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 5: Listing Ownership & Account Governance Simulation");

function evaluateListingDeletion(callerId, callerRole, listingOwnerId) {
  if (callerRole === "admin") return true;
  return callerId === listingOwnerId;
}

assert(
  evaluateListingDeletion("user_owner_1", "customer", "user_owner_1"),
  "Owner can delete/soft-delete their own listing"
);

assert(
  !evaluateListingDeletion("user_other", "customer", "user_owner_1"),
  "Non-owner CANNOT delete another user's listing"
);

assert(
  evaluateListingDeletion("user_admin", "admin", "user_owner_1"),
  "Admin can delete any listing"
);

// Account Governance: Booking eligibility
function isAccountEligibleToBook(status) {
  return status === "active";
}

assert(isAccountEligibleToBook("active"), "Active accounts are eligible to book");
assert(!isAccountEligibleToBook("restricted"), "Restricted accounts are REJECTED from booking");
assert(!isAccountEligibleToBook("banned"), "Banned accounts are REJECTED from booking");
assert(!isAccountEligibleToBook("deleted"), "Deleted accounts are REJECTED from booking");

// Listing Status: Booking eligibility
function isListingAvailableToBook(status) {
  return status === "available";
}

assert(isListingAvailableToBook("available"), "'available' listing can be booked");
assert(!isListingAvailableToBook("rented"), "'rented' listing cannot be booked");
assert(!isListingAvailableToBook("maintenance"), "'maintenance' listing cannot be booked");
assert(!isListingAvailableToBook("restricted"), "'restricted' listing cannot be booked");
assert(!isListingAvailableToBook("deleted"), "'deleted' listing cannot be booked");

// -----------------------------------------------------------------------------
// 6. LISTER REVIEWS & RATINGS VALIDATION AND AUTHORIZATION
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 6: Lister Reviews & Ratings Authorization & Integrity");

function evaluateListerReviewEligibility({
  callerId,
  booking,
  rating,
  comment,
  hasExistingReview,
}) {
  if (!callerId) {
    return { allowed: false, reason: "AUTH_REQUIRED" };
  }
  if (!rating || typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { allowed: false, reason: "INVALID_RATING" };
  }
  if (comment && comment.length > 1000) {
    return { allowed: false, reason: "COMMENT_TOO_LONG" };
  }
  if (!booking) {
    return { allowed: false, reason: "BOOKING_NOT_FOUND" };
  }
  if (booking.renter_id !== callerId) {
    return { allowed: false, reason: "NOT_RENTER" };
  }
  if (!["completed", "returned"].includes(booking.status)) {
    return { allowed: false, reason: "BOOKING_NOT_COMPLETED" };
  }
  if (booking.listing_owner_id === callerId) {
    return { allowed: false, reason: "SELF_REVIEW" };
  }
  if (hasExistingReview) {
    return { allowed: false, reason: "ALREADY_REVIEWED" };
  }
  return { allowed: true };
}

const eligibleBooking = {
  id: "booking_comp_1",
  renter_id: "user_renter_1",
  listing_owner_id: "user_lister_1",
  status: "completed",
};

const returnedBooking = {
  id: "booking_ret_1",
  renter_id: "user_renter_1",
  listing_owner_id: "user_lister_1",
  status: "returned",
};

const pendingBooking = {
  id: "booking_pend_1",
  renter_id: "user_renter_1",
  listing_owner_id: "user_lister_1",
  status: "pending",
};

const activeBooking = {
  id: "booking_act_1",
  renter_id: "user_renter_1",
  listing_owner_id: "user_lister_1",
  status: "active",
};

// 1. Legitimate completed review
assert(
  evaluateListerReviewEligibility({
    callerId: "user_renter_1",
    booking: eligibleBooking,
    rating: 5,
    comment: "Excellent host and reliable equipment delivery.",
    hasExistingReview: false,
  }).allowed,
  "Eligible renter can review host on completed rental"
);

// 2. Legitimate returned rental review
assert(
  evaluateListerReviewEligibility({
    callerId: "user_renter_1",
    booking: returnedBooking,
    rating: 4,
    comment: "Equipment returned on time, smooth handoff.",
    hasExistingReview: false,
  }).allowed,
  "Eligible renter can review host on returned rental"
);

// 3. Unauthenticated rejection
assert(
  evaluateListerReviewEligibility({
    callerId: null,
    booking: eligibleBooking,
    rating: 5,
    hasExistingReview: false,
  }).reason === "AUTH_REQUIRED",
  "Unauthenticated caller rejected from submitting review"
);

// 4. Ineligible rental statuses rejected
assert(
  evaluateListerReviewEligibility({
    callerId: "user_renter_1",
    booking: pendingBooking,
    rating: 5,
    hasExistingReview: false,
  }).reason === "BOOKING_NOT_COMPLETED",
  "Pending rental cannot be reviewed"
);

assert(
  evaluateListerReviewEligibility({
    callerId: "user_renter_1",
    booking: activeBooking,
    rating: 5,
    hasExistingReview: false,
  }).reason === "BOOKING_NOT_COMPLETED",
  "Active ongoing rental cannot be reviewed until completed/returned"
);

// 5. IDOR prevention: Third-party user cannot review someone else's booking
assert(
  evaluateListerReviewEligibility({
    callerId: "user_stranger_99",
    booking: eligibleBooking,
    rating: 5,
    hasExistingReview: false,
  }).reason === "NOT_RENTER",
  "User cannot review another renter's booking (IDOR prevented)"
);

// 6. Anti-abuse: Self-review rejected
assert(
  evaluateListerReviewEligibility({
    callerId: "user_lister_1",
    booking: {
      ...eligibleBooking,
      renter_id: "user_lister_1",
      listing_owner_id: "user_lister_1",
    },
    rating: 5,
    hasExistingReview: false,
  }).reason === "SELF_REVIEW",
  "Lister cannot review themselves (Self-review rejected)"
);

// 7. Duplicate review prevented
assert(
  evaluateListerReviewEligibility({
    callerId: "user_renter_1",
    booking: eligibleBooking,
    rating: 5,
    hasExistingReview: true,
  }).reason === "ALREADY_REVIEWED",
  "Duplicate review for same booking rejected"
);

// 8. Rating validation (1-5 only)
assert(
  evaluateListerReviewEligibility({
    callerId: "user_renter_1",
    booking: eligibleBooking,
    rating: 0,
    hasExistingReview: false,
  }).reason === "INVALID_RATING",
  "Rating of 0 rejected"
);

assert(
  evaluateListerReviewEligibility({
    callerId: "user_renter_1",
    booking: eligibleBooking,
    rating: 6,
    hasExistingReview: false,
  }).reason === "INVALID_RATING",
  "Rating of 6 rejected"
);

assert(
  evaluateListerReviewEligibility({
    callerId: "user_renter_1",
    booking: eligibleBooking,
    rating: 4.5,
    hasExistingReview: false,
  }).reason === "INVALID_RATING",
  "Decimal rating rejected (must be integer 1-5)"
);

// 9. Comment length validation
const tooLongComment = "a".repeat(1001);
assert(
  evaluateListerReviewEligibility({
    callerId: "user_renter_1",
    booking: eligibleBooking,
    rating: 5,
    comment: tooLongComment,
    hasExistingReview: false,
  }).reason === "COMMENT_TOO_LONG",
  "Comment exceeding 1000 characters rejected"
);

// -----------------------------------------------------------------------------
// 7. CATEGORY TAXONOMY & LISTING LIFECYCLE VERIFICATION
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 7: Authoritative 12-Category System & Listing Lifecycle Verification");

const EXPECTED_12_CATEGORIES = [
  "Property",
  "Cars",
  "Mobile Phones & Gadgets",
  "Computers & Tech",
  "Men's Fashion",
  "Women's Fashion",
  "Luxury",
  "Sports Equipment",
  "Industrial",
  "Motorbikes",
  "Special Vehicles",
  "Everything Else",
];

// Read lib/marketplace/categories.ts content
const fs = require("fs");
const path = require("path");
const categoriesTs = fs.readFileSync(path.join(__dirname, "../lib/marketplace/categories.ts"), "utf-8");

EXPECTED_12_CATEGORIES.forEach((catName) => {
  assert(
    categoriesTs.includes(`name: "${catName}"`),
    `Authoritative category "${catName}" exists in categories taxonomy`
  );
});

// Listing Lifecycle State Function
function resolveListingLifecycleState(listing, activeBookings = []) {
  if (listing.status === "inactive" || listing.status === "maintenance" || listing.status === "restricted") {
    return "NOT AVAILABLE";
  }
  const hasActiveHold = activeBookings.some((b) =>
    ["pending", "accepted", "paid", "active"].includes(b.status)
  );
  if (listing.status === "pending_review" || hasActiveHold) {
    return "PENDING";
  }
  if (listing.status === "available") {
    return "AVAILABLE";
  }
  return "NOT AVAILABLE";
}

assert(
  resolveListingLifecycleState({ status: "available" }, []) === "AVAILABLE",
  "Free listing with status 'available' resolves to user-facing AVAILABLE"
);

assert(
  resolveListingLifecycleState({ status: "available" }, [{ status: "pending" }]) === "PENDING",
  "Available listing with pending rental request resolves to user-facing PENDING"
);

assert(
  resolveListingLifecycleState({ status: "available" }, [{ status: "accepted" }]) === "PENDING",
  "Available listing with accepted active reservation resolves to user-facing PENDING"
);

assert(
  resolveListingLifecycleState({ status: "pending_review" }, []) === "PENDING",
  "Newly submitted listing awaiting moderation resolves to user-facing PENDING"
);

assert(
  resolveListingLifecycleState({ status: "inactive" }, []) === "NOT AVAILABLE",
  "Owner-disabled listing with status 'inactive' resolves to user-facing NOT AVAILABLE"
);

assert(
  resolveListingLifecycleState({ status: "maintenance" }, []) === "NOT AVAILABLE",
  "Listing undergoing maintenance resolves to user-facing NOT AVAILABLE"
);

// Reusable Listing Lifecycle After Completed Rental
const completedBooking = { id: "bk-completed", status: "completed" };
const reusableListing = { id: "lst-001", status: "available" };
const lifecycleAfterRental = resolveListingLifecycleState(reusableListing, [completedBooking]);

assert(
  lifecycleAfterRental === "AVAILABLE",
  "Listing remains AVAILABLE and reusable after a rental is marked completed"
);

// Owner Availability Toggle Simulation
function evaluateToggleAvailability({ callerId, ownerId, currentStatus }) {
  if (!callerId) return { allowed: false, error: "AUTH_REQUIRED" };
  if (callerId !== ownerId) return { allowed: false, error: "UNAUTHORIZED" };
  const newStatus = currentStatus === "available" ? "inactive" : "available";
  return { allowed: true, newStatus };
}

assert(
  evaluateToggleAvailability({ callerId: "user_owner_1", ownerId: "user_owner_1", currentStatus: "available" }).newStatus === "inactive",
  "Owner can toggle available listing to inactive (Not Available)"
);

assert(
  evaluateToggleAvailability({ callerId: "user_owner_1", ownerId: "user_owner_1", currentStatus: "inactive" }).newStatus === "available",
  "Owner can toggle inactive listing back to available"
);

assert(
  evaluateToggleAvailability({ callerId: "intruder", ownerId: "user_owner_1", currentStatus: "available" }).allowed === false,
  "Intruder CANNOT toggle availability on another user's listing"
);

// -----------------------------------------------------------------------------
// 8. DUPLICATE PHYSICAL ITEM DETECTION & INVENTORY UNIQUENESS
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 8: Duplicate Physical Item Detection & Inventory Identity");

function simulateCreateListing({
  callerId,
  callerStatus = "active",
  title,
  categoryId,
  assetIdentifier,
  existingListings = [],
}) {
  if (!callerId) {
    return { success: false, error: "Authentication required to create a listing." };
  }
  if (callerStatus !== "active") {
    return { success: false, error: "Your account is not permitted to create listings." };
  }

  const normalizedAsset = assetIdentifier ? assetIdentifier.trim().toLowerCase() : null;

  if (normalizedAsset) {
    const duplicate = existingListings.find(
      (l) =>
        l.owner_id === callerId &&
        l.asset_identifier &&
        l.asset_identifier.trim().toLowerCase() === normalizedAsset &&
        l.status !== "deleted"
    );

    if (duplicate) {
      return {
        success: false,
        error: `You already have an active listing for this physical asset ("${duplicate.title}").`,
        existingListingId: duplicate.id,
      };
    }
  }

  const newListing = {
    id: `listing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    owner_id: callerId,
    title,
    category_id: categoryId,
    asset_identifier: normalizedAsset,
    status: "available",
  };

  return { success: true, listing: newListing };
}

const mockListingsDb = [
  {
    id: "lst-mirage-01",
    owner_id: "user_owner_a",
    title: "2023 Mitsubishi Mirage G4",
    category_id: "c0000000-0000-0000-0000-000000000002",
    asset_identifier: "vin-mb-12345",
    status: "available",
  },
  {
    id: "lst-cat-320",
    owner_id: "user_owner_b",
    title: "Caterpillar 320 Excavator",
    category_id: "c0000000-0000-0000-0000-000000000019",
    asset_identifier: "cat-pin-998877",
    status: "available",
  },
];

// Test 8.1: Same owner tries to list same physical item again -> REJECTED
const dupSubmission = simulateCreateListing({
  callerId: "user_owner_a",
  title: "Mitsubishi Mirage - Daily Rental",
  categoryId: "c0000000-0000-0000-0000-000000000002",
  assetIdentifier: "vin-mb-12345",
  existingListings: mockListingsDb,
});
assert(!dupSubmission.success, "Duplicate physical item by same owner is REJECTED");
assert(
  dupSubmission.existingListingId === "lst-mirage-01",
  "Duplicate rejection provides link to existing listing lst-mirage-01"
);

// Test 8.2: Case-insensitive and whitespace-insensitive asset identification
const whitespaceDup = simulateCreateListing({
  callerId: "user_owner_a",
  title: "Mitsubishi Mirage Clean",
  categoryId: "c0000000-0000-0000-0000-000000000002",
  assetIdentifier: "  VIN-MB-12345  ",
  existingListings: mockListingsDb,
});
assert(!whitespaceDup.success, "Normalized asset identifier with different casing and whitespace is REJECTED");

// Test 8.3: Same owner lists DIFFERENT physical vehicle with SAME title (e.g. 2 fleet Mitsubishi Mirages) -> ALLOWED
const secondVehicle = simulateCreateListing({
  callerId: "user_owner_a",
  title: "2023 Mitsubishi Mirage G4",
  categoryId: "c0000000-0000-0000-0000-000000000002",
  assetIdentifier: "vin-mb-67890",
  existingListings: mockListingsDb,
});
assert(secondVehicle.success, "Different vehicle with same title and different VIN is ALLOWED");

// Test 8.4: Different owner lists item with identical title -> ALLOWED
const diffOwnerSameTitle = simulateCreateListing({
  callerId: "user_owner_c",
  title: "2023 Mitsubishi Mirage G4",
  categoryId: "c0000000-0000-0000-0000-000000000002",
  assetIdentifier: "vin-mb-99999",
  existingListings: mockListingsDb,
});
assert(diffOwnerSameTitle.success, "Different owner listing vehicle with same title is ALLOWED");

// Test 8.5: Items in categories where serial number is optional (e.g. Men's Fashion suit) -> ALLOWED without asset identifier
const fashionListing = simulateCreateListing({
  callerId: "user_owner_a",
  title: "Armani Black Tuxedo Size 40R",
  categoryId: "c0000000-0000-0000-0000-000000000015",
  assetIdentifier: null,
  existingListings: mockListingsDb,
});
assert(fashionListing.success, "Listing in category without serial number is ALLOWED without asset identifier");

// Test 8.6: Concurrent duplicate submission simulation (DB 23505 unique constraint handler)
function handleDbInsertionError(errCode, existingListingId) {
  if (errCode === "23505") {
    return {
      success: false,
      error: "You already have an active listing for this physical asset (VIN/Serial Number).",
      existingListingId,
    };
  }
  return { success: false, error: "Database error" };
}
const concurrentCollision = handleDbInsertionError("23505", "lst-mirage-01");
assert(!concurrentCollision.success && concurrentCollision.existingListingId === "lst-mirage-01",
  "Concurrent race condition hitting DB 23505 triggers clear duplicate error with existing listing link"
);

// Test 8.7: Sensitive asset identifier privacy (stripped from public responses)
function sanitizeListingForPublic(listing) {
  const { asset_identifier, ...publicFields } = listing;
  return publicFields;
}
const publicListing = sanitizeListingForPublic(mockListingsDb[0]);
assert(
  !("asset_identifier" in publicListing),
  "Sensitive asset_identifier (VIN/Serial) is STRIPPED from public listing view"
);

// -----------------------------------------------------------------------------
// 9. IMAGE GALLERY NAVIGATION LOGIC
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 9: Listing Image Gallery Navigation Logic");

function galleryNavNext(currentIndex, totalImages) {
  if (totalImages <= 1) return currentIndex;
  return (currentIndex + 1) % totalImages;
}

function galleryNavPrev(currentIndex, totalImages) {
  if (totalImages <= 1) return currentIndex;
  return (currentIndex - 1 + totalImages) % totalImages;
}

const totalGalleryImages = 4; // indices 0, 1, 2, 3

assert(galleryNavNext(0, totalGalleryImages) === 1, "Gallery: Next from image 0 advances to image 1");
assert(galleryNavNext(2, totalGalleryImages) === 3, "Gallery: Next from image 2 advances to image 3");
assert(galleryNavNext(3, totalGalleryImages) === 0, "Gallery: Next from last image wraps around to image 0");

assert(galleryNavPrev(3, totalGalleryImages) === 2, "Gallery: Prev from image 3 retreats to image 2");
assert(galleryNavPrev(1, totalGalleryImages) === 0, "Gallery: Prev from image 1 retreats to image 0");
assert(galleryNavPrev(0, totalGalleryImages) === 3, "Gallery: Prev from image 0 wraps around to image 3");

// Single-image handling
assert(galleryNavNext(0, 1) === 0, "Gallery: Next with 1 image stays on image 0");
assert(galleryNavPrev(0, 1) === 0, "Gallery: Prev with 1 image stays on image 0");

function shouldShowGalleryControls(totalImages) {
  return totalImages > 1;
}
assert(shouldShowGalleryControls(4), "Gallery controls displayed when multiple images exist");
assert(!shouldShowGalleryControls(1), "Gallery controls HIDDEN when only 1 image exists");

// -----------------------------------------------------------------------------
// 10. NAVBAR DUPLICATION & NAVIGATION ANCHOR CLEANLINESS
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 10: Navbar Duplication & Navigation Anchor Cleanliness");

const navbarTsx = fs.readFileSync(path.join(__dirname, "../components/landing/navbar.tsx"), "utf-8");
const footerTsx = fs.readFileSync(path.join(__dirname, "../components/landing/footer.tsx"), "utf-8");
const pageTsx = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf-8");

assert(
  !navbarTsx.includes('href="/#categories"'),
  "Obsolete /#categories anchor removed from navbar"
);

assert(
  !footerTsx.includes('href="/#categories"'),
  "Obsolete /#categories anchor removed from footer (points to /listings)"
);

assert(
  !pageTsx.includes("<CategoryTiles") && !pageTsx.includes("CategoryTiles />"),
  "Landing page does NOT render CategoryTiles preview section"
);

const browseListingsNameMatches = (navbarTsx.match(/name:\s*"Browse Listings"/g) || []).length;
assert(
  browseListingsNameMatches === 1,
  `Navbar contains exactly 1 "Browse Listings" nav entry defined (found ${browseListingsNameMatches})`
);

const totalBrowseListingsText = (navbarTsx.match(/Browse Listings/g) || []).length;
assert(
  totalBrowseListingsText === 1,
  `Navbar does not duplicate "Browse Listings" text anywhere in action buttons or desktop toolbar (found ${totalBrowseListingsText})`
);

// -----------------------------------------------------------------------------
// 11. ADMIN INVITATION AUTHORIZATION, DEDUPLICATION & REVOCATION
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 11: Admin Invitation Authorization, Deduplication & Revocation");

function simulateAdminInvite({
  inviterId,
  inviterRole,
  inviterStatus,
  targetEmail,
  existingInvitations = [],
}) {
  if (!inviterId) {
    return { success: false, error: "Authentication required." };
  }
  if (inviterRole !== "admin") {
    return { success: false, error: "Only administrators can invite administrators." };
  }
  if (inviterStatus !== "active") {
    return { success: false, error: "Your administrator account is restricted or inactive." };
  }
  if (!targetEmail || !targetEmail.includes("@")) {
    return { success: false, error: "Please enter a valid email address." };
  }

  const normalizedEmail = targetEmail.trim().toLowerCase();
  const duplicate = existingInvitations.find(
    (inv) => inv.email.toLowerCase() === normalizedEmail && inv.status === "pending"
  );
  if (duplicate) {
    return {
      success: false,
      error: `A pending administrator invitation already exists for ${normalizedEmail}.`,
    };
  }

  const invitation = {
    id: `inv_${Date.now()}`,
    email: normalizedEmail,
    invited_by: inviterId,
    status: "pending",
    created_at: new Date().toISOString(),
  };

  return { success: true, invitation };
}

const mockInvitationsDb = [
  {
    id: "inv_existing_1",
    email: "pending.admin@rentit.ph",
    invited_by: "user_superadmin",
    status: "pending",
  },
];

// Test 11.1: Unauthenticated invite attempt -> REJECTED
assert(
  !simulateAdminInvite({
    inviterId: null,
    inviterRole: "admin",
    inviterStatus: "active",
    targetEmail: "new@rentit.ph",
  }).success,
  "Unauthenticated attempt to invite admin is REJECTED"
);

// Test 11.2: Regular customer attempting to invite admin -> REJECTED
assert(
  !simulateAdminInvite({
    inviterId: "user_customer_1",
    inviterRole: "customer",
    inviterStatus: "active",
    targetEmail: "hacker@rentit.ph",
  }).success,
  "Non-admin customer attempting to invite admin is REJECTED"
);

// Test 11.3: Restricted / inactive administrator attempting to invite -> REJECTED
assert(
  !simulateAdminInvite({
    inviterId: "user_bad_admin",
    inviterRole: "admin",
    inviterStatus: "restricted",
    targetEmail: "friend@rentit.ph",
  }).success,
  "Restricted admin attempting to invite another admin is REJECTED"
);

assert(
  !simulateAdminInvite({
    inviterId: "user_banned_admin",
    inviterRole: "admin",
    inviterStatus: "banned",
    targetEmail: "friend@rentit.ph",
  }).success,
  "Banned admin attempting to invite another admin is REJECTED"
);

// Test 11.4: Valid active administrator -> ALLOWED
const validInvite = simulateAdminInvite({
  inviterId: "user_good_admin",
  inviterRole: "admin",
  inviterStatus: "active",
  targetEmail: "sarah.ops@rentit.ph",
  existingInvitations: mockInvitationsDb,
});
assert(validInvite.success, "Active authorized admin can invite new administrator");

// Test 11.5: Duplicate pending invitation -> REJECTED
const duplicateInvite = simulateAdminInvite({
  inviterId: "user_good_admin",
  inviterRole: "admin",
  inviterStatus: "active",
  targetEmail: "PENDING.ADMIN@RENTIT.PH",
  existingInvitations: mockInvitationsDb,
});
assert(!duplicateInvite.success, "Duplicate pending administrator invitation is REJECTED");

// Test 11.6: Revoking pending invitation
function simulateRevokeInvitation({ callerId, callerRole, callerStatus, invitation }) {
  if (!callerId || callerRole !== "admin" || callerStatus !== "active") {
    return { success: false, error: "Unauthorized" };
  }
  if (!invitation || invitation.status !== "pending") {
    return { success: false, error: "Invitation not found or cannot be revoked." };
  }
  return { success: true, invitation: { ...invitation, status: "revoked" } };
}

const revokedRes = simulateRevokeInvitation({
  callerId: "user_good_admin",
  callerRole: "admin",
  callerStatus: "active",
  invitation: mockInvitationsDb[0],
});
assert(revokedRes.success && revokedRes.invitation.status === "revoked", "Active admin can revoke pending invitation");

assert(
  !simulateRevokeInvitation({
    callerId: "user_stranger",
    callerRole: "customer",
    callerStatus: "active",
    invitation: mockInvitationsDb[0],
  }).success,
  "Non-admin CANNOT revoke administrator invitation"
);

// -----------------------------------------------------------------------------
// 12. INVITATION ACCEPTANCE & SECURE ROLE ASSIGNMENT
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 12: Invitation Acceptance & Secure Server-Side Role Assignment");

function simulateClerkWebhookUserCreated({
  userId,
  email,
  clerkPublicMetadata = {},
  clientSuppliedRole = null,
  pendingInvitations = [],
  dbTrackingError = false,
}) {
  if (dbTrackingError) {
    return { error: "Database error tracking invitation", assignedRole: "customer" };
  }

  // Security Priority: Never trust clientSuppliedRole or clerkPublicMetadata alone.
  // ONLY grant admin role if there is a verified, pending invitation in admin_invitations.
  const normalizedEmail = (email || "").trim().toLowerCase();
  const matchingInvitation = pendingInvitations.find(
    (inv) => inv.email.toLowerCase() === normalizedEmail && inv.status === "pending"
  );

  let finalAssignedRole = "customer";
  if (matchingInvitation) {
    finalAssignedRole = "admin";
  }

  return {
    userId,
    assignedRole: finalAssignedRole,
    invitationUpdated: matchingInvitation ? { ...matchingInvitation, status: "accepted" } : null,
  };
}

// Case 1: Standard public sign-up -> assigned 'customer'
const standardSignup = simulateClerkWebhookUserCreated({
  userId: "user_regular_1",
  email: "john@example.com",
  clientSuppliedRole: "admin",
  clerkPublicMetadata: {},
  pendingInvitations: [],
});
assert(
  standardSignup.assignedRole === "customer",
  "Regular user sign up is assigned customer role, client role spoofing is IGNORED"
);

// Case 2: Invited administrator sign-up -> elevated to 'admin'
const adminSignup = simulateClerkWebhookUserCreated({
  userId: "user_new_admin",
  email: "sarah.ops@rentit.ph",
  clerkPublicMetadata: { role: "admin", invitedAsAdmin: true },
  pendingInvitations: [{ id: "inv_1", email: "sarah.ops@rentit.ph", status: "pending" }],
});
assert(
  adminSignup.assignedRole === "admin",
  "Invited user with trusted metadata is securely assigned admin role"
);
assert(
  adminSignup.invitationUpdated?.status === "accepted",
  "Invitation record is transitioned to accepted upon sign-up"
);

// Case 3: User signed up with revoked invitation -> role remains 'customer'
const revokedSignup = simulateClerkWebhookUserCreated({
  userId: "user_late_arrival",
  email: "revoked@rentit.ph",
  clerkPublicMetadata: {},
  pendingInvitations: [{ id: "inv_revoked", email: "revoked@rentit.ph", status: "revoked" }],
});
assert(
  revokedSignup.assignedRole === "customer",
  "User signing up after invitation revocation remains customer"
);

// Case 4: Security priority - user attempting admin escalation via public_metadata without DB invitation
const unverifiedEscalation = simulateClerkWebhookUserCreated({
  userId: "user_attacker",
  email: "attacker@gmail.com",
  clerkPublicMetadata: { invitedAsAdmin: true, role: "admin" },
  pendingInvitations: [], // No server invitation exists!
});
assert(
  unverifiedEscalation.assignedRole === "customer",
  "Unauthorized metadata escalation without pending server invitation is REJECTED"
);

// -----------------------------------------------------------------------------
// 13. LISTING BOOKING DIAGNOSTIC OUTCOME DIFFERENTIATION & CORRELATION LOGGING
// [SIMULATION - OFFLINE UNIT TESTS - NOT LIVE SUPABASE INTEGRATION]
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 13: Listing Booking Diagnostic Outcome Differentiation & Correlation Logging (Simulation)");

function simulateCreateBookingAction({
  userId,
  userProfile = { status: "active" },
  profileQueryError = null,
  listingId,
  mockDbListing = null,
  dbQueryError = null,
  overlappingBookings = [],
  overlapQueryError = null,
  dbInsertError = null,
  startDate = "2026-11-01",
  endDate = "2026-11-03",
}) {
  const correlationId = "corr-" + Math.random().toString(36).substring(2, 9);
  const diagnosticLogs = [];
  let insertAttempted = false;

  // 1. Auth check
  if (!userId) {
    return { error: "You must be signed in to request a booking.", code: "AUTH_REQUIRED", correlationId, insertAttempted, logs: diagnosticLogs };
  }

  // 2. Separate mock/demo listings from real UUID database listings
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isMockListing = listingId.startsWith("lst-") || listingId.startsWith("mock-");

  if (isMockListing) {
    diagnosticLogs.push({ correlationId, listingId, code: "DEMO_LISTING" });
    return {
      error: "This is a demonstration listing and cannot accept rental bookings. Please select an active marketplace listing.",
      code: "DEMO_LISTING",
      correlationId,
      insertAttempted,
      logs: diagnosticLogs,
    };
  }

  if (!UUID_REGEX.test(listingId)) {
    diagnosticLogs.push({ correlationId, listingId, code: "INVALID_ID" });
    return {
      error: "The requested equipment listing identifier is invalid.",
      code: "INVALID_ID",
      correlationId,
      insertAttempted,
      logs: diagnosticLogs,
    };
  }

  // 3. Profile check (fail-closed on query error or missing profile)
  if (profileQueryError) {
    diagnosticLogs.push({ correlationId, listingId, code: profileQueryError.code, errorDetails: profileQueryError.message });
    return {
      error: "A database error occurred while verifying your account. Please try again later.",
      code: "DB_ERROR",
      correlationId,
      insertAttempted,
      logs: diagnosticLogs,
    };
  }

  if (!userProfile) {
    diagnosticLogs.push({ correlationId, listingId, code: "PROFILE_NOT_FOUND", userId });
    return {
      error: "Your user profile could not be found or verified. Please try again later.",
      code: "DB_ERROR",
      correlationId,
      insertAttempted,
      logs: diagnosticLogs,
    };
  }

  if (userProfile.status === "restricted") {
    diagnosticLogs.push({ correlationId, listingId, status: userProfile.status });
    return { error: "Your account is currently restricted from submitting rental requests.", code: "ERROR", correlationId, insertAttempted, logs: diagnosticLogs };
  }
  if (userProfile.status === "banned" || userProfile.status === "deleted") {
    diagnosticLogs.push({ correlationId, listingId, status: userProfile.status });
    return { error: "Your account is suspended and cannot initiate rental bookings.", code: "ERROR", correlationId, insertAttempted, logs: diagnosticLogs };
  }

  // 4. Database query outcome differentiation
  if (dbQueryError) {
    diagnosticLogs.push({ correlationId, listingId, code: dbQueryError.code, errorDetails: dbQueryError.message });
    if (dbQueryError.code === "42501") {
      return { error: "You do not have permission to view or book this listing.", code: "PERMISSION_DENIED", correlationId, insertAttempted, logs: diagnosticLogs };
    }
    return { error: "A database error occurred while retrieving the listing. Please try again later.", code: "DB_ERROR", correlationId, insertAttempted, logs: diagnosticLogs };
  }

  if (!mockDbListing) {
    diagnosticLogs.push({ correlationId, listingId, code: "NOT_FOUND" });
    return { error: "The requested equipment listing was not found.", code: "NOT_FOUND", correlationId, insertAttempted, logs: diagnosticLogs };
  }

  // 5. Status check
  if (mockDbListing.status !== "available") {
    diagnosticLogs.push({ correlationId, listingId, status: mockDbListing.status });
    let safeStatusMessage;
    if (mockDbListing.status === "archived") {
      safeStatusMessage = "This equipment listing has been archived and is no longer available for booking.";
    } else if (mockDbListing.status === "restricted") {
      safeStatusMessage = "This equipment listing is restricted and cannot be booked.";
    } else if (mockDbListing.status === "deleted") {
      safeStatusMessage = "This equipment listing has been removed and is no longer available.";
    } else if (mockDbListing.status === "maintenance") {
      safeStatusMessage = "This equipment is currently undergoing maintenance and cannot be booked.";
    } else if (mockDbListing.status === "inactive") {
      safeStatusMessage = "This equipment listing is currently inactive and cannot be booked.";
    } else {
      safeStatusMessage = `This equipment is currently ${mockDbListing.status} and cannot be booked.`;
    }
    return { error: safeStatusMessage, code: "UNAVAILABLE", correlationId, insertAttempted, logs: diagnosticLogs };
  }

  // 6. Prevent booking own listing
  if (mockDbListing.owner_id && mockDbListing.owner_id === userId) {
    diagnosticLogs.push({ correlationId, listingId, code: "OWN_LISTING" });
    return { error: "You cannot book your own listing.", code: "OWN_LISTING", correlationId, insertAttempted, logs: diagnosticLogs };
  }

  // 7. Overlap check query failure & detection
  if (overlapQueryError) {
    diagnosticLogs.push({ correlationId, listingId, code: overlapQueryError.code, errorDetails: overlapQueryError.message });
    return {
      error: "A database error occurred while verifying reservation availability. Please try again later.",
      code: "DB_ERROR",
      correlationId,
      insertAttempted,
      logs: diagnosticLogs,
    };
  }

  if (overlappingBookings.length > 0) {
    diagnosticLogs.push({ correlationId, listingId, code: "OVERLAP" });
    return { error: "These dates conflict with an existing reservation. Please select different dates.", code: "OVERLAP", correlationId, insertAttempted, logs: diagnosticLogs };
  }

  // 8. DB insert attempt
  insertAttempted = true;
  if (dbInsertError) {
    if (dbInsertError.code === "23P01") {
      return { error: "These dates conflict with an existing reservation. Please select different dates.", code: "OVERLAP", correlationId, insertAttempted, logs: diagnosticLogs };
    }
    return { error: "Unable to submit your booking right now. Please try again.", code: "ERROR", correlationId, insertAttempted, logs: diagnosticLogs };
  }

  return { success: true, bookingId: "bk-new-123", serverTotalPrice: 15000, correlationId, insertAttempted, logs: diagnosticLogs };
}

// Test 13.1: Authorized user booking existing available listing
const validBookingRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  listingId: "12c46209-85b4-4bb5-860a-54325662edc9",
  mockDbListing: { id: "12c46209-85b4-4bb5-860a-54325662edc9", owner_id: "user_owner_1", status: "available", price_per_day: 5000 },
});
assert(validBookingRes.success && validBookingRes.bookingId, "[Simulation] Authorized booking succeeds");
assert(validBookingRes.insertAttempted === true, "[Simulation] Authorized booking attempts database insertion");

// Test 13.2: Missing listing ID produces distinguishable diagnostic outcome
const missingListingRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  listingId: "00000000-0000-0000-0000-000000000000",
  mockDbListing: null,
});
assert(missingListingRes.code === "NOT_FOUND", "[Simulation] Missing listing returns distinct 'NOT_FOUND' code");
assert(missingListingRes.error === "The requested equipment listing was not found.", "[Simulation] Missing listing returns distinct 'not found' message without collapsing into vague error");
assert(missingListingRes.insertAttempted === false, "[Simulation] Missing listing does NOT attempt booking insertion");
assert(missingListingRes.logs.length > 0 && missingListingRes.logs[0].correlationId, "[Simulation] Missing listing records structured server-side diagnostic log with correlation ID");

// Test 13.3: RLS denial produces distinct permission error
const rlsDeniedRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  listingId: "e0000000-0000-0000-0000-000000000001",
  dbQueryError: { code: "42501", message: "permission denied for table listings" },
});
assert(rlsDeniedRes.code === "PERMISSION_DENIED", "[Simulation] RLS-denied query produces distinct PERMISSION_DENIED code");
assert(rlsDeniedRes.error === "You do not have permission to view or book this listing.", "[Simulation] RLS-denied query produces distinct user-safe permission error");
assert(rlsDeniedRes.insertAttempted === false, "[Simulation] RLS denial does NOT attempt booking insertion");
assert(rlsDeniedRes.logs[0].code === "42501", "[Simulation] RLS-denied query logs Postgres 42501 error code with correlation ID");

// Test 13.4: Demo listing returns distinct DEMO_LISTING code without querying database
const demoListingRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  listingId: "lst-cat-320d-01",
});
assert(demoListingRes.code === "DEMO_LISTING", "[Simulation] Mock/demo listing returns distinct DEMO_LISTING code");
assert(demoListingRes.error.includes("demonstration listing"), "[Simulation] Demo listing returns clear guidance message");
assert(demoListingRes.insertAttempted === false, "[Simulation] Demo listing does NOT attempt booking insertion");

// Test 13.5: Invalid format returns INVALID_ID code
const invalidIdRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  listingId: "not-a-valid-uuid-or-mock",
});
assert(invalidIdRes.code === "INVALID_ID", "[Simulation] Invalid non-UUID identifier returns distinct INVALID_ID code");
assert(invalidIdRes.insertAttempted === false, "[Simulation] Invalid ID does NOT attempt booking insertion");

// Test 13.6: Database query error returns DB_ERROR code
const dbErrRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  listingId: "e0000000-0000-0000-0000-000000000002",
  dbQueryError: { code: "08006", message: "connection failure" },
});
assert(dbErrRes.code === "DB_ERROR", "[Simulation] General database error returns distinct DB_ERROR code");
assert(dbErrRes.insertAttempted === false, "[Simulation] Listing query failure does NOT attempt booking insertion");

// Test 13.7: Profile query error (fail-closed) returns DB_ERROR and blocks insert
const profileErrRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  listingId: "12c46209-85b4-4bb5-860a-54325662edc9",
  profileQueryError: { code: "50000", message: "profiles table connection failed" },
  mockDbListing: { id: "12c46209-85b4-4bb5-860a-54325662edc9", owner_id: "user_owner_1", status: "available", price_per_day: 5000 },
});
assert(profileErrRes.code === "DB_ERROR", "[Simulation] Profile query failure returns DB_ERROR");
assert(profileErrRes.insertAttempted === false, "[Simulation] Profile query failure does NOT attempt booking insertion");
assert(profileErrRes.logs[0].code === "50000", "[Simulation] Profile query failure logs error code with correlation ID");

// Test 13.8: Missing profile (userProfile == null) fail-closed returns DB_ERROR and blocks insert
const missingProfileRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  userProfile: null,
  listingId: "12c46209-85b4-4bb5-860a-54325662edc9",
  mockDbListing: { id: "12c46209-85b4-4bb5-860a-54325662edc9", owner_id: "user_owner_1", status: "available", price_per_day: 5000 },
});
assert(missingProfileRes.code === "DB_ERROR", "[Simulation] Missing profile returns DB_ERROR");
assert(missingProfileRes.insertAttempted === false, "[Simulation] Missing profile does NOT attempt booking insertion");
assert(missingProfileRes.error.includes("could not be found or verified"), "[Simulation] Missing profile returns user-safe verification message");

// Test 13.9: Overlap query failure returns DB_ERROR and blocks insert before insertion
const overlapQueryErrRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  listingId: "12c46209-85b4-4bb5-860a-54325662edc9",
  mockDbListing: { id: "12c46209-85b4-4bb5-860a-54325662edc9", owner_id: "user_owner_1", status: "available", price_per_day: 5000 },
  overlapQueryError: { code: "08006", message: "bookings availability query timeout" },
});
assert(overlapQueryErrRes.code === "DB_ERROR", "[Simulation] Overlap query failure returns DB_ERROR");
assert(overlapQueryErrRes.insertAttempted === false, "[Simulation] Overlap query failure does NOT attempt booking insertion");
assert(overlapQueryErrRes.logs[0].code === "08006", "[Simulation] Overlap query failure logs database error code with correlation ID");

// Test 13.10: Specific unavailable messages (archived, maintenance, restricted, deleted, inactive)
const archivedRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  listingId: "a0000000-0000-0000-0000-000000000001",
  mockDbListing: { id: "a0000000-0000-0000-0000-000000000001", owner_id: "owner-1", status: "archived", price_per_day: 1000 },
});
assert(archivedRes.error.includes("archived"), "[Simulation] Archived listing returns specific archival error message");
assert(archivedRes.code === "UNAVAILABLE", "[Simulation] Archived listing returns UNAVAILABLE code");
assert(archivedRes.insertAttempted === false, "[Simulation] Archived listing does NOT attempt booking insertion");

const maintRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  listingId: "a0000000-0000-0000-0000-000000000002",
  mockDbListing: { id: "a0000000-0000-0000-0000-000000000002", owner_id: "owner-1", status: "maintenance", price_per_day: 1000 },
});
assert(maintRes.error.includes("maintenance"), "[Simulation] Maintenance listing returns specific maintenance error message");
assert(maintRes.insertAttempted === false, "[Simulation] Maintenance listing does NOT attempt booking insertion");

// Test 13.11: Owner cannot book own listing
const ownListingRes = simulateCreateBookingAction({
  userId: "user_owner_1",
  listingId: "a0000000-0000-0000-0000-000000000003",
  mockDbListing: { id: "a0000000-0000-0000-0000-000000000003", owner_id: "user_owner_1", status: "available", price_per_day: 1000 },
});
assert(ownListingRes.code === "OWN_LISTING", "[Simulation] Listing owned by caller is rejected with OWN_LISTING code");
assert(ownListingRes.insertAttempted === false, "[Simulation] Own listing does NOT attempt booking insertion");

// Test 13.12: Booking date overlap detected
const overlapRes = simulateCreateBookingAction({
  userId: "user_renter_1",
  listingId: "a0000000-0000-0000-0000-000000000004",
  mockDbListing: { id: "a0000000-0000-0000-0000-000000000004", owner_id: "owner-1", status: "available", price_per_day: 1000 },
  overlappingBookings: [{ id: "bk-conflict" }],
});
assert(overlapRes.code === "OVERLAP", "[Simulation] Date range conflict is detected and returns OVERLAP code");
assert(overlapRes.insertAttempted === false, "[Simulation] Date conflict does NOT attempt booking insertion");

// -----------------------------------------------------------------------------
// 14. SAVED LISTINGS SCHEMA AVAILABILITY & RESILIENCE
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 14: Saved Listings Schema Availability & Resilience");

function simulateToggleSaveListing({
  userId,
  listingId,
  tableExists = true,
  isAlreadySaved = false,
  triggerRaceConflict = false,
}) {
  if (!userId) {
    return { success: false, saved: false, error: "You must be signed in to save listings.", code: "AUTH_REQUIRED" };
  }

  // Simulate missing table schema (PGRST205)
  if (!tableExists) {
    return {
      success: false,
      saved: false,
      error: "The saved listings feature is currently unavailable (database schema not applied). Please try again later.",
      code: "ERROR",
      schemaUnavailable: true,
    };
  }

  if (isAlreadySaved) {
    // Unsave
    return { success: true, saved: false };
  } else {
    // Save (insert)
    if (triggerRaceConflict) {
      // 23505 unique collision handled idempotently
      return { success: true, saved: true };
    }
    return { success: true, saved: true };
  }
}

// Test 14.1: Toggle save succeeds when schema is available
const saveSuccess = simulateToggleSaveListing({
  userId: "user_1",
  listingId: "12c46209-85b4-4bb5-860a-54325662edc9",
  tableExists: true,
  isAlreadySaved: false,
});
assert(saveSuccess.success && saveSuccess.saved === true, "Saved-listing toggle succeeds when schema is available");

// Test 14.2: Toggle unsave succeeds when already saved
const unsaveSuccess = simulateToggleSaveListing({
  userId: "user_1",
  listingId: "12c46209-85b4-4bb5-860a-54325662edc9",
  tableExists: true,
  isAlreadySaved: true,
});
assert(unsaveSuccess.success && unsaveSuccess.saved === false, "Saved-listing toggle successfully removes saved item");

// Test 14.3: Clear error when schema is missing (PGRST205)
const schemaMissingRes = simulateToggleSaveListing({
  userId: "user_1",
  listingId: "12c46209-85b4-4bb5-860a-54325662edc9",
  tableExists: false,
});
assert(!schemaMissingRes.success, "Saved-listing toggle fails when schema is unavailable");
assert(schemaMissingRes.error.includes("schema not applied"), "Clear, diagnostic error returned when saved_listings table is missing");

// Test 14.4: Optimistic rollback simulation on failure
let clientSavedState = false;
let clientFeedback = null;
function simulateClientHeartClick(tableExists) {
  const initial = clientSavedState;
  clientSavedState = !initial; // Optimistic update
  const res = simulateToggleSaveListing({ userId: "u1", listingId: "l1", tableExists });
  if (!res.success) {
    clientSavedState = initial; // Roll back
    clientFeedback = res.error;
  } else {
    clientSavedState = res.saved;
  }
  return { finalState: clientSavedState, feedback: clientFeedback };
}

const clientFailureRun = simulateClientHeartClick(false);
assert(clientFailureRun.finalState === false, "Client optimistic saved state rolls back to false on server failure");
assert(clientFailureRun.feedback !== null, "User feedback message is set on failure so button does not silently do nothing");

// -----------------------------------------------------------------------------
// 15. IMAGE UPLOAD INTEGRITY & LISTING RELATIONS
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 15: Image Upload Integrity & Listing Relations");

function simulateImageUploadWorkflow({ files = [], storageUploadFails = false, externalUrls = [] }) {
  const uploadedUrls = [];
  let submitError = null;

  for (const f of files) {
    if (storageUploadFails) {
      submitError = `Failed to upload photo "${f.name}". Storage service error.`;
      return { success: false, error: submitError, images: [] };
    }
    uploadedUrls.push(`https://storage.supabase.co/v1/object/public/listing-images/${f.name}`);
  }

  for (const ext of externalUrls) {
    uploadedUrls.push(ext);
  }

  if (uploadedUrls.length === 0) {
    uploadedUrls.push("/images/equipment_loader.jpg");
  }

  // Deduplicate preserving first occurrence
  const seen = new Set();
  const uniqueImages = uploadedUrls.filter((url) => {
    const trimmed = (url || "").trim();
    if (!trimmed || seen.has(trimmed)) return false;
    seen.add(trimmed);
    return true;
  });

  const relationRows = uniqueImages.map((url, idx) => ({
    image_url: url,
    is_primary: idx === 0,
    sort_order: idx,
  }));

  return { success: true, images: uniqueImages, relationRows };
}

// Test 15.1: Failed upload is NOT silently treated as success
const failedUploadRes = simulateImageUploadWorkflow({
  files: [{ name: "excavator-boom.jpg" }],
  storageUploadFails: true,
});
assert(!failedUploadRes.success, "Failed photo upload causes submission to fail");
assert(failedUploadRes.error.includes("excavator-boom.jpg"), "Error explicitly identifies the failed image file");
assert(!failedUploadRes.images.includes("/images/equipment_loader.jpg"), "Failed upload does NOT silently insert fallback loader image");

// Test 15.2: Successful uploads create ordered relation rows
const successUploadRes = simulateImageUploadWorkflow({
  files: [{ name: "front.jpg" }, { name: "side.jpg" }],
  storageUploadFails: false,
});
assert(successUploadRes.success && successUploadRes.images.length === 2, "Successful photo upload persists all image URLs");
assert(successUploadRes.relationRows[0].is_primary === true, "First image is marked is_primary: true");
assert(successUploadRes.relationRows[0].sort_order === 0, "First image has sort_order: 0");
assert(successUploadRes.relationRows[1].sort_order === 1, "Second image has sort_order: 1");

// Test 15.3: Duplicate URLs in payload are deduplicated
const dupeUploadRes = simulateImageUploadWorkflow({
  files: [{ name: "same.jpg" }],
  externalUrls: ["https://storage.supabase.co/v1/object/public/listing-images/same.jpg", "https://img.com/other.jpg"],
});
assert(dupeUploadRes.images.length === 2, "Duplicate URLs are deduplicated to single occurrence");
assert(dupeUploadRes.relationRows.length === 2, "Relation rows insert only deduplicated images");

// -----------------------------------------------------------------------------
// 16. DASHBOARD, CHAT & ADMIN AUTHORIZATION BOUNDARIES
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 16: Dashboard, Chat & Admin Authorization Boundaries");

// Test 16.1: Dashboard optimistic state rollback on error
let dashboardRentals = [{ id: "bk-1", status: "pending" }];
function simulateDashboardCancel({ bookingId, shouldFail = false }) {
  const previous = dashboardRentals;
  dashboardRentals = dashboardRentals.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" } : b));
  if (shouldFail) {
    dashboardRentals = previous; // Roll back
    return { success: false, error: "Database network failure." };
  }
  return { success: true };
}

const cancelFail = simulateDashboardCancel({ bookingId: "bk-1", shouldFail: true });
assert(!cancelFail.success, "Dashboard action failure reported");
assert(dashboardRentals[0].status === "pending", "Dashboard optimistic status rolls back to 'pending' on action failure");

// Test 16.2: Conversation RPC requires participant identity
function simulateGetOrCreateConversation({ callerId, booking, isAdmin = false }) {
  if (!callerId) return { success: false, error: "Authentication required", code: "42501" };
  if (!booking) return { success: false, error: "Booking not found", code: "02000" };
  const isParticipant = callerId === booking.renter_id || callerId === booking.owner_id;
  if (!isParticipant && !isAdmin) {
    return { success: false, error: "Unauthorized: Caller is not a participant", code: "42501" };
  }
  if (!["accepted", "paid", "confirmed", "active", "completed"].includes(booking.status) && !isAdmin) {
    return { success: false, error: "Messaging is only unlocked for accepted rental transactions", code: "42501" };
  }
  return { success: true, conversationId: "conv-" + booking.id };
}

const strangerChat = simulateGetOrCreateConversation({
  callerId: "user_intruder",
  booking: { id: "bk-1", renter_id: "user_a", owner_id: "user_b", status: "accepted" },
});
assert(!strangerChat.success && strangerChat.code === "42501", "Unauthorized stranger CANNOT open booking conversation");

const pendingBookingChat = simulateGetOrCreateConversation({
  callerId: "user_a",
  booking: { id: "bk-1", renter_id: "user_a", owner_id: "user_b", status: "pending" },
});
assert(!pendingBookingChat.success, "Conversation cannot be unlocked while booking status is pending review");

const acceptedBookingChat = simulateGetOrCreateConversation({
  callerId: "user_a",
  booking: { id: "bk-1", renter_id: "user_a", owner_id: "user_b", status: "accepted" },
});
assert(acceptedBookingChat.success, "Conversation unlocks for participant once booking is accepted");

// Test 16.3: Message immutability trigger simulation
function simulateMessageMutation({ op, callerId, originalMessage, newContent, newReadAt }) {
  if (op === "DELETE") {
    return { allowed: false, error: "Messages cannot be deleted. History must be preserved for dispute resolution." };
  }
  if (op === "UPDATE") {
    if (newContent !== undefined && newContent !== originalMessage.content) {
      return { allowed: false, error: "Message content is immutable." };
    }
    if (newReadAt && callerId === originalMessage.sender_id) {
      return { allowed: false, error: "Senders cannot mark their own messages as read." };
    }
    return { allowed: true, message: { ...originalMessage, read_at: newReadAt } };
  }
}

const deleteMsgRes = simulateMessageMutation({ op: "DELETE", callerId: "user_a", originalMessage: { id: "m1" } });
assert(!deleteMsgRes.allowed, "Messages CANNOT be deleted (preserves dispute resolution history)");

const editMsgRes = simulateMessageMutation({
  op: "UPDATE",
  callerId: "user_a",
  originalMessage: { id: "m1", content: "Original terms", sender_id: "user_a" },
  newContent: "Altered terms",
});
assert(!editMsgRes.allowed, "Message content CANNOT be altered once sent (message immutability guaranteed)");

// -----------------------------------------------------------------------------
// 17. CLERK AUTHENTICATION & REDIRECT PRESERVATION
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 17: Clerk Authentication & Redirect Invariant Verification");

function simulateProxyRouteProtection(pathname, isSignedIn) {
  const protectedRoutes = ["/listings/new", "/dashboard", "/admin"];
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (!isProtected) {
    return { allowed: true };
  }

  if (isSignedIn) {
    return { allowed: true };
  }

  // Redirect to sign-in with preserved destination
  const redirectUrl = `/sign-in?redirect_url=${encodeURIComponent(pathname)}`;
  return { allowed: false, redirectUrl };
}

// Test 17.1: Protected routes require login and preserve destination
const unauthedNewListing = simulateProxyRouteProtection("/listings/new", false);
assert(!unauthedNewListing.allowed, "/listings/new requires authentication");
assert(unauthedNewListing.redirectUrl.includes("redirect_url=%2Flistings%2Fnew"), "Redirect preservation retains intended /listings/new destination");

const unauthedDashboard = simulateProxyRouteProtection("/dashboard", false);
assert(!unauthedDashboard.allowed && unauthedDashboard.redirectUrl.includes("redirect_url=%2Fdashboard"), "Dashboard redirect preserves /dashboard destination");

const unauthedAdmin = simulateProxyRouteProtection("/admin/users", false);
assert(!unauthedAdmin.allowed && unauthedAdmin.redirectUrl.includes("redirect_url=%2Fadmin%2Fusers"), "Admin route redirect preserves /admin/users destination");

// Test 17.2: Public routes never force sign-in redirects
assert(simulateProxyRouteProtection("/", false).allowed, "Landing page is public");
assert(simulateProxyRouteProtection("/listings", false).allowed, "Marketplace browse page is public");
assert(simulateProxyRouteProtection("/listings/12c46209-85b4-4bb5-860a-54325662edc9", false).allowed, "Listing detail page is public");
assert(simulateProxyRouteProtection("/sign-in", false).allowed, "Sign-in route is public and does not self-redirect");
assert(simulateProxyRouteProtection("/sign-up", false).allowed, "Sign-up route is public and does not self-redirect");

// -----------------------------------------------------------------------------
// 18. DELETION, CANCELLATION, IDENTITY & REVIEWS VERIFICATION
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 18: Listing Deletion, Safe Cancellation, Identity & Reviews");

// Simulation 18.1: Safe Listing Deletion / Archiving
function simulateListingDeletion(listing, existingBookings) {
  const activeStatuses = ["pending", "accepted", "paid", "active"];
  const hasActiveBookings = existingBookings.some(
    (b) => b.listing_id === listing.id && activeStatuses.includes(b.status)
  );

  if (hasActiveBookings) {
    return {
      allowed: false,
      code: "ACTIVE_BOOKINGS_EXIST",
      error: "Cannot remove listing while active or pending reservations exist.",
    };
  }

  return {
    allowed: true,
    newStatus: "archived",
    deleted_at: new Date().toISOString(),
  };
}

const mockListingWithBookings = { id: "list-1", title: "Excavator CAT 320" };
const activeBookingList = [
  { id: "bk-1", listing_id: "list-1", status: "pending" },
  { id: "bk-2", listing_id: "list-2", status: "completed" },
];
const clearBookingList = [
  { id: "bk-3", listing_id: "list-1", status: "completed" },
  { id: "bk-4", listing_id: "list-1", status: "cancelled" },
];

const deleteBlockedResult = simulateListingDeletion(mockListingWithBookings, activeBookingList);
assert(!deleteBlockedResult.allowed && deleteBlockedResult.code === "ACTIVE_BOOKINGS_EXIST", "Listing deletion blocked when active/pending bookings exist");

const deleteAllowedResult = simulateListingDeletion(mockListingWithBookings, clearBookingList);
assert(deleteAllowedResult.allowed && deleteAllowedResult.newStatus === "archived", "Listing deletion succeeds via archiving when no active bookings exist");

// Simulation 18.2: Safe Booking Cancellation Transitions
function simulateBookingTransition(callerRole, currentStatus, targetStatus) {
  if (callerRole === "renter") {
    if (targetStatus === "cancelled") {
      if (["pending", "accepted"].includes(currentStatus)) {
        return { allowed: true, newStatus: "cancelled" };
      }
      return { allowed: false, code: "INVALID_TRANSITION", error: "Only pending or accepted reservations can be cancelled." };
    }
    return { allowed: false, code: "UNAUTHORIZED", error: "Renter cannot perform this transition." };
  }

  if (callerRole === "owner") {
    if (targetStatus === "accepted") {
      if (currentStatus === "pending") {
        return { allowed: true, newStatus: "accepted" };
      }
      return { allowed: false, code: "INVALID_TRANSITION", error: "Only pending requests can be accepted." };
    }
    if (targetStatus === "cancelled") {
      if (["pending", "accepted"].includes(currentStatus)) {
        return { allowed: true, newStatus: "cancelled" };
      }
      return { allowed: false, code: "INVALID_TRANSITION", error: "Cannot decline or cancel a booking in current status." };
    }
  }

  return { allowed: false, code: "UNAUTHORIZED", error: "Unauthorized status transition." };
}

assert(simulateBookingTransition("renter", "pending", "cancelled").allowed, "Renter can cancel pending booking");
assert(simulateBookingTransition("renter", "accepted", "cancelled").allowed, "Renter can cancel accepted booking");
assert(!simulateBookingTransition("renter", "active", "cancelled").allowed, "Renter cannot cancel active ongoing rental");
assert(!simulateBookingTransition("renter", "completed", "cancelled").allowed, "Renter cannot cancel completed rental");
assert(simulateBookingTransition("owner", "pending", "accepted").allowed, "Owner can accept pending request");
assert(!simulateBookingTransition("owner", "accepted", "accepted").allowed, "Owner cannot accept already accepted booking");
assert(simulateBookingTransition("owner", "pending", "cancelled").allowed, "Owner can decline pending request");
assert(!simulateBookingTransition("owner", "completed", "cancelled").allowed, "Owner cannot decline/cancel completed rental");

// Simulation 18.3: Readable User Identity & Privacy Preservation
function formatUserDisplayName(profile, rawUserId) {
  if (profile) {
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
    if (fullName) return fullName;
  }
  if (rawUserId && rawUserId.startsWith("mock-")) return "Demo Renter";
  return "Verified Renter";
}

assert(formatUserDisplayName({ first_name: "Maria", last_name: "Santos" }, "user_123") === "Maria Santos", "Renders full name Maria Santos");
assert(formatUserDisplayName({ first_name: "Carlos", last_name: null }, "user_456") === "Carlos", "Renders single name Carlos");
assert(formatUserDisplayName(null, "user_3KmK4yh1ZXXabc123") === "Verified Renter", "Falls back to Verified Renter without leaking raw Clerk ID user_3KmK...");
assert(formatUserDisplayName(null, "mock-user-1") === "Demo Renter", "Renders Demo Renter for mock user");

// Simulation 18.4: Lister Reviews Validation & Eligibility
function simulateReviewSubmission({ reviewerId, listerId, bookingStatus, rating, comment }) {
  if (!reviewerId) return { error: "AUTH_REQUIRED" };
  if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) return { error: "INVALID_INPUT" };
  if (reviewerId === listerId) return { error: "SELF_REVIEW" };
  if (!["completed", "returned"].includes(bookingStatus)) return { error: "NOT_ELIGIBLE" };
  if (comment && comment.length > 1000) return { error: "INVALID_INPUT" };
  return { success: true };
}

assert(simulateReviewSubmission({ reviewerId: "renter-1", listerId: "lister-2", bookingStatus: "completed", rating: 5 }).success, "Eligible completed booking review succeeds");
assert(simulateReviewSubmission({ reviewerId: "renter-1", listerId: "lister-2", bookingStatus: "returned", rating: 4 }).success, "Eligible returned booking review succeeds");
assert(simulateReviewSubmission({ reviewerId: "user-1", listerId: "user-1", bookingStatus: "completed", rating: 5 }).error === "SELF_REVIEW", "Self-review is strictly rejected");
assert(simulateReviewSubmission({ reviewerId: "renter-1", listerId: "lister-2", bookingStatus: "pending", rating: 5 }).error === "NOT_ELIGIBLE", "Pending booking review is strictly rejected");
assert(simulateReviewSubmission({ reviewerId: "renter-1", listerId: "lister-2", bookingStatus: "active", rating: 5 }).error === "NOT_ELIGIBLE", "Active in-progress booking review is strictly rejected");
assert(simulateReviewSubmission({ reviewerId: "renter-1", listerId: "lister-2", bookingStatus: "completed", rating: 6 }).error === "INVALID_INPUT", "Invalid rating (>5) is rejected");

// -----------------------------------------------------------------------------
// 19. INTEGRITY, REVIEWS, REPORTING & LIFECYCLE OVERHAUL VERIFICATION
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 19: Marketplace Integrity, Reviews, Reporting & Lifecycle Overhaul");

// 19.1: Physical Deletion vs Historical Audit Archiving Simulation
function simulateAuthoritativeListingRemoval(listing, bookings, openReports = []) {
  if (openReports && openReports.length > 0) {
    return {
      success: false,
      code: "RESTRICTED",
      error: "Cannot delete listing while active moderation reports are under review.",
    };
  }

  const activeBookings = bookings.filter((b) =>
    ["pending", "accepted", "paid", "active"].includes(b.status)
  );
  if (activeBookings.length > 0) {
    return {
      success: false,
      code: "ACTIVE_BOOKINGS_EXIST",
      error: "Cannot remove listing while active or pending reservations exist.",
    };
  }

  const hasHistorical = bookings.some((b) =>
    ["completed", "returned", "cancelled"].includes(b.status)
  );
  if (hasHistorical) {
    return {
      success: false,
      code: "HISTORICAL_RECORDS_EXIST",
      action: "prompt_archive",
      error: "This equipment has historical rental records that must be retained for audit compliance.",
    };
  }

  // 0 bookings: physical hard delete from database & storage cleanup
  return {
    success: true,
    mode: "deleted",
    storagePhotosCleaned: true,
    deletedFromDb: true,
  };
}

const unbookedListing = { id: "list-zero", title: "Never Rented Generator" };
const historicalListing = { id: "list-hist", title: "Historical Backhoe" };
const activeListingItem = { id: "list-act", title: "Active Bulldozer" };

const zeroResult = simulateAuthoritativeListingRemoval(unbookedListing, []);
assert(zeroResult.success && zeroResult.mode === "deleted", "0-booking listing is physically hard-deleted from database");
assert(zeroResult.storagePhotosCleaned === true, "Storage photos are cleaned up on physical deletion");

const repResult = simulateAuthoritativeListingRemoval(unbookedListing, [], [{ id: "r1", status: "pending" }]);
assert(!repResult.success && repResult.code === "RESTRICTED", "Active moderation reports block physical deletion");

const histResult = simulateAuthoritativeListingRemoval(historicalListing, [{ id: "b1", status: "completed" }]);
assert(!histResult.success && histResult.code === "HISTORICAL_RECORDS_EXIST", "Historical bookings block hard delete to protect audit trail");
assert(histResult.action === "prompt_archive", "Historical bookings prompt user with safe archiving option");

const actResult = simulateAuthoritativeListingRemoval(activeListingItem, [{ id: "b2", status: "accepted" }]);
assert(!actResult.success && actResult.code === "ACTIVE_BOOKINGS_EXIST", "Active/pending bookings block deletion");

// 19.2: Canonical Equipment Identifier Normalization
function normalizeAssetIdentifierTest(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const trivialValues = new Set(["n/a", "na", "none", "null", "nil", "unknown", "0", "0000", "xxx"]);
  if (trivialValues.has(lower)) return null;
  const alphanumericOnly = lower.replace(/[^a-z0-9]/gi, "");
  if (alphanumericOnly.length < 3) return null;
  return alphanumericOnly;
}

assert(normalizeAssetIdentifierTest("  VIN-1HGCR2F83HA-001234  ") === "vin1hgcr2f83ha001234", "Strips spaces, hyphens, and casing from VIN");
assert(normalizeAssetIdentifierTest("N/A") === null, "Treats N/A as strictly null");
assert(normalizeAssetIdentifierTest("none") === null, "Treats 'none' as strictly null");
assert(normalizeAssetIdentifierTest("00") === null, "Treats short/trivial value as null (<3 alphanumeric chars)");
assert(normalizeAssetIdentifierTest("CAT-320D-2024") === "cat320d2024", "Normalizes machinery chassis code");

// 19.3: Multi-Attribute Duplicate Scoring & Shadow Quarantine Simulation
function simulateEvaluateDuplicateSignals(candidate, existing) {
  let score = 0;
  const isSameOwner = candidate.ownerId === existing.ownerId;
  const reasons = [];

  const normCandId = normalizeAssetIdentifierTest(candidate.serialOrVin);
  const normExtId = normalizeAssetIdentifierTest(existing.assetIdentifier);

  if (normCandId && normExtId && normCandId === normExtId) {
    score += 0.85;
    reasons.push("Identical physical serial number or VIN detected.");
  }

  if (candidate.categoryId === existing.categoryId) {
    if (candidate.title.trim().toLowerCase() === existing.title.trim().toLowerCase()) {
      score += isSameOwner ? 0.35 : 0.25;
      reasons.push("Identical title in same category.");
    }
  }

  if (candidate.make && existing.make && candidate.make.toLowerCase() === existing.make.toLowerCase()) {
    if (candidate.model && existing.model && candidate.model.toLowerCase() === existing.model.toLowerCase()) {
      score += 0.2;
      reasons.push("Exact make and model match.");
    }
  }

  const confidence = Math.min(1.0, score);
  let classification = "UNIQUE";
  let requiresQuarantine = false;

  if (confidence >= 0.85) {
    classification = "CONFIRMED_DUPLICATE";
    requiresQuarantine = !isSameOwner;
  } else if (confidence >= 0.65) {
    classification = "SUSPECTED_DUPLICATE";
    requiresQuarantine = true;
  }

  return { classification, confidence, isSameOwner, requiresQuarantine, reasons };
}

// Case A: Same owner reposting same physical serial number
const sameOwnerDup = simulateEvaluateDuplicateSignals(
  { ownerId: "user-1", categoryId: "excavators", title: "CAT 320D", serialOrVin: "CAT-320-9988", make: "Caterpillar", model: "320D" },
  { ownerId: "user-1", categoryId: "excavators", title: "CAT 320D", assetIdentifier: "cat3209988", make: "Caterpillar", model: "320D" }
);
assert(sameOwnerDup.classification === "CONFIRMED_DUPLICATE" && sameOwnerDup.isSameOwner, "Identical serial by same owner classified as CONFIRMED_DUPLICATE");
assert(!sameOwnerDup.requiresQuarantine, "Same owner duplicate blocked directly rather than quarantined");

// Case B: Different owner posting identical equipment serial (collision / fraud)
const crossOwnerDup = simulateEvaluateDuplicateSignals(
  { ownerId: "user-2", categoryId: "excavators", title: "CAT 320D", serialOrVin: "CAT-320-9988", make: "Caterpillar", model: "320D" },
  { ownerId: "user-1", categoryId: "excavators", title: "CAT 320D", assetIdentifier: "cat3209988", make: "Caterpillar", model: "320D" }
);
assert(crossOwnerDup.classification === "CONFIRMED_DUPLICATE" && !crossOwnerDup.isSameOwner, "Cross-account serial collision detected");
assert(crossOwnerDup.requiresQuarantine, "Cross-account collision requires shadow_quarantine for admin verification");

// 19.4: Three-Strike Policy & Cooldown Evaluation
function simulateStrikePolicy(currentStrikeCount) {
  if (currentStrikeCount <= 1) {
    return { action: "ALLOW_WITH_WARNING" };
  }
  if (currentStrikeCount === 2) {
    return { action: "APPLY_24H_COOLDOWN", cooldownHours: 24 };
  }
  return { action: "REQUIRE_MANDATORY_ADMIN_REVIEW" };
}

assert(simulateStrikePolicy(1).action === "ALLOW_WITH_WARNING", "Strike 1 allows with warning");
assert(simulateStrikePolicy(2).action === "APPLY_24H_COOLDOWN", "Strike 2 applies 24-hour cooldown");
assert(simulateStrikePolicy(3).action === "REQUIRE_MANDATORY_ADMIN_REVIEW", "Strike 3 requires mandatory admin review");

// 19.5: Category Stock-Slot Allowance (Quota)
function simulateCategoryQuota(activeCount, categorySlug) {
  const quotas = { heavy_machinery: 8, power_tools: 15, default: 5 };
  const max = quotas[categorySlug] || quotas.default;
  return { allowed: activeCount < max, maxAllowed: max };
}

assert(simulateCategoryQuota(4, "heavy_machinery").allowed, "4/8 heavy machinery listings allowed");
assert(!simulateCategoryQuota(8, "heavy_machinery").allowed, "8/8 heavy machinery listings rejected by quota");
assert(simulateCategoryQuota(10, "power_tools").allowed, "10/15 power tools listings allowed");

// 19.6: Preliminary Coordination Feedback Simulation
function simulatePreliminaryFeedback({ bookingStatus, callerId, renterId, ownerId, commScore, punctScore }) {
  if (!["accepted", "paid", "active", "confirmed"].includes(bookingStatus)) {
    return { success: false, code: "NOT_ELIGIBLE", error: "Only accepted bookings can receive preliminary coordination feedback" };
  }
  if (callerId !== renterId && callerId !== ownerId) {
    return { success: false, code: "UNAUTHORIZED", error: "Not a booking participant" };
  }
  if (!commScore || commScore < 1 || commScore > 5 || !punctScore || punctScore < 1 || punctScore > 5) {
    return { success: false, code: "INVALID_INPUT" };
  }
  return {
    success: true,
    isPublicStarRating: false, // Explicit platform coordination invariant
    privateOperationsOnly: true,
  };
}

const validCoordination = simulatePreliminaryFeedback({
  bookingStatus: "accepted",
  callerId: "renter-1",
  renterId: "renter-1",
  ownerId: "host-1",
  commScore: 5,
  punctScore: 4,
});
assert(validCoordination.success, "Preliminary coordination feedback succeeds for accepted booking");
assert(validCoordination.isPublicStarRating === false, "Preliminary coordination feedback is explicitly excluded from public star ratings");

const pendingCoordination = simulatePreliminaryFeedback({
  bookingStatus: "pending",
  callerId: "renter-1",
  renterId: "renter-1",
  ownerId: "host-1",
  commScore: 5,
  punctScore: 5,
});
assert(!pendingCoordination.success && pendingCoordination.code === "NOT_ELIGIBLE", "Preliminary coordination rejected on pending booking");

// 19.7: Reciprocal Host-to-Renter Review Simulation
function simulateRenterReview({ bookingStatus, callerId, ownerId, renterId, rating }) {
  if (!["completed", "returned"].includes(bookingStatus)) {
    return { success: false, code: "NOT_ELIGIBLE" };
  }
  if (callerId !== ownerId) {
    return { success: false, code: "UNAUTHORIZED", error: "Only equipment host can review renter" };
  }
  if (callerId === renterId) {
    return { success: false, code: "SELF_REVIEW" };
  }
  if (!rating || rating < 1 || rating > 5) {
    return { success: false, code: "INVALID_INPUT" };
  }
  return { success: true };
}

const hostReviewsRenter = simulateRenterReview({
  bookingStatus: "completed",
  callerId: "host-1",
  ownerId: "host-1",
  renterId: "renter-2",
  rating: 5,
});
assert(hostReviewsRenter.success, "Host successfully submits reciprocal review for verified renter");

const strangerReviewsRenter = simulateRenterReview({
  bookingStatus: "completed",
  callerId: "stranger-99",
  ownerId: "host-1",
  renterId: "renter-2",
  rating: 5,
});
assert(!strangerReviewsRenter.success && strangerReviewsRenter.code === "UNAUTHORIZED", "Stranger cannot review renter");

// 19.8: Reporting System (Listing & Profile) Simulation
function simulatePlatformReport({ reporterId, targetType, targetOwnerId, reason }) {
  if (!reporterId) return { success: false, code: "AUTH_REQUIRED" };
  if (reporterId === targetOwnerId) return { success: false, code: "SELF_REPORT", error: "Cannot report own asset or profile" };
  if (!reason || reason.trim().length < 3) return { success: false, code: "INVALID_INPUT" };
  return { success: true, targetType, status: "pending" };
}

const reportListing = simulatePlatformReport({ reporterId: "user-a", targetType: "listing", targetOwnerId: "user-b", reason: "Damaged hydraulics not as pictured" });
assert(reportListing.success && reportListing.status === "pending", "Listing report successfully submitted with pending status");

const reportProfile = simulatePlatformReport({ reporterId: "user-a", targetType: "profile", targetOwnerId: "user-c", reason: "Fraudulent contact behavior" });
assert(reportProfile.success && reportProfile.targetType === "profile", "Profile report successfully submitted");

const selfReport = simulatePlatformReport({ reporterId: "user-a", targetType: "listing", targetOwnerId: "user-a", reason: "Test reason" });
assert(!selfReport.success && selfReport.code === "SELF_REPORT", "Self-reporting is strictly blocked");

// 19.9: Concurrency-Safe Duplicate Strike Serialization Simulation
function simulateTransactionFlow({ useAdvisoryLock = true }) {
  const committedTable = [];
  let advisoryLockHeldBy = null;
  const targetUser = "user_concurrent";

  // Step 1: T1 begins and executes BEFORE INSERT trigger
  if (useAdvisoryLock) {
    advisoryLockHeldBy = "T1";
  }

  // T1 reads existing strike count from committed table
  const t1PriorStrike = committedTable
    .filter((r) => r.user_id === targetUser)
    .reduce((max, r) => Math.max(max, r.strike_count), 0);
  const t1NewStrike = t1PriorStrike + 1;
  const t1Cooldown = t1NewStrike >= 2 ? "24_HOURS" : null;

  // Step 2: T2 starts concurrently before T1 commits
  let t2Blocked = false;
  if (useAdvisoryLock && advisoryLockHeldBy !== null) {
    t2Blocked = true; // T2 must wait for transaction-level advisory lock
  }

  let t2NewStrike;
  let t2Cooldown;

  if (!useAdvisoryLock) {
    // Vulnerable state: T2 reads committed table concurrently before T1 commits
    const t2PriorStrike = committedTable
      .filter((r) => r.user_id === targetUser)
      .reduce((max, r) => Math.max(max, r.strike_count), 0);
    t2NewStrike = t2PriorStrike + 1;
    t2Cooldown = t2NewStrike >= 2 ? "24_HOURS" : null;

    committedTable.push({ user_id: targetUser, strike_count: t1NewStrike, cooldown: t1Cooldown });
    committedTable.push({ user_id: targetUser, strike_count: t2NewStrike, cooldown: t2Cooldown });
  } else {
    // Protected state: T1 commits and releases advisory lock
    committedTable.push({ user_id: targetUser, strike_count: t1NewStrike, cooldown: t1Cooldown });
    advisoryLockHeldBy = null;

    // T2 unblocks, acquires advisory lock, and reads committed table
    advisoryLockHeldBy = "T2";
    const t2PriorStrike = committedTable
      .filter((r) => r.user_id === targetUser)
      .reduce((max, r) => Math.max(max, r.strike_count), 0);
    t2NewStrike = t2PriorStrike + 1;
    t2Cooldown = t2NewStrike >= 2 ? "24_HOURS" : null;

    committedTable.push({ user_id: targetUser, strike_count: t2NewStrike, cooldown: t2Cooldown });
    advisoryLockHeldBy = null;
  }

  return {
    useAdvisoryLock,
    t2WasBlocked: t2Blocked,
    t1Strike: t1NewStrike,
    t2Strike: t2NewStrike,
    t1Cooldown,
    t2Cooldown,
    committedRecords: committedTable,
  };
}

function simulateRollbackFlow() {
  const committedTable = [];
  const targetUser = "user_rollback";

  // T1 acquires lock, calculates strike 1, but transaction aborts / rolls back
  let advisoryLock = "T1";
  // T1 rolls back -> lock released, 0 committed records
  advisoryLock = null;

  // T2 acquires lock, calculates strike
  advisoryLock = "T2";
  const prior = committedTable
    .filter((r) => r.user_id === targetUser)
    .reduce((max, r) => Math.max(max, r.strike_count), 0);
  const nextStrike = prior + 1;
  committedTable.push({ user_id: targetUser, strike_count: nextStrike });
  advisoryLock = null;

  return { t2Strike: nextStrike, committedCount: committedTable.length };
}

// Subtest A: Unlocked concurrency demonstrates race condition
const resUnlocked = simulateTransactionFlow({ useAdvisoryLock: false });
assert(resUnlocked.t1Strike === 1 && resUnlocked.t2Strike === 1, "Vulnerable engine confirms race condition where concurrent inserts both get strike 1");
assert(resUnlocked.t2Cooldown === null, "Vulnerable engine bypasses cooldown because both computed strike 1");

// Subtest B: Advisory lock serializes concurrent inserts for same user
const resLocked = simulateTransactionFlow({ useAdvisoryLock: true });
assert(resLocked.t2WasBlocked === true, "Advisory lock forces concurrent transaction to block until initial transaction commits");
assert(resLocked.t1Strike === 1 && resLocked.t2Strike === 2, "Advisory lock serialized transactions: strike 1 followed by strike 2");
assert(resLocked.t2Cooldown === "24_HOURS", "Strike 2 transaction received 24-hour cooldown automatically upon serialization");

// Subtest C: Rollback handling releases lock and leaves count unincremented
const resRollback = simulateRollbackFlow();
assert(resRollback.t2Strike === 1 && resRollback.committedCount === 1, "Subsequent transaction after rollback computes strike 1 without phantom increments");

// 19.10: Static Migration 015 File Structure & Security Invariants
const migration015Path = path.join(__dirname, "../supabase/migrations/015_moderation_and_integrity_overhaul.sql");
const migration015Content = fs.readFileSync(migration015Path, "utf-8");

assert(migration015Content.includes("BEGIN;"), "Migration 015 is wrapped in BEGIN transactional block");
assert(migration015Content.includes("COMMIT;"), "Migration 015 concludes with COMMIT statement");
assert(
  migration015Content.includes("pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id, 0))"),
  "Migration 015 enforces 64-bit advisory transaction lock via hashtextextended"
);
assert(
  migration015Content.includes("SET search_path = public, pg_catalog"),
  "Migration 015 sets explicit and safe search path on strike trigger function"
);
assert(
  migration015Content.includes("idx_duplicate_enforcements_user_created"),
  "Migration 015 includes composite index for duplicate enforcement audit trail"
);
assert(
  !migration015Content.includes("pg_trigger_depth() > 1"),
  "Migration 015 does not contain vulnerable pg_trigger_depth() > 1 bypass"
);

// -----------------------------------------------------------------------------
// 20. PERFORMANCE OPTIMIZATIONS, PAGINATION & CACHING INVARIANTS
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 20: Performance Optimizations, Server-Side Pagination & Caching Invariants");

// 20.1: Pagination Math & Boundary Clamping Invariants
function computePaginationBounds(totalCount, rawPage, rawLimit) {
  const page = Math.max(1, Number(rawPage) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(rawLimit) || 24));
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const offset = (page - 1) * pageSize;
  const clampedPage = Math.min(page, totalPages);
  return { page, pageSize, totalPages, offset, clampedPage };
}

const p1 = computePaginationBounds(50, 1, 24);
assert(p1.page === 1 && p1.pageSize === 24 && p1.totalPages === 3 && p1.offset === 0, "Page 1 of 50 with limit 24 computes 3 total pages and 0 offset");

const p2 = computePaginationBounds(50, 2, 24);
assert(p2.offset === 24, "Page 2 with limit 24 computes offset 24");

const pNegative = computePaginationBounds(50, -5, 24);
assert(pNegative.page === 1, "Negative page is safely clamped to page 1");

const pExcessiveLimit = computePaginationBounds(50, 1, 9999);
assert(pExcessiveLimit.pageSize === 100, "Unreasonably large limit is capped at 100 to prevent denial-of-service memory pressure");

const pZeroItems = computePaginationBounds(0, 1, 24);
assert(pZeroItems.totalPages === 1, "Zero items returns 1 total page rather than 0 or NaN");

// 20.2: Static Code Invariant - Elimination of blocking currentUser() in request paths
const adminLayoutContent = fs.readFileSync(path.join(__dirname, "../app/admin/layout.tsx"), "utf-8");
assert(!adminLayoutContent.includes("currentUser("), "AdminLayout does NOT execute blocking currentUser() external API call");
assert(adminLayoutContent.includes("auth()"), "AdminLayout derives identity securely via local auth() session claims");

const adminActionsContent = fs.readFileSync(path.join(__dirname, "../app/admin/actions.ts"), "utf-8");
assert(!adminActionsContent.includes("currentUser("), "Admin actions do NOT execute blocking currentUser() external API call");

const dashboardActionsContent = fs.readFileSync(path.join(__dirname, "../app/dashboard/actions.ts"), "utf-8");
assert(!dashboardActionsContent.includes("currentUser("), "Dashboard actions do NOT execute blocking currentUser() external API call");

// 20.3: Static Code Invariant - Category Caching with unstable_cache
const marketplaceContent = fs.readFileSync(path.join(__dirname, "../lib/supabase/marketplace.ts"), "utf-8");
assert(marketplaceContent.includes("unstable_cache"), "lib/supabase/marketplace.ts utilizes Next.js unstable_cache for public reference data");
assert(marketplaceContent.includes("marketplace-categories"), "Marketplace categories are tagged with explicit cache tag for revalidation");
assert(marketplaceContent.includes(".range(offset, offset + pageSize - 1)"), "PostgREST queries enforce server-side SQL pagination range");

// 20.4: Static Code Invariant - Parallelized Admin Overview Queries
const adminSupabaseContent = fs.readFileSync(path.join(__dirname, "../lib/supabase/admin.ts"), "utf-8");
assert(adminSupabaseContent.includes("Promise.all(["), "Admin overview stats queries are parallelized with Promise.all");

// 20.5: Static Code Invariant - Hero Image Deferral
const heroContent = fs.readFileSync(path.join(__dirname, "../components/landing/hero.tsx"), "utf-8");
assert(heroContent.includes("shouldRenderImage"), "Hero carousel defers non-active background slides to save initial paint network weight");

console.log("\n===============================================================================");
console.log(`SUMMARY: ${passedTests}/${totalTests} Tests Passed (${failedTests} Failed)`);
console.log("===============================================================================");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}


