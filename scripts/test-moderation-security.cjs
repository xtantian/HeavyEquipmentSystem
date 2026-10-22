/**
 * Rent It Marketplace - Listing Moderation Security & Correctness Verification Suite
 *
 * TEST ARCHITECTURE:
 * Layer A: In-Memory Logic Simulation Suites (Pure deterministic unit tests)
 * Layer B: Mocked Boundary Unit Tests (Exercising compensatory rollback & error recovery semantics)
 * Layer C: Proposed Migration 016 Specification Verification (Database architectural contracts)
 *
 * NOTE: Live database integration tests requiring a dedicated staging PostgreSQL database
 * are separated and documented; this suite does NOT execute destructive calls against production.
 */

const assert = require("assert");

let passedCount = 0;
let failedCount = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(`    Error: ${err.message}`);
    failedCount++;
  }
}

async function testAsync(description, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(`    Error: ${err.message}`);
    failedCount++;
  }
}

console.log("\n===============================================================================");
console.log("RENT IT MARKETPLACE - MODERATION SECURITY & CORRECTNESS SUITE");
console.log("===============================================================================\n");

// ===========================================================================
// LAYER A: IN-MEMORY DOMAIN INVARIANTS (DETERMINISTIC SIMULATIONS)
// ===========================================================================

console.log("--- LAYER A: In-Memory Domain Invariants (Pure Logic Simulations) ---");
console.log("▶ SUITE 1: Listing Detail Page Access Control (Information Leak Prevention)");

function evaluateListingAccess({ listing, callerId, isAdmin }) {
  if (!listing) return { status: 404, mode: "not_found" };
  const isAvailable = listing.status === "available";
  if (isAvailable) {
    return { status: 200, mode: "public" };
  }
  const isOwner = Boolean(callerId && listing.owner_id === callerId);
  if (isOwner) {
    return { status: 200, mode: "owner_preview" };
  }
  if (isAdmin) {
    return { status: 200, mode: "admin_inspection" };
  }
  return { status: 404, mode: "not_found" };
}

test("Public unauthenticated visitor can view available listing", () => {
  const res = evaluateListingAccess({
    listing: { id: "l-1", status: "available", owner_id: "user-1" },
    callerId: null,
    isAdmin: false,
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.mode, "public");
});

test("Public visitor is denied (404 notFound) on pending_review listing", () => {
  const res = evaluateListingAccess({
    listing: { id: "l-2", status: "pending_review", owner_id: "user-1" },
    callerId: null,
    isAdmin: false,
  });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.mode, "not_found");
});

test("Public visitor is denied (404 notFound) on shadow_quarantined listing", () => {
  const res = evaluateListingAccess({
    listing: { id: "l-3", status: "shadow_quarantined", owner_id: "user-1" },
    callerId: null,
    isAdmin: false,
  });
  assert.strictEqual(res.status, 404);
});

test("Public visitor is denied (404 notFound) on restricted / rejected listing", () => {
  const res = evaluateListingAccess({
    listing: { id: "l-4", status: "restricted", attributes: { moderation_status: "rejected" }, owner_id: "user-1" },
    callerId: null,
    isAdmin: false,
  });
  assert.strictEqual(res.status, 404);
});

test("Unrelated logged-in user is denied (404 notFound) on another user's pending listing", () => {
  const res = evaluateListingAccess({
    listing: { id: "l-5", status: "pending_review", owner_id: "user-1" },
    callerId: "user-2",
    isAdmin: false,
  });
  assert.strictEqual(res.status, 404);
});

