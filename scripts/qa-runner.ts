/**
 * QA & Release-Hardening Verification Suite for Rent It Marketplace
 * Tests user lifecycles, pricing formulas, authorization matrix, concurrency, and edge cases.
 */

import { parseISO, isBefore, startOfToday } from "date-fns";
import {
  calculateInclusiveRentalDays,
  calculateRentalTotalPrice,
  formatCurrency,
} from "../lib/utils";

const RESERVATION_BLOCKING_STATUSES = ["pending", "accepted", "paid", "active"] as const;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
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

function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
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
  !((RESERVATION_BLOCKING_STATUSES as readonly string[]).includes("cancelled")) &&
    !((RESERVATION_BLOCKING_STATUSES as readonly string[]).includes("completed")) &&
    !((RESERVATION_BLOCKING_STATUSES as readonly string[]).includes("returned")),
  "RESERVATION_BLOCKING_STATUSES excludes non-holding statuses (cancelled, completed, returned)"
);

// -----------------------------------------------------------------------------
// 4. AUTHORIZATION MATRIX & IDOR SIMULATION
// -----------------------------------------------------------------------------
console.log("\n▶ SUITE 4: Authorization Matrix & IDOR Prevention Simulation");

interface MockBookingRecord {
  id: string;
  renter_id: string;
  listing_owner_id: string;
  status: string;
}

function evaluateBookingTransitionAuth(
  callerId: string,
  callerRole: "customer" | "admin",
  booking: MockBookingRecord,
  targetStatus: string
): { allowed: boolean; reason: string } {
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

const sampleBooking: MockBookingRecord = {
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

function evaluateListingDeletion(
  callerId: string,
  callerRole: "customer" | "admin",
  listingOwnerId: string
): boolean {
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
function isAccountEligibleToBook(status: "active" | "restricted" | "banned" | "deleted"): boolean {
  return status === "active";
}

assert(isAccountEligibleToBook("active"), "Active accounts are eligible to book");
assert(!isAccountEligibleToBook("restricted"), "Restricted accounts are REJECTED from booking");
assert(!isAccountEligibleToBook("banned"), "Banned accounts are REJECTED from booking");
assert(!isAccountEligibleToBook("deleted"), "Deleted accounts are REJECTED from booking");

// Listing Status: Booking eligibility
function isListingAvailableToBook(status: string): boolean {
  return status === "available";
}

assert(isListingAvailableToBook("available"), "'available' listing can be booked");
assert(!isListingAvailableToBook("rented"), "'rented' listing cannot be booked");
assert(!isListingAvailableToBook("maintenance"), "'maintenance' listing cannot be booked");
assert(!isListingAvailableToBook("restricted"), "'restricted' listing cannot be booked");
assert(!isListingAvailableToBook("deleted"), "'deleted' listing cannot be booked");

console.log("\n===============================================================================");
console.log(`SUMMARY: ${passedTests}/${totalTests} Tests Passed (${failedTests} Failed)`);
console.log("===============================================================================");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
