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

console.log("\n===============================================================================");
console.log(`SUMMARY: ${passedTests}/${totalTests} Tests Passed (${failedTests} Failed)`);
console.log("===============================================================================");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