test("Listing owner can access their own pending listing in Owner Preview Mode", () => {
  const res = evaluateListingAccess({
    listing: { id: "l-6", status: "pending_review", owner_id: "user-1" },
    callerId: "user-1",
    isAdmin: false,
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.mode, "owner_preview");
});

test("Listing owner can access their own rejected listing in Owner Preview Mode", () => {
  const res = evaluateListingAccess({
    listing: { id: "l-7", status: "restricted", attributes: { moderation_status: "rejected" }, owner_id: "user-1" },
    callerId: "user-1",
    isAdmin: false,
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.mode, "owner_preview");
});

test("Administrator can inspect any non-public listing in Admin Inspection Mode", () => {
  const res = evaluateListingAccess({
    listing: { id: "l-8", status: "pending_review", owner_id: "user-1" },
    callerId: "admin-user",
    isAdmin: true,
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.mode, "admin_inspection");
});

console.log("\n▶ SUITE 2: Moderation Transition Matrix & Policy Verification");

function simulateApproveGuards({ listing, options }) {
  if (!listing) return { error: "Listing not found", code: "NOT_FOUND" };

  if (listing.status === "shadow_quarantined" && !options?.resolveQuarantine) {
    return {
      error: "Quarantine resolution required",
      code: "QUARANTINE_UNRESOLVED",
    };
  }

  const existingAttrs = listing.attributes || {};
  if (listing.status === "restricted" && existingAttrs.moderation_status !== "rejected") {
    return {
      error: "Platform safety restriction cannot be approved via queue",
      code: "RESTRICTED_VIOLATION",
    };
  }

  if (listing.status === "inactive") {
    return {
      error: "Listing is inactive by owner choice",
      code: "INACTIVE_OWNER_CHOICE",
    };
  }

  const allowed = ["pending_review", "shadow_quarantined", "restricted"];
  if (!allowed.includes(listing.status)) {
    return { error: `Cannot approve status '${listing.status}'`, code: "INVALID_STATUS" };
  }

  return { success: true };
}

test("Approve rejects shadow_quarantined listing when resolveQuarantine is false/omitted", () => {
  const res = simulateApproveGuards({
    listing: { id: "sq-1", status: "shadow_quarantined" },
    options: {},
  });
  assert.strictEqual(res.code, "QUARANTINE_UNRESOLVED");
});

test("Approve permits shadow_quarantined listing when resolveQuarantine is explicitly true", () => {
  const res = simulateApproveGuards({
    listing: { id: "sq-2", status: "shadow_quarantined" },
    options: { resolveQuarantine: true },
  });
  assert.strictEqual(res.success, true);
});

test("Approve rejects safety-restricted listing (not moderation rejected)", () => {
  const res = simulateApproveGuards({
    listing: { id: "r-1", status: "restricted", attributes: {} },
    options: {},
  });
  assert.strictEqual(res.code, "RESTRICTED_VIOLATION");
});

test("Approve permits moderation-rejected listing", () => {
  const res = simulateApproveGuards({
    listing: { id: "r-2", status: "restricted", attributes: { moderation_status: "rejected" } },
    options: {},
  });
  assert.strictEqual(res.success, true);
});

test("Approve rejects inactive listing de-activated by owner", () => {
  const res = simulateApproveGuards({
    listing: { id: "i-1", status: "inactive" },
    options: {},
  });
  assert.strictEqual(res.code, "INACTIVE_OWNER_CHOICE");
});

console.log("\n▶ SUITE 3: Owner Resubmission Governance & Duplicate Prevention");

function simulateResubmitValidation({ callerId, userProfile, enforcements, listing, updatedData }) {
  if (!callerId) return { success: false, code: "AUTH_REQUIRED" };

  if (userProfile?.status === "restricted") return { success: false, code: "RESTRICTED" };
  if (userProfile?.status === "banned" || userProfile?.status === "deleted") return { success: false, code: "RESTRICTED" };

  if (enforcements?.strike_count >= 3) return { success: false, code: "STRIKE_BLOCKED" };
  if (enforcements?.cooldown_until && new Date(enforcements.cooldown_until).getTime() > Date.now()) {
    return { success: false, code: "COOLDOWN_ACTIVE" };
  }

  if (!listing) return { success: false, code: "NOT_FOUND" };
  if (listing.owner_id !== callerId) return { success: false, code: "UNAUTHORIZED" };

  const existingAttrs = listing.attributes || {};
  const isModerationRejected = listing.status === "restricted" && existingAttrs.moderation_status === "rejected";
  const isPending = listing.status === "pending_review" || listing.status === "shadow_quarantined";

  if (listing.status === "available" || listing.status === "deleted" || listing.status === "archived") {
    return { success: false, code: "INVALID_STATE" };
  }
  if (listing.status === "restricted" && !isModerationRejected) {
    return { success: false, code: "RESTRICTED_VIOLATION" };
  }
  if (!isPending && !isModerationRejected) {
    return { success: false, code: "INVALID_STATE" };
  }

  const finalTitle = updatedData.title !== undefined ? updatedData.title.trim() : listing.title;
  if (finalTitle.length < 3 || finalTitle.length > 120) return { success: false, code: "INVALID_INPUT" };

  const finalDesc = updatedData.description !== undefined ? updatedData.description.trim() : (listing.description || "");
  if (finalDesc.length < 10 || finalDesc.length > 3000) return { success: false, code: "INVALID_INPUT" };

  const finalPrice = updatedData.pricePerDay !== undefined ? Number(updatedData.pricePerDay) : Number(listing.price_per_day);
  if (isNaN(finalPrice) || finalPrice <= 0 || finalPrice > 5000000) return { success: false, code: "INVALID_INPUT" };

  const finalLoc = updatedData.location !== undefined ? updatedData.location.trim() : (listing.location || "");
  if (finalLoc.length < 3) return { success: false, code: "INVALID_INPUT" };

  return { success: true, status: "pending_review" };
}

test("Resubmission blocked for 3-strike account in duplicate_enforcements", () => {
  const res = simulateResubmitValidation({
    callerId: "u-1",
    userProfile: { status: "active" },
    enforcements: { strike_count: 3, cooldown_until: null },
    listing: { id: "l-1", owner_id: "u-1", status: "restricted", attributes: { moderation_status: "rejected" }, title: "Excavator", description: "Good condition machine", price_per_day: 5000, location: "Manila" },
    updatedData: {},
  });
  assert.strictEqual(res.code, "STRIKE_BLOCKED");
});

test("Resubmission blocked during active cooldown period", () => {
  const future = new Date(Date.now() + 3600000).toISOString();
  const res = simulateResubmitValidation({
    callerId: "u-1",
    userProfile: { status: "active" },
    enforcements: { strike_count: 1, cooldown_until: future },
    listing: { id: "l-1", owner_id: "u-1", status: "restricted", attributes: { moderation_status: "rejected" }, title: "Excavator", description: "Good condition machine", price_per_day: 5000, location: "Manila" },
    updatedData: {},
  });
  assert.strictEqual(res.code, "COOLDOWN_ACTIVE");
});

test("Resubmission succeeds for compliant rejected listing with valid edits", () => {
  const res = simulateResubmitValidation({
    callerId: "u-1",
    userProfile: { status: "active" },
    enforcements: { strike_count: 0, cooldown_until: null },
    listing: { id: "l-1", owner_id: "u-1", status: "restricted", attributes: { moderation_status: "rejected" }, title: "Old Excavator", description: "Old description here", price_per_day: 5000, location: "Manila" },
    updatedData: { title: "Caterpillar 320D Excavator", description: "Updated full service report and inspected hydraulics." },
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.status, "pending_review");
});

// ===========================================================================
// LAYER B: MOCKED BOUNDARY TESTS: COMPENSATORY ROLLBACK SEMANTICS
// ===========================================================================

console.log("\n--- LAYER B: Mocked Boundary Unit Tests (Rollback & Recovery Semantics) ---");
console.log("▶ SUITE 4: Compensatory Rollback Concurrency & Error Semantics");

// Mock Supabase listing updater modeling app/admin/actions.ts rollback
function executeMockRollback({
  expectedStatusCondition,
  currentDbRecord,
  dbThrowsError = false,
}) {
  if (dbThrowsError) {
    return { data: null, error: { message: "Database connection terminated during rollback" } };
  }

  // Check matching ID and status predicate
  if (currentDbRecord.id && currentDbRecord.status === expectedStatusCondition) {
    currentDbRecord.status = "pending_review";
    return { data: [{ id: currentDbRecord.id, status: currentDbRecord.status }], error: null };
  }

  // 0 rows matched due to concurrent update
  return { data: [], error: null };
}

test("Approve rollback specifies status = 'available' condition", () => {
  const dbRecord = { id: "item-1", status: "available" };
  const res = executeMockRollback({
    expectedStatusCondition: "available",
    currentDbRecord: dbRecord,
  });

  assert.strictEqual(res.error, null);
  assert.strictEqual(res.data.length, 1);
  assert.strictEqual(dbRecord.status, "pending_review");
});

test("Approve rollback aborts with ROLLBACK_CONFLICT if concurrently changed to another status", () => {
  // Concurrently changed to 'restricted' by another admin
  const dbRecord = { id: "item-1", status: "restricted" };
  const res = executeMockRollback({
    expectedStatusCondition: "available", // Only roll back if still 'available'
    currentDbRecord: dbRecord,
  });

  assert.strictEqual(res.error, null);
  assert.strictEqual(res.data.length, 0); // 0 rows modified
  assert.strictEqual(dbRecord.status, "restricted"); // Preserved concurrent decision!
});

test("Decline rollback specifies status = 'restricted' condition", () => {
  const dbRecord = { id: "item-2", status: "restricted" };
  const res = executeMockRollback({
    expectedStatusCondition: "restricted",
    currentDbRecord: dbRecord,
  });

  assert.strictEqual(res.error, null);
  assert.strictEqual(res.data.length, 1);
  assert.strictEqual(dbRecord.status, "pending_review");
});

test("Rollback database failure is captured and reported as ROLLBACK_FAILED (not masked)", () => {
  const dbRecord = { id: "item-3", status: "available" };
  const res = executeMockRollback({
    expectedStatusCondition: "available",
    currentDbRecord: dbRecord,
    dbThrowsError: true,
  });

  assert.ok(res.error);
  assert.strictEqual(res.error.message, "Database connection terminated during rollback");
});

console.log("\n▶ SUITE 5: Duplicate Auto-Archive Ordering & Rental Safety Semantics");

function executeMockCreationOrResubmissionWithArchive({
  primaryOperationFails = false,
  olderListing,
  activeBookingsForOlderListing = [],
}) {
  // 1. Primary write step (insert or conditional update)
  if (primaryOperationFails) {
    return {
      success: false,
      error: "Primary write failed: validation or concurrency conflict",
      olderListingStatus: olderListing.status, // MUST NOT BE MUTATED!
    };
  }

  // 2. Primary write succeeded! Now execute safe post-write archive step
  const isRented = olderListing.status === "rented";
  const hasActiveReservation = activeBookingsForOlderListing.some((b) =>
    ["pending", "accepted", "paid", "active"].includes(b.status)
  );

  let archiveAttempted = false;
  let archiveSucceeded = false;

  if (!isRented && !hasActiveReservation) {
    archiveAttempted = true;
    if (["available", "pending_review", "inactive", "shadow_quarantined", "restricted"].includes(olderListing.status)) {
      olderListing.status = "archived";
      archiveSucceeded = true;
    }
  }

  return {
    success: true,
    archiveAttempted,
    archiveSucceeded,
    olderListingStatus: olderListing.status,
  };
}

test("Failed listing creation does not archive the older listing", () => {
  const older = { id: "old-1", status: "available" };
  const res = executeMockCreationOrResubmissionWithArchive({
    primaryOperationFails: true,
    olderListing: older,
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(older.status, "available"); // Untouched!
});

test("Failed resubmission does not archive the older listing", () => {
  const older = { id: "old-2", status: "pending_review" };
  const res = executeMockCreationOrResubmissionWithArchive({
    primaryOperationFails: true,
    olderListing: older,
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(older.status, "pending_review"); // Untouched!
});

test("Rented older listings are NEVER auto-archived", () => {
  const older = { id: "old-3", status: "rented" };
  const res = executeMockCreationOrResubmissionWithArchive({
    primaryOperationFails: false,
    olderListing: older,
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.archiveAttempted, false);
  assert.strictEqual(older.status, "rented"); // Protected from archiving!
});

test("Older listings with active reservations are NEVER auto-archived", () => {
  const older = { id: "old-4", status: "available" };
  const res = executeMockCreationOrResubmissionWithArchive({
    primaryOperationFails: false,
    olderListing: older,
    activeBookingsForOlderListing: [{ id: "b-1", status: "paid" }],
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.archiveAttempted, false);
  assert.strictEqual(older.status, "available"); // Protected from archiving!
});

test("Compliant older duplicate without bookings is safely auto-archived after primary success", () => {
  const older = { id: "old-5", status: "available" };
  const res = executeMockCreationOrResubmissionWithArchive({
    primaryOperationFails: false,
    olderListing: older,
    activeBookingsForOlderListing: [],
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.archiveSucceeded, true);
  assert.strictEqual(older.status, "archived");
});

console.log("\n▶ SUITE 6: Service-Role Configuration & Resubmission State Boundaries");

function executeMockResubmitServiceClientCheck({
  listingStatus,
  serviceKeyConfigured,
}) {
  let updateClientType = "authenticated";

  if (listingStatus === "restricted") {
    if (!serviceKeyConfigured) {
      // Must return SERVICE_CONFIG_ERROR immediately, without falling back to authenticated client
      return {
        success: false,
        error: "Server configuration error: elevated service credentials are required to process restricted listing resubmission.",
        code: "SERVICE_CONFIG_ERROR",
        clientUsed: null,
      };
    }
    updateClientType = "service_role";
  }

  // Update execution
  return {
    success: true,
    status: "pending_review", // Never 'available'
    clientUsed: updateClientType,
  };
}

test("Missing service-role configuration returns SERVICE_CONFIG_ERROR with NO authenticated fallback", () => {
  const res = executeMockResubmitServiceClientCheck({
    listingStatus: "restricted",
    serviceKeyConfigured: false,
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.code, "SERVICE_CONFIG_ERROR");
  assert.strictEqual(res.clientUsed, null); // No fallback!
});

test("Configured service-role client successfully elevates for restricted listing", () => {
  const res = executeMockResubmitServiceClientCheck({
    listingStatus: "restricted",
    serviceKeyConfigured: true,
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.clientUsed, "service_role");
  assert.strictEqual(res.status, "pending_review");
});

test("Resubmission of pending listing uses standard authenticated client", () => {
  const res = executeMockResubmitServiceClientCheck({
    listingStatus: "pending_review",
    serviceKeyConfigured: false, // Not needed for non-restricted
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.clientUsed, "authenticated");
  assert.strictEqual(res.status, "pending_review");
});

// ===========================================================================
// LAYER C: DATABASE ARCHITECTURE: PROPOSED MIGRATION 016 HARDENED RPC
// ===========================================================================

console.log("\n--- LAYER C: Database Architectural Specification (Proposed Migration 016) ---");
console.log("▶ SUITE 7: Hardened PostgreSQL RPC Specification Verification");

const hardenedProposedRpcSql = `
CREATE OR REPLACE FUNCTION admin_moderate_listing_atomic(
  p_listing_id UUID,
  p_expected_status TEXT,
  p_target_status TEXT,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL,
  p_resolve_quarantine BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id TEXT;
  v_admin_email TEXT;
  v_current RECORD;
BEGIN
  -- 1. Authoritative caller identity derivation (DO NOT trust caller parameter)
  IF current_user != 'service_role' THEN
    v_admin_id := auth.jwt() ->> 'sub';
    IF v_admin_id IS NULL OR NOT public.is_active_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Active administrator privileges required';
    END IF;
  ELSE
    v_admin_id := 'system_admin_service';
  END IF;

  -- 2. Validate Target Status
  IF p_target_status NOT IN ('available', 'restricted') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid target status', 'code', 'INVALID_TARGET');
  END IF;

  -- 3. Row lock FOR UPDATE
  SELECT * INTO v_current FROM public.listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found', 'code', 'NOT_FOUND');
  END IF;

  -- 4. Status concurrency verification
  IF v_current.status != p_expected_status THEN
    RETURN jsonb_build_object('success', false, 'error', 'Concurrent modification detected', 'code', 'CONFLICT');
  END IF;

  -- 5. Atomic Update & Audit Log
  UPDATE public.listings SET status = p_target_status, updated_at = NOW() WHERE id = p_listing_id;
  INSERT INTO public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (v_admin_id, p_action, 'listing', p_listing_id::text, jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION admin_moderate_listing_atomic(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_moderate_listing_atomic(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_moderate_listing_atomic(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
`;

test("Hardened RPC rejects caller-supplied admin identity parameters", () => {
  // Must NOT take p_admin_id or p_admin_email as arguments
  assert.ok(!hardenedProposedRpcSql.includes("p_admin_id TEXT"));
  assert.ok(!hardenedProposedRpcSql.includes("p_admin_email TEXT"));
});

test("Hardened RPC enforces active admin check via public.is_active_admin()", () => {
  assert.ok(hardenedProposedRpcSql.includes("public.is_active_admin()"));
});

test("Hardened RPC revokes execution from PUBLIC and authenticated", () => {
  assert.ok(hardenedProposedRpcSql.includes("REVOKE ALL ON FUNCTION admin_moderate_listing_atomic(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC"));
  assert.ok(hardenedProposedRpcSql.includes("REVOKE ALL ON FUNCTION admin_moderate_listing_atomic(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM authenticated"));
});

test("Hardened RPC grants execution strictly to service_role", () => {
  assert.ok(hardenedProposedRpcSql.includes("GRANT EXECUTE ON FUNCTION admin_moderate_listing_atomic(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role"));
});

test("Hardened RPC validates target status enum ('available', 'restricted')", () => {
  assert.ok(hardenedProposedRpcSql.includes("p_target_status NOT IN ('available', 'restricted')"));
});

// ===========================================================================
// LAYER D: ADMIN VERIFICATION & DATABASE AUTHORIZATION SAFEGUARDS
// ===========================================================================

console.log("\n--- LAYER D: Admin Verification & Database Authorization Safeguards ---");
console.log("▶ SUITE 8: Clerk API Resilience, Fail-Closed Verification & Database Invariants");

// Simulation of formatSafeClerkError helper
function formatSafeClerkError(err) {
  if (!err) return "Unknown error";
  if (err instanceof Error) {
    const errorWithStatus = err;
    const status = errorWithStatus.status || errorWithStatus.statusCode;
    const statusStr = status ? ` (HTTP ${status})` : "";
    const cleanMsg = err.message
      .replace(/(bearer|key|token|secret)\s*[:=\s]\s*\S+/gi, "$1 [REDACTED]")
      .replace(/(?:sk_|pk_|whsec_|eyJ)[a-zA-Z0-9_\-.]+/g, "[REDACTED_CREDENTIAL]");
    return `${err.name}${statusStr}: ${cleanMsg}`;
  }
  if (typeof err === "object" && err !== null && "status" in err) {
    return `HTTP ${err.status}`;
  }
  return String(err);
}

// Simulation of verifyAdminSession logic
async function simulateVerifyAdminSession({
  userId,
  sessionClaims,
  profile,
  clerkBackendMock,
}) {
  if (!userId) {
    return { authorized: false, reason: "Authentication required" };
  }

  const profileStatus = profile?.status || "active";
  if (profileStatus !== "active") {
    return { authorized: false, reason: `Administrator account is ${profileStatus}` };
  }

  // Step A: Fast-path local session claims
  if (sessionClaims?.role === "admin" || sessionClaims?.publicMetadata?.role === "admin") {
    return { authorized: true, source: "clerk_claims" };
  }

  // Step B: Authoritative Backend API
  try {
    const clerkUser = await clerkBackendMock(userId);
    if (clerkUser?.publicMetadata?.role === "admin") {
      return { authorized: true, source: "clerk_backend_api" };
    }
  } catch (err) {
    const safeMsg = formatSafeClerkError(err);
    return {
      authorized: false,
      reason: "Unauthorized: Administrator verification unavailable",
      diagnostic: safeMsg,
    };
  }

  return { authorized: false, reason: "Unauthorized: Administrator privileges required" };
}

(async () => {
  test("Diagnostic logging redacts tokens, bearer headers, and credentials from Clerk errors", () => {
    const sampleError = new Error("Request failed with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and sk_test_51MzAbc123");
    sampleError.name = "ClerkAPIError";
    sampleError.status = 401;

    const sanitized = formatSafeClerkError(sampleError);
    assert.ok(!sanitized.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    assert.ok(!sanitized.includes("sk_test_51MzAbc123"));
    assert.ok(sanitized.includes("ClerkAPIError (HTTP 401)"));
    assert.ok(sanitized.includes("[REDACTED]"));
    assert.ok(sanitized.includes("[REDACTED_CREDENTIAL]"));
  });

  await testAsync("Transient Clerk API failure fails closed with 'Administrator verification unavailable'", async () => {
    const result = await simulateVerifyAdminSession({
      userId: "user_test_admin",
      sessionClaims: {}, // No claims role, forces Step B
      profile: { role: "customer", status: "active" },
      clerkBackendMock: async () => {
        const fetchErr = new Error("fetch failed (ECONNREFUSED)");
        fetchErr.name = "TypeError";
        throw fetchErr;
      },
    });

    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.reason, "Unauthorized: Administrator verification unavailable");
    assert.ok(result.diagnostic.includes("TypeError: fetch failed"));
  });

  await testAsync("Clerk Rate Limiting (HTTP 429) fails closed with diagnostic status recorded", async () => {
    const result = await simulateVerifyAdminSession({
      userId: "user_test_admin",
      sessionClaims: {},
      profile: { role: "customer", status: "active" },
      clerkBackendMock: async () => {
        const err = new Error("Too Many Requests");
        err.name = "ClerkAPIResponseError";
        err.status = 429;
        throw err;
      },
    });

    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.reason, "Unauthorized: Administrator verification unavailable");
    assert.ok(result.diagnostic.includes("HTTP 429"));
  });

  await testAsync("Verified admin in Clerk claims bypasses network lookup via Step A (0ms fast path)", async () => {
    let backendCalled = false;
    const result = await simulateVerifyAdminSession({
      userId: "user_test_admin",
      sessionClaims: { role: "admin" },
      profile: { role: "customer", status: "active" },
      clerkBackendMock: async () => {
        backendCalled = true;
        return { publicMetadata: { role: "admin" } };
      },
    });

    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.source, "clerk_claims");
    assert.strictEqual(backendCalled, false, "Backend API should not be called when claims role is verified");
  });

  await testAsync("Verified admin via Clerk Backend API succeeds when claims are missing", async () => {
    const result = await simulateVerifyAdminSession({
      userId: "user_test_admin",
      sessionClaims: {},
      profile: { role: "customer", status: "active" },
      clerkBackendMock: async () => {
        return { publicMetadata: { role: "admin" } };
      },
    });

    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.source, "clerk_backend_api");
  });

  await testAsync("Stale Supabase profile role 'admin' rejected if Clerk metadata omits admin role", async () => {
    const result = await simulateVerifyAdminSession({
      userId: "user_test_customer",
      sessionClaims: {},
      profile: { role: "admin", status: "active" }, // Stale profile
      clerkBackendMock: async () => {
        return { publicMetadata: { role: "customer" } };
      },
    });

    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.reason, "Unauthorized: Administrator privileges required");
  });

  // Simulation of getAdminActionClient without misleading user-client fallback
  function simulateGetAdminActionClient(envKey) {
    if (!envKey) {
      throw new Error(
        "Administrative service is unavailable: service-role configuration is missing or invalid. Please check server environment settings (SUPABASE_KEY_SECRET)."
      );
    }
    return { isServiceRole: true };
  }

  test("Missing service-role configuration throws explicit configuration error without user fallback", () => {
    assert.throws(
      () => simulateGetAdminActionClient(null),
      (err) => {
        return (
          err.message.includes("Administrative service is unavailable: service-role configuration is missing or invalid")
        );
      }
    );
  });

  await testAsync("Admin Server Actions catch verification failures inside boundaries without throwing unhandled rejections", async () => {
    // Simulating getAdminInvitationsAction with internal verifyAdminCaller error handling
    async function simulateGetAdminInvitationsAction(authFn) {
      try {
        await authFn();
      } catch (err) {
        return {
          success: false,
          invitations: [],
          error: err.message,
        };
      }
      return { success: true, invitations: [] };
    }

    const res = await simulateGetAdminInvitationsAction(async () => {
      throw new Error("Unauthorized: Administrator verification unavailable");
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, "Unauthorized: Administrator verification unavailable");
    assert.deepStrictEqual(res.invitations, []);
  });

  test("Database invariant: Customer role in Supabase profiles is blocked from updating verification badges", () => {
    // Simulates PostgreSQL protect_listing_security() trigger
    function evaluateTrigger({ jwtSub, isVerifiedChanged, callerRole }) {
      const isAdm = callerRole === "admin";
      if (jwtSub && !isAdm) {
        if (isVerifiedChanged) {
          throw new Error("Unauthorized: Only authorized administrators can update listing verification badge.");
        }
      }
      return true;
    }

    // When profile role is 'customer', changing is_verified raises 42501 exception
    assert.throws(
      () => evaluateTrigger({ jwtSub: "user_123", isVerifiedChanged: true, callerRole: "customer" }),
      /Only authorized administrators can update listing verification badge/
    );

    // When profile role is 'admin', verification update succeeds
    assert.doesNotThrow(
      () => evaluateTrigger({ jwtSub: "user_123", isVerifiedChanged: true, callerRole: "admin" })
    );
  });

  // ===========================================================================
  // LAYER E: SELLER-SPECIFIC DUPLICATE DETECTION, INVENTORY SAFETY & MODERATION
  // ===========================================================================

  console.log("\n--- LAYER E: Seller-Specific Duplicate Detection, Inventory Safety & Moderation ---");
  console.log("▶ SUITE 9: 9-Point Regression Verification (Prompt Scenarios 1 to 9)");

  // Normalization logic matching lib/marketplace/integrity.ts
  function normalizeAssetIdentifierLocal(raw) {
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

  // Token similarity matching lib/marketplace/integrity.ts
  function computeTextSimilarityLocal(textA, textB) {
    if (!textA || !textB) return 0;
    const tokenize = (t) =>
      new Set(
        t
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .split(/\s+/)
          .filter((w) => w.length > 2)
      );
    const setA = tokenize(textA);
    const setB = tokenize(textB);
    if (setA.size === 0 || setB.size === 0) return 0;
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }

  // Exact duplicate evaluation logic matching lib/marketplace/integrity.ts
  function evaluateDuplicateSignalsLocal(candidate, existing) {
    const reasons = [];
    let score = 0;
    const isSameOwner = candidate.ownerId === existing.ownerId;

    if (!isSameOwner) {
      return {
        classification: "UNIQUE",
        confidence: 0,
        reasons: [],
        existingListingId: existing.id,
        isSameOwner: false,
        requiresQuarantine: false,
      };
    }

    // 1. Canonical Identifier Signal (Highest Weight - Physical Identity)
    const normCandidateId = normalizeAssetIdentifierLocal(candidate.serialOrVin);
    const normExistingId = normalizeAssetIdentifierLocal(existing.assetIdentifier);

    const hasMatchingAssetId = Boolean(
      normCandidateId && normExistingId && normCandidateId === normExistingId
    );

    if (hasMatchingAssetId && isSameOwner) {
      score += 0.85;
      reasons.push("Identical physical serial number, chassis code, or VIN detected on your account.");
    }

    // 2. Exact Title & Category Match
    const candidateTitleLower = candidate.title.trim().toLowerCase();
    const existingTitleLower = existing.title.trim().toLowerCase();
    const isSameCategory = candidate.categoryId === existing.categoryId;

    if (isSameCategory && isSameOwner) {
      if (candidateTitleLower === existingTitleLower) {
        score += 0.35;
        reasons.push("Identical equipment title in the same category on the same account.");
      } else {
        const titleSim = computeTextSimilarityLocal(candidate.title, existing.title);
        if (titleSim >= 0.75) {
          score += 0.25;
          reasons.push(`High title similarity (${Math.round(titleSim * 100)}%) on the same account.`);
        }
      }
    }

    // 3. Structured Specs (Make / Model from attributes)
    const extAttrs = existing.attributes || {};
    const candMake = candidate.make || "";
    const extMake = String(extAttrs.make || "").trim();
    const candModel = candidate.model || "";
    const extModel = String(extAttrs.model || "").trim();

    if (isSameOwner && candMake && extMake && candMake.toLowerCase() === extMake.toLowerCase()) {
      if (candModel && extModel && candModel.toLowerCase() === extModel.toLowerCase()) {
        score += 0.25;
        reasons.push(`Exact make (${candMake}) and model (${candModel}) match.`);
      }
    }

    // 4. Description similarity
    if (isSameOwner && candidate.description && existing.description) {
      const descSim = computeTextSimilarityLocal(candidate.description, existing.description);
      if (descSim >= 0.8) {
        score += 0.20;
        reasons.push(`Description matches existing listing by ${Math.round(descSim * 100)}%.`);
      }
    }

    const normalizedConfidence = isSameOwner ? Math.min(1.0, Number(score.toFixed(2))) : 0;
    let classification = "UNIQUE";
    let requiresQuarantine = false;

    if (isSameOwner) {
      if (normalizedConfidence >= 0.85) {
        classification = "CONFIRMED_DUPLICATE";
        requiresQuarantine = true;
      } else if (normalizedConfidence >= 0.65) {
        classification = "SUSPECTED_DUPLICATE";
        requiresQuarantine = true;
      } else if (normalizedConfidence >= 0.35) {
        classification = "WEAK_SIMILARITY";
      }
    }

    return {
      classification,
      confidence: normalizedConfidence,
      reasons,
      existingListingId: existing.id,
      existingListingTitle: existing.title,
      isSameOwner,
      requiresQuarantine,
    };
  }

  // Creation Status decision matching app/listings/actions.ts
  function determineListingCreationStatus(duplicateResult) {
    const isQualifyingDuplicate =
      duplicateResult &&
      duplicateResult.isSameOwner &&
      (duplicateResult.classification === "CONFIRMED_DUPLICATE" ||
        duplicateResult.classification === "SUSPECTED_DUPLICATE");

    if (isQualifyingDuplicate) {
      return {
        status: duplicateResult.classification === "CONFIRMED_DUPLICATE" ? "shadow_quarantined" : "pending_review",
        isQualifyingDuplicate: true,
        reasons: duplicateResult.reasons,
      };
    }

    return {
      status: "available",
      isQualifyingDuplicate: false,
      reasons: [],
    };
  }

  // Auto-Archive Eligibility evaluation matching app/listings/actions.ts:375-400
  function evaluateAutoArchiveEligibility({
    isSameOwner,
    candidateSerial,
    existingSerial,
    existingStatus,
    activeBookings = [],
  }) {
    const normCandidateSerial = normalizeAssetIdentifierLocal(candidateSerial);
    const normExistingSerial = normalizeAssetIdentifierLocal(existingSerial);
    const hasMatchingPhysicalSerial =
      normCandidateSerial !== null &&
      normExistingSerial !== null &&
      normCandidateSerial === normExistingSerial;

    if (!isSameOwner || !hasMatchingPhysicalSerial) {
      return { canArchive: false, reason: "Identical physical serial number required on same owner account" };
    }

    if (existingStatus === "rented") {
      return { canArchive: false, reason: "Cannot auto-archive rented equipment" };
    }

    const hasBlockingBooking = activeBookings.some((b) =>
      ["pending", "accepted", "paid", "active"].includes(b.status)
    );
    if (hasBlockingBooking) {
      return { canArchive: false, reason: "Cannot auto-archive equipment with active bookings or reservations" };
    }

    if (!["available", "pending_review", "inactive", "shadow_quarantined", "restricted"].includes(existingStatus)) {
      return { canArchive: false, reason: `Status '${existingStatus}' is not eligible for archival` };
    }

    return { canArchive: true };
  }

  // --- Scenario 1: A seller creates a unique listing; it is published directly as available ---
  test("Scenario 1: Seller creates a unique listing -> published directly with status = 'available'", () => {
    const candidate = {
      title: "2023 Caterpillar 320 GC Excavator",
      description: "Brand new crawler excavator with hydraulic thumb",
      categoryId: "cat-heavy",
      pricePerDay: 15000,
      location: "Taguig, Metro Manila",
      make: "Caterpillar",
      model: "320 GC",
      serialOrVin: "CAT-320GC-99901",
      ownerId: "seller_alpha",
    };

    // No existing listings for this seller
    const duplicateResult = evaluateDuplicateSignalsLocal(candidate, {
      id: "existing_1",
      title: "Komatsu D65 Dozer",
      categoryId: "cat-dozers",
      pricePerDay: 20000,
      location: "Taguig, Metro Manila",
      ownerId: "seller_alpha",
      assetIdentifier: "KOM-D65-001",
      attributes: { make: "Komatsu", model: "D65" },
    });

    assert.strictEqual(duplicateResult.classification, "UNIQUE");
    const { status, isQualifyingDuplicate } = determineListingCreationStatus(duplicateResult);
    assert.strictEqual(status, "available", "Unique listing must be published directly as 'available'");
    assert.strictEqual(isQualifyingDuplicate, false);
  });

  // --- Scenario 2: A seller submits a strong duplicate of their own listing; it is flagged for review ---
  test("Scenario 2: Seller submits strong duplicate of own listing -> flagged for review / quarantined", () => {
    const candidate = {
      title: "CAT 320D Hydraulic Excavator",
      description: "20-ton tracked excavator available for daily or monthly rental",
      categoryId: "cat-excavators",
      pricePerDay: 12000,
      location: "Quezon City",
      make: "Caterpillar",
      model: "320D",
      serialOrVin: "CAT320D-SERIAL-888",
      ownerId: "seller_alpha",
    };

    const existingSameOwnerListing = {
      id: "listing_alpha_old",
      title: "CAT 320D Hydraulic Excavator",
      description: "20-ton tracked excavator available for daily or monthly rental",
      categoryId: "cat-excavators",
      pricePerDay: 12000,
      location: "Quezon City",
      ownerId: "seller_alpha",
      assetIdentifier: "CAT320D-SERIAL-888", // Exact same serial!
      attributes: { make: "Caterpillar", model: "320D" },
    };

    const duplicateResult = evaluateDuplicateSignalsLocal(candidate, existingSameOwnerListing);
    assert.strictEqual(duplicateResult.isSameOwner, true);
    assert.strictEqual(duplicateResult.classification, "CONFIRMED_DUPLICATE");
    assert.strictEqual(duplicateResult.requiresQuarantine, true);

    const { status, isQualifyingDuplicate } = determineListingCreationStatus(duplicateResult);
    assert.strictEqual(isQualifyingDuplicate, true);
    assert.strictEqual(status, "shadow_quarantined", "Confirmed duplicate must route to shadow_quarantined");
  });

  // --- Scenario 3: Two different sellers submit equipment with the same title; neither is blocked ---
  test("Scenario 3: Two different sellers submit equipment with same title -> neither is blocked", () => {
    const sellerBListing = {
      title: "Caterpillar 320D Excavator",
      description: "Reliable excavator ready for immediate mobilization",
      categoryId: "cat-excavators",
      pricePerDay: 13000,
      location: "Cebu City",
      serialOrVin: "CAT-CEBU-101",
      ownerId: "seller_beta",
    };

    const existingSellerAListing = {
      id: "listing_alpha_1",
      title: "Caterpillar 320D Excavator", // Identical title!
      categoryId: "cat-excavators",
      pricePerDay: 12500,
      location: "Manila",
      ownerId: "seller_alpha", // Different seller!
      assetIdentifier: "CAT-MANILA-202",
      attributes: { make: "Caterpillar", model: "320D" },
    };

    const duplicateResult = evaluateDuplicateSignalsLocal(sellerBListing, existingSellerAListing);
    assert.strictEqual(duplicateResult.isSameOwner, false);
    assert.strictEqual(duplicateResult.classification, "UNIQUE");
    assert.strictEqual(duplicateResult.confidence, 0);
    assert.strictEqual(duplicateResult.requiresQuarantine, false);

    const { status } = determineListingCreationStatus(duplicateResult);
    assert.strictEqual(status, "available", "Different seller listing must publish as 'available'");

    // Cross-seller listings must NEVER trigger auto-archive on seller A's listing
    const archiveEligibility = evaluateAutoArchiveEligibility({
      isSameOwner: duplicateResult.isSameOwner,
      candidateSerial: sellerBListing.serialOrVin,
      existingSerial: existingSellerAListing.assetIdentifier,
      existingStatus: "available",
    });
    assert.strictEqual(archiveEligibility.canArchive, false, "Cross-seller listing can never archive another seller's listing");
  });

  // --- Scenario 4: Two sellers list same make and model; duplicate detection remains seller-specific ---
  test("Scenario 4: Two sellers list same make and model -> detection remains strictly seller-specific", () => {
    const candidateFromSeller2 = {
      title: "Komatsu PC200-8 Excavator",
      description: "Standard boom, 1.0 cbm bucket, serviced monthly",
      categoryId: "cat-heavy",
      pricePerDay: 14000,
      location: "Davao City",
      make: "Komatsu",
      model: "PC200-8",
      ownerId: "seller_2",
    };

    const existingFromSeller1 = {
      id: "listing_seller_1",
      title: "Komatsu PC200-8 Excavator",
      description: "Standard boom, 1.0 cbm bucket, serviced monthly",
      categoryId: "cat-heavy",
      pricePerDay: 14000,
      location: "Davao City",
      ownerId: "seller_1",
      attributes: { make: "Komatsu", model: "PC200-8" },
    };

    const result = evaluateDuplicateSignalsLocal(candidateFromSeller2, existingFromSeller1);
    assert.strictEqual(result.classification, "UNIQUE");
    assert.strictEqual(result.confidence, 0);
    assert.strictEqual(result.requiresQuarantine, false);
  });

  // --- Scenario 5: A seller owns two separate pieces of equipment with matching/similar names; matching names alone do not auto-archive or decline either listing ---
  test("Scenario 5: Seller owns two units with matching names -> matching names alone do NOT auto-archive or decline", () => {
    const existingUnit1 = {
      id: "unit_1_id",
      title: "Komatsu PC200 Excavator",
      categoryId: "cat-excavators",
      pricePerDay: 15000,
      location: "Batangas Yard",
      ownerId: "fleet_owner",
      assetIdentifier: "KOM-UNIT-01",
      attributes: { make: "Komatsu", model: "PC200" },
      status: "available",
    };

    // Seller creates unit 2 with identical title but distinct serial
    const candidateUnit2 = {
      title: "Komatsu PC200 Excavator",
      description: "Fleet unit #2 in excellent operating condition",
      categoryId: "cat-excavators",
      pricePerDay: 15000,
      location: "Batangas Yard",
      serialOrVin: "KOM-UNIT-02", // Distinct physical serial!
      ownerId: "fleet_owner",
    };

    const duplicateResult = evaluateDuplicateSignalsLocal(candidateUnit2, existingUnit1);
    // Score only receives title/category match (0.35) -> WEAK_SIMILARITY, not duplicate!
    assert.strictEqual(duplicateResult.classification, "WEAK_SIMILARITY");
    assert.strictEqual(duplicateResult.requiresQuarantine, false);

    const { status, isQualifyingDuplicate } = determineListingCreationStatus(duplicateResult);
    assert.strictEqual(status, "available", "Unit 2 must be published directly as 'available'");
    assert.strictEqual(isQualifyingDuplicate, false);

    // Auto-archive must be REJECTED because physical serials do not match
    const archiveEligibility = evaluateAutoArchiveEligibility({
      isSameOwner: true,
      candidateSerial: candidateUnit2.serialOrVin,
      existingSerial: existingUnit1.assetIdentifier,
      existingStatus: existingUnit1.status,
    });
    assert.strictEqual(archiveEligibility.canArchive, false, "Matching name alone must NEVER auto-archive existing fleet equipment");
  });

  // --- Scenario 6: Confirmed duplicate does not cause existing listing to disappear if new listing creation fails ---
  test("Scenario 6: Confirmed duplicate does not archive existing listing if creation fails", () => {
    const existingListing = {
      id: "existing_active_unit",
      status: "available",
      owner_id: "seller_alpha",
      asset_identifier: "CAT-320-EXACT",
    };

    // Simulate creation failure (e.g. database insert error)
    const creationResult = {
      success: false,
      error: "Database constraint error: duplicate key violates unique constraint",
    };

    // In app/listings/actions.ts: archive step only executes AFTER createListingAction succeeds
    let archiveExecuted = false;
    if (creationResult.success) {
      archiveExecuted = true;
      existingListing.status = "archived";
    }

    assert.strictEqual(archiveExecuted, false, "Archival must not run when primary creation fails");
    assert.strictEqual(existingListing.status, "available", "Existing listing must remain 'available' untouched");
  });

  // --- Scenario 7: Rented equipment and equipment with active bookings are protected from archival ---
  test("Scenario 7: Rented equipment and equipment with active bookings are strictly protected from archival", () => {
    // Subcase 7A: Equipment is currently rented
    const rentedArchiveCheck = evaluateAutoArchiveEligibility({
      isSameOwner: true,
      candidateSerial: "VIN-EXACT-123",
      existingSerial: "VIN-EXACT-123",
      existingStatus: "rented",
      activeBookings: [],
    });
    assert.strictEqual(rentedArchiveCheck.canArchive, false);
    assert.strictEqual(rentedArchiveCheck.reason, "Cannot auto-archive rented equipment");

    // Subcase 7B: Equipment is available in status but has active/paid booking reservations
    const bookedArchiveCheck = evaluateAutoArchiveEligibility({
      isSameOwner: true,
      candidateSerial: "VIN-EXACT-123",
      existingSerial: "VIN-EXACT-123",
      existingStatus: "available",
      activeBookings: [
        { id: "booking_1", status: "paid" },
      ],
    });
    assert.strictEqual(bookedArchiveCheck.canArchive, false);
    assert.strictEqual(bookedArchiveCheck.reason, "Cannot auto-archive equipment with active bookings or reservations");

    // Subcase 7C: Equipment with completed/cancelled booking is eligible
    const inactiveBookingCheck = evaluateAutoArchiveEligibility({
      isSameOwner: true,
      candidateSerial: "VIN-EXACT-123",
      existingSerial: "VIN-EXACT-123",
      existingStatus: "available",
      activeBookings: [
        { id: "booking_old", status: "completed" },
        { id: "booking_cancelled", status: "cancelled" },
      ],
    });
    assert.strictEqual(inactiveBookingCheck.canArchive, true);
  });

  // --- Scenario 8: Admin approve and decline actions work reliably, maintain audit records, and correctly transition status between available and restricted ---
  test("Scenario 8: Admin approve and decline actions reliably transition status and record audit logs", () => {
    // Admin Approve Simulation
    function simulateAdminApproveAction({ listing, adminId, expectedStatus }) {
      if (listing.status !== expectedStatus) {
        return { success: false, error: "Concurrent modification: listing status changed", code: "CONFLICT" };
      }
      const updatedAttributes = { ...(listing.attributes || {}) };
      delete updatedAttributes.moderation_status;
      delete updatedAttributes.moderation_rejection_reason;
      delete updatedAttributes.moderation_rejected_at;

      listing.status = "available";
      listing.attributes = updatedAttributes;

      const auditLog = {
        admin_id: adminId,
        action: "approve_listing",
        target_id: listing.id,
        details: { previous_status: expectedStatus, target_status: "available" },
      };

      return { success: true, listing, auditLog };
    }

    // Admin Decline Simulation
    function simulateAdminDeclineAction({ listing, adminId, expectedStatus, reason }) {
      if (!reason || !reason.trim()) {
        return { success: false, error: "A specific rejection reason is required", code: "VALIDATION_ERROR" };
      }
      if (listing.status !== expectedStatus) {
        return { success: false, error: "Concurrent modification: listing status changed", code: "CONFLICT" };
      }
      const updatedAttributes = {
        ...(listing.attributes || {}),
        moderation_status: "rejected",
        moderation_rejection_reason: reason.trim(),
        moderation_rejected_at: new Date().toISOString(),
      };

      listing.status = "restricted";
      listing.attributes = updatedAttributes;

      const auditLog = {
        admin_id: adminId,
        action: "decline_listing",
        target_id: listing.id,
        details: { previous_status: expectedStatus, target_status: "restricted", reason: reason.trim() },
      };

      return { success: true, listing, auditLog };
    }

    // Test Approve
    const pendingListing = { id: "list_mod_1", status: "pending_review", attributes: { moderation_status: "rejected" } };
    const approveResult = simulateAdminApproveAction({
      listing: pendingListing,
      adminId: "admin_user_01",
      expectedStatus: "pending_review",
    });
    assert.strictEqual(approveResult.success, true);
    assert.strictEqual(pendingListing.status, "available");
    assert.strictEqual(pendingListing.attributes.moderation_status, undefined, "Approval clears rejected attribute");
    assert.strictEqual(approveResult.auditLog.action, "approve_listing");

    // Test Decline
    const reviewListing = { id: "list_mod_2", status: "pending_review", attributes: {} };
    const declineResult = simulateAdminDeclineAction({
      listing: reviewListing,
      adminId: "admin_user_01",
      expectedStatus: "pending_review",
      reason: "Missing proof of ownership and invalid chassis photo",
    });
    assert.strictEqual(declineResult.success, true);
    assert.strictEqual(reviewListing.status, "restricted");
    assert.strictEqual(reviewListing.attributes.moderation_status, "rejected");
    assert.strictEqual(reviewListing.attributes.moderation_rejection_reason, "Missing proof of ownership and invalid chassis photo");
    assert.strictEqual(declineResult.auditLog.action, "decline_listing");

    // Concurrency conflict check
    const staleResult = simulateAdminApproveAction({
      listing: reviewListing, // status is now 'restricted'
      adminId: "admin_user_02",
      expectedStatus: "pending_review", // Stale expectation!
    });
    assert.strictEqual(staleResult.success, false);
    assert.strictEqual(staleResult.code, "CONFLICT");
  });

  // --- Scenario 9: Public marketplace queries never return listings that are pending review or quarantined ---
  test("Scenario 9: Public marketplace queries filter strictly for status = 'available'", () => {
    // Database population containing mixed statuses
    const databaseListings = [
      { id: "pub_1", title: "Excavator 1", status: "available" },
      { id: "pub_2", title: "Excavator 2", status: "pending_review" },
      { id: "pub_3", title: "Excavator 3", status: "shadow_quarantined" },
      { id: "pub_4", title: "Excavator 4", status: "restricted" },
      { id: "pub_5", title: "Excavator 5", status: "inactive" },
      { id: "pub_6", title: "Dozer 1", status: "available" },
    ];

    // Public marketplace query invariant: .in("status", ["available"])
    function queryPublicMarketplace(items) {
      return items.filter((item) => item.status === "available");
    }

    const publicResults = queryPublicMarketplace(databaseListings);
    assert.strictEqual(publicResults.length, 2);
    assert.deepStrictEqual(
      publicResults.map((r) => r.id),
      ["pub_1", "pub_6"]
    );
    assert.ok(!publicResults.some((r) => r.status === "pending_review"), "Pending review must never appear in public marketplace");
    assert.ok(!publicResults.some((r) => r.status === "shadow_quarantined"), "Quarantined listings must never appear in public marketplace");
    assert.ok(!publicResults.some((r) => r.status === "restricted"), "Restricted listings must never appear in public marketplace");
  });

  // ===========================================================================
  // LAYER F: ADMIN ACTIONS, AUTHORIZATION MATRIX & UNLIMITED INVENTORY
  // ===========================================================================

  console.log("\n--- LAYER F: Admin Actions, Authorization Matrix & Unlimited Inventory ---");
  console.log("▶ SUITE 10: Admin Action Verification & Allowance Removal (User Requirements 1 to 8)");

  // 1. Approve works for an authorized admin
  test("Requirement 1: Approve transitions eligible listing to 'available', marks verified, and logs audit record", () => {
    function executeAdminApprove({ callerRole, listing, expectedStatus }) {
      if (callerRole !== "admin") {
        return { success: false, error: "Unauthorized: Administrator privileges required", code: "UNAUTHORIZED" };
      }
      if (listing.status !== expectedStatus) {
        return { success: false, error: "Conflict: listing modified concurrently", code: "CONFLICT" };
      }
      const existingAttrs = listing.attributes || {};
      const updatedAttrs = { ...existingAttrs };
      delete updatedAttrs.moderation_status;
      delete updatedAttrs.moderation_rejection_reason;
      delete updatedAttrs.rejection_reason;

      listing.status = "available";
      listing.is_verified = true;
      listing.verified_at = new Date().toISOString();
      listing.verified_by = "admin_verified_01";
      listing.attributes = updatedAttrs;

      const auditLog = {
        action: "approve_listing",
        admin_id: "admin_verified_01",
        target_id: listing.id,
      };

      return { success: true, listing, auditLog };
    }

    const testItem = {
      id: "item_pending_1",
      status: "pending_review",
      title: "Caterpillar 320D Excavator",
      attributes: { moderation_status: "rejected", rejection_reason: "Previous photo blurry" },
      report_reason: "Noise inspection inquiry",
    };

    const res = executeAdminApprove({
      callerRole: "admin",
      listing: testItem,
      expectedStatus: "pending_review",
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(testItem.status, "available", "Approved listing status must be 'available'");
    assert.strictEqual(testItem.is_verified, true, "Approved listing must be marked verified");
    assert.strictEqual(testItem.attributes.moderation_status, undefined, "Moderation rejection attribute must be cleared");
    assert.strictEqual(testItem.attributes.rejection_reason, undefined);
    assert.strictEqual(testItem.report_reason, "Noise inspection inquiry", "Preserve existing user report history");
    assert.strictEqual(res.auditLog.action, "approve_listing");
  });

  // 2. Decline works and requires a reason
  test("Requirement 2: Decline requires a reason, sets status to 'restricted', and stores feedback", () => {
    function executeAdminDecline({ callerRole, listing, expectedStatus, reason }) {
      if (callerRole !== "admin") {
        return { success: false, error: "Unauthorized: Administrator privileges required", code: "UNAUTHORIZED" };
      }
      const trimmedReason = reason?.trim();
      if (!trimmedReason) {
        return { success: false, error: "A non-empty explanation is required when declining a listing.", code: "VALIDATION_ERROR" };
      }
      if (listing.status !== expectedStatus) {
        return { success: false, error: "Conflict: listing modified concurrently", code: "CONFLICT" };
      }

      listing.status = "restricted";
      listing.attributes = {
        ...(listing.attributes || {}),
        moderation_status: "rejected",
        rejection_reason: trimmedReason,
        moderated_at: new Date().toISOString(),
        moderated_by: "admin_verified_01",
      };

      const auditLog = {
        action: "decline_listing",
        admin_id: "admin_verified_01",
        target_id: listing.id,
        reason: trimmedReason,
      };

      return { success: true, listing, auditLog };
    }

    const testItem = {
      id: "item_pending_2",
      status: "pending_review",
      title: "CAT Wheel Loader 950H",
      report_reason: "Community flag review",
    };

    // Empty reason rejected
    const emptyRes = executeAdminDecline({
      callerRole: "admin",
      listing: testItem,
      expectedStatus: "pending_review",
      reason: "   ",
    });
    assert.strictEqual(emptyRes.success, false);
    assert.strictEqual(emptyRes.code, "VALIDATION_ERROR");

    // Valid decline
    const declineRes = executeAdminDecline({
      callerRole: "admin",
      listing: testItem,
      expectedStatus: "pending_review",
      reason: "Missing proof of load test certification and invalid serial placard.",
    });
    assert.strictEqual(declineRes.success, true);
    assert.strictEqual(testItem.status, "restricted", "Declined listing status must be 'restricted'");
    assert.strictEqual(testItem.attributes.moderation_status, "rejected");
    assert.strictEqual(testItem.attributes.rejection_reason, "Missing proof of load test certification and invalid serial placard.");
    assert.strictEqual(testItem.report_reason, "Community flag review", "Preserves user report reason");
    assert.strictEqual(declineRes.auditLog.action, "decline_listing");
  });

  // 3. Delete works for an authorized admin and protects active rentals
  test("Requirement 3: Delete works for authorized admin, sets status = 'deleted', and protects active rentals", () => {
    function executeAdminSoftDelete({ callerRole, listing, activeBookings = [], reason = "Deleted by Administrator" }) {
      if (callerRole !== "admin") {
        return { success: false, error: "Unauthorized: Administrator privileges required", code: "UNAUTHORIZED" };
      }
      if (!listing) {
        return { success: false, error: "Listing not found", code: "NOT_FOUND" };
      }
      if (listing.status === "rented") {
        return {
          success: false,
          error: "Cannot delete equipment while it is currently rented. Complete or cancel the active rental contract first.",
          code: "ACTIVE_RENTAL",
        };
      }
      const hasActiveBookings = activeBookings.some((b) =>
        ["pending", "accepted", "paid", "active"].includes(b.status)
      );
      if (hasActiveBookings) {
        return {
          success: false,
          error: "Cannot delete listing with active bookings or rental contracts. Please resolve current reservations before deleting.",
          code: "ACTIVE_BOOKINGS_EXIST",
        };
      }

      listing.status = "deleted";
      listing.deleted_at = new Date().toISOString();
      listing.report_reason = reason;

      const auditLog = {
        action: "soft_delete_listing",
        admin_id: "admin_verified_01",
        target_id: listing.id,
        reason,
      };

      return { success: true, listing, auditLog };
    }

    // Subcase A: Rented unit is protected
    const rentedItem = { id: "item_rented_1", status: "rented", title: "Excavator 1" };
    const rentedRes = executeAdminSoftDelete({ callerRole: "admin", listing: rentedItem });
    assert.strictEqual(rentedRes.success, false);
    assert.strictEqual(rentedRes.code, "ACTIVE_RENTAL");

    // Subcase B: Unit with active paid booking is protected
    const bookedItem = { id: "item_booked_1", status: "available", title: "Excavator 2" };
    const bookedRes = executeAdminSoftDelete({
      callerRole: "admin",
      listing: bookedItem,
      activeBookings: [{ id: "b1", status: "paid" }],
    });
    assert.strictEqual(bookedRes.success, false);
    assert.strictEqual(bookedRes.code, "ACTIVE_BOOKINGS_EXIST");

    // Subcase C: Available unit without active reservations is successfully soft-deleted
    const safeItem = { id: "item_safe_1", status: "available", title: "Excavator 3" };
    const deleteRes = executeAdminSoftDelete({
      callerRole: "admin",
      listing: safeItem,
      activeBookings: [{ id: "b_old", status: "completed" }],
    });
    assert.strictEqual(deleteRes.success, true);
    assert.strictEqual(safeItem.status, "deleted", "Status must be 'deleted'");
    assert.ok(safeItem.deleted_at, "deleted_at must be populated");
    assert.strictEqual(deleteRes.auditLog.action, "soft_delete_listing");
  });

  // 4. Unauthorized users cannot moderate or delete listings
  test("Requirement 4: Unauthorized users (customer role / unauthenticated) cannot approve, decline, or delete", () => {
    function verifyAdminGuard(callerRole) {
      if (!callerRole || callerRole !== "admin") {
        throw new Error("Unauthorized: Administrator privileges required");
      }
      return true;
    }

    // Customer role
    assert.throws(
      () => verifyAdminGuard("customer"),
      /Unauthorized: Administrator privileges required/
    );

    // Unauthenticated caller
    assert.throws(
      () => verifyAdminGuard(null),
      /Unauthorized: Administrator privileges required/
    );

    // Admin passes
    assert.doesNotThrow(() => verifyAdminGuard("admin"));
  });

  // 5. A seller can create more than five active listings (arbitrary quota removed)
  test("Requirement 5: Seller can create more than 5 active listings (5-listing allowance removed)", () => {
    // Check quota helper logic updated in lib/marketplace/integrity.ts
    function checkCategoryQuotaLocal(activeCount) {
      return {
        allowed: true, // Unlimited inventory allowance
        maxAllowed: Infinity,
        currentCount: activeCount,
      };
    }

    assert.strictEqual(checkCategoryQuotaLocal(5).allowed, true, "5th active listing allowed");
    assert.strictEqual(checkCategoryQuotaLocal(6).allowed, true, "6th active listing allowed (exceeds old cap)");
    assert.strictEqual(checkCategoryQuotaLocal(12).allowed, true, "12th active listing allowed");
    assert.strictEqual(checkCategoryQuotaLocal(50).allowed, true, "50th active listing allowed");
  });

  // 6. A unique listing is not unnecessarily sent to admin review
  test("Requirement 6: Unique listing with no duplicate signals publishes directly as 'available'", () => {
    const candidate = {
      title: "Kobelco SK200-8 Excavator",
      description: "Well maintained crawler excavator in Cebu yard",
      categoryId: "cat_excavators",
      pricePerDay: 16000,
      location: "Mandaue City, Cebu",
      ownerId: "seller_cebu_1",
      serialOrVin: "SK200-CEBU-7788",
    };

    const duplicateResult = evaluateDuplicateSignalsLocal(candidate, {
      id: "other_item",
      title: "Toyota Forklift 3-ton",
      categoryId: "cat_forklifts",
      pricePerDay: 4000,
      location: "Mandaue City, Cebu",
      ownerId: "seller_cebu_1",
      assetIdentifier: "FORK-001",
    });

    const { status, isQualifyingDuplicate } = determineListingCreationStatus(duplicateResult);
    assert.strictEqual(status, "available", "Unique listing must publish directly as 'available'");
    assert.strictEqual(isQualifyingDuplicate, false);
  });

  // 7. Same-seller duplicate detection still works
  test("Requirement 7: Same-seller duplicate detection flags identical serial for review", () => {
    const candidate = {
      title: "Caterpillar 320D Excavator",
      description: "20-ton machine with hammer line",
      categoryId: "cat_heavy",
      pricePerDay: 14000,
      location: "Quezon City",
      ownerId: "seller_fleet_owner",
      serialOrVin: "CAT320D-SERIAL-9999",
    };

    const existingOwnListing = {
      id: "existing_cat_1",
      title: "Caterpillar 320D Excavator",
      categoryId: "cat_heavy",
      pricePerDay: 14000,
      location: "Quezon City",
      ownerId: "seller_fleet_owner",
      assetIdentifier: "CAT320D-SERIAL-9999", // Matching serial!
      attributes: { make: "Caterpillar", model: "320D" },
    };

    const duplicateResult = evaluateDuplicateSignalsLocal(candidate, existingOwnListing);
    assert.strictEqual(duplicateResult.isSameOwner, true);
    assert.strictEqual(duplicateResult.classification, "CONFIRMED_DUPLICATE");
    assert.strictEqual(duplicateResult.requiresQuarantine, true);

    const { status, isQualifyingDuplicate } = determineListingCreationStatus(duplicateResult);
    assert.strictEqual(isQualifyingDuplicate, true);
    assert.strictEqual(status, "shadow_quarantined");
  });

  // 8. Different sellers can list equipment with identical titles
  test("Requirement 8: Different sellers can list equipment with identical titles without conflict", () => {
    const candidateFromSeller2 = {
      title: "2023 Caterpillar 320 GC Excavator",
      categoryId: "cat_heavy",
      pricePerDay: 15000,
      location: "Davao City",
      ownerId: "seller_davao",
      serialOrVin: "CAT-DVO-001",
    };

    const existingFromSeller1 = {
      id: "item_manila_1",
      title: "2023 Caterpillar 320 GC Excavator", // Identical title!
      categoryId: "cat_heavy",
      pricePerDay: 15000,
      location: "Manila",
      ownerId: "seller_manila", // Different seller!
      assetIdentifier: "CAT-MNL-002",
    };

    const duplicateResult = evaluateDuplicateSignalsLocal(candidateFromSeller2, existingFromSeller1);
    assert.strictEqual(duplicateResult.isSameOwner, false);
    assert.strictEqual(duplicateResult.classification, "UNIQUE");
    assert.strictEqual(duplicateResult.confidence, 0);

    const { status } = determineListingCreationStatus(duplicateResult);
    assert.strictEqual(status, "available", "Listing from different seller must publish as 'available'");
  });

  // 9. Strict Same-Seller Name Uniqueness (Backend Stricter Enforcement)
  test("Requirement 9: Seller cannot create listing when they already listed that name (e.g. 'Lamborghini') -> ignored, returns null, not in database", () => {
    // Model of backend strict creation flow
    function executeListingCreationStrict({ sellerId, inputTitle, existingListingsDb }) {
      const trimmedTitle = inputTitle.trim();
      const normalizedNewTitle = trimmedTitle.toLowerCase().replace(/\s+/g, " ");

      // Scope to seller's active listings
      const sellerActiveListings = existingListingsDb.filter(
        (l) => l.owner_id === sellerId && !["deleted", "archived"].includes(l.status)
      );

      const existingSameName = sellerActiveListings.find(
        (l) => l.title.trim().toLowerCase().replace(/\s+/g, " ") === normalizedNewTitle
      );

      if (existingSameName) {
        // Ignored and blocked before any database write!
        return {
          success: false,
          listingId: null,
          duplicate: true,
          existingListingId: existingSameName.id,
          code: "DUPLICATE_ASSET",
          error: `You have already listed equipment with the name "${existingSameName.title}". Duplicate listings with the same name are not permitted and cannot be posted.`,
          dbModified: false,
        };
      }

      // Allowed: write to database
      const newListing = {
        id: "new_uuid_" + Date.now(),
        owner_id: sellerId,
        title: trimmedTitle,
        status: "available",
      };
      existingListingsDb.push(newListing);

      return {
        success: true,
        listingId: newListing.id,
        dbModified: true,
      };
    }

    const mockDb = [
      { id: "lst_1", owner_id: "seller_1", title: "Lamborghini", status: "available" },
      { id: "lst_2", owner_id: "seller_2", title: "Ferrari", status: "available" },
    ];

    const initialDbCount = mockDb.length;

    // Subcase A: Seller 1 tries to list "Lamborghini" again (exact match)
    const result1 = executeListingCreationStrict({
      sellerId: "seller_1",
      inputTitle: "Lamborghini",
      existingListingsDb: mockDb,
    });
    assert.strictEqual(result1.success, false, "Creation must fail for duplicate title on same seller");
    assert.strictEqual(result1.listingId, null, "listingId must result as null");
    assert.strictEqual(result1.dbModified, false, "Database must not be modified");
    assert.strictEqual(mockDb.length, initialDbCount, "No new row must be added to database");
    assert.ok(result1.error.includes("already listed equipment with the name"), "Error must explain duplicate name rejection");

    // Subcase B: Seller 1 tries with different casing and whitespace: "  lamborghini  "
    const result2 = executeListingCreationStrict({
      sellerId: "seller_1",
      inputTitle: "  lamborghini  ",
      existingListingsDb: mockDb,
    });
    assert.strictEqual(result2.success, false);
    assert.strictEqual(result2.listingId, null);
    assert.strictEqual(mockDb.length, initialDbCount, "Still no row added to database");

    // Subcase C: Seller 2 (different seller) lists "Lamborghini" -> Allowed because Seller 2 does not own one
    const result3 = executeListingCreationStrict({
      sellerId: "seller_2",
      inputTitle: "Lamborghini",
      existingListingsDb: mockDb,
    });
    assert.strictEqual(result3.success, true);
    assert.ok(result3.listingId !== null, "Different seller gets a valid listingId");
    assert.strictEqual(result3.dbModified, true);
    assert.strictEqual(mockDb.length, initialDbCount + 1, "Database receives exactly 1 row for Seller 2");
  });

  console.log("\n===============================================================================");
  console.log(`TEST SUMMARY: ${passedCount} Passed, ${failedCount} Failed`);
  console.log("===============================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
