/**
 * scripts/diagnose-duplicates.cjs
 *
 * Rent It - Marketplace Integrity Diagnostic Tool
 * Identifies suspected duplicate listings across the catalog without altering database records.
 *
 * Usage:
 *   node scripts/diagnose-duplicates.cjs
 */

const { createClient } = require("@supabase/supabase-js");

// Sample offline fallback inventory including known adwa collision pattern
const SAMPLE_INVENTORY = [
  {
    id: "lst-adwa-01",
    owner_id: "user_adwa_owner",
    title: "adwa",
    description: "Meetup in Taguig. Good condition.",
    price_per_day: 1500,
    category_id: "cat_equipment",
    status: "available",
    images: ["https://images.unsplash.com/photo-cartoon-crane.jpg"],
    attributes: {
      make: "Universal",
      model: "Standard",
      image_hashes: ["b7f8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8"]
    }
  },
  {
    id: "lst-adwa-02",
    owner_id: "user_adwa_owner",
    title: "adwa",
    description: "Direct pickup at Makati warehouse. Negotiable weekly rates.",
    price_per_day: 1800,
    category_id: "cat_equipment",
    status: "available",
    images: ["https://images.unsplash.com/photo-cartoon-crane.jpg"],
    attributes: {
      make: "Universal",
      model: "Standard",
      image_hashes: ["b7f8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8"]
    }
  },
  {
    id: "lst-excavator-cat-320",
    owner_id: "user_contractor_alpha",
    title: "CAT 320 Hydraulic Excavator",
    description: "20-ton tracked excavator for commercial excavation.",
    price_per_day: 15000,
    category_id: "cat_heavy_machinery",
    status: "available",
    asset_identifier: "CAT320-X98214",
    images: ["https://images.unsplash.com/photo-cat-320.jpg"],
    attributes: { make: "Caterpillar", model: "320" }
  },
  {
    id: "lst-stock-roller-01",
    owner_id: "user_seller_a",
    title: "Dynapac Road Roller 10-Ton",
    description: "Road compaction equipment.",
    price_per_day: 8000,
    category_id: "cat_heavy_machinery",
    status: "available",
    images: ["https://images.unsplash.com/dynapac-stock-photo.jpg"],
    attributes: { make: "Dynapac", model: "CA250" }
  },
  {
    id: "lst-stock-roller-02",
    owner_id: "user_seller_b",
    title: "Dynapac Single Drum Compactor",
    description: "Heavy road works compactor in pristine shape.",
    price_per_day: 8500,
    category_id: "cat_heavy_machinery",
    status: "available",
    images: ["https://images.unsplash.com/dynapac-stock-photo.jpg"], // Unrelated seller using stock photo
    attributes: { make: "Dynapac", model: "CA300" }
  }
];

function diagnoseDuplicates(items) {
  const duplicates = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];

      const isSameOwner = a.owner_id === b.owner_id;
      const isSameCategory = a.category_id === b.category_id;
      const titleMatch = (a.title || "").trim().toLowerCase() === (b.title || "").trim().toLowerCase();

      // Check image references
      const imgsA = new Set(a.images || []);
      const sharedImages = (b.images || []).filter((img) => imgsA.has(img));

      // Check image content hashes
      const hashesA = new Set((a.attributes && a.attributes.image_hashes) || []);
      const sharedHashes = ((b.attributes && b.attributes.image_hashes) || []).filter((h) => hashesA.has(h));

      const hasExactImageMatch = sharedImages.length > 0 || sharedHashes.length > 0;

      // Check VIN / serial
      const vinA = a.asset_identifier ? a.asset_identifier.toLowerCase().replace(/[^a-z0-9]/gi, "") : null;
      const vinB = b.asset_identifier ? b.asset_identifier.toLowerCase().replace(/[^a-z0-9]/gi, "") : null;
      const vinMatch = Boolean(vinA && vinB && vinA === vinB);

      let score = 0;
      const reasons = [];

      if (vinMatch) {
        score += 0.85;
        reasons.push("Identical physical VIN / serial number");
      }

      if (hasExactImageMatch) {
        if (isSameOwner) {
          score += 0.85;
          reasons.push("Same owner uploaded identical image content / URL");
        } else {
          score += 0.35;
          reasons.push("Shared image reference across different accounts (potential stock photo)");
        }
      }

      if (isSameCategory && titleMatch) {
        score += isSameOwner ? 0.45 : 0.25;
        reasons.push("Identical title in the same category");
      }

      const confidence = Math.min(1.0, Number(score.toFixed(2)));

      if (confidence >= 0.5) {
        duplicates.push({
          listingA: { id: a.id, title: a.title, ownerId: a.owner_id, status: a.status },
          listingB: { id: b.id, title: b.title, ownerId: b.owner_id, status: b.status },
          isSameOwner,
          confidence,
          classification: confidence >= 0.85 || (isSameOwner && confidence >= 0.70)
            ? "CONFIRMED_DUPLICATE"
            : "SUSPECTED_DUPLICATE",
          evidence: reasons
        });
      }
    }
  }

  return duplicates;
}

async function run() {
  console.log("===============================================================================");
  console.log("RENT IT — DUPLICATE EQUIPMENT DIAGNOSTIC AUDIT REPORT");
  console.log("===============================================================================");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_KEY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

  let listings = SAMPLE_INVENTORY;

  if (supabaseUrl && serviceKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data, error } = await supabase
        .from("listings")
        .select("id, title, description, price_per_day, category_id, owner_id, status, images, attributes, asset_identifier")
        .not("status", "in", '("deleted","archived")');

      if (!error && data && data.length > 0) {
        listings = data;
        console.log(`[Diagnostic] Retrieved ${data.length} active database records from Supabase.`);
      } else {
        console.log("[Diagnostic] Using sample inventory for simulation.");
      }
    } catch {
      console.log("[Diagnostic] Offline mode: Evaluating baseline inventory.");
    }
  } else {
    console.log("[Diagnostic] Environment variables absent: Running offline catalog analysis.");
  }

  const results = diagnoseDuplicates(listings);

  console.log(`\nScan Complete: Found ${results.length} suspected or confirmed duplicate cluster(s).\n`);

  results.forEach((dup, idx) => {
    console.log(`--- Duplicate Cluster #${idx + 1} [${dup.classification}] (Confidence: ${(dup.confidence * 100).toFixed(0)}%) ---`);
    console.log(`  Listing A : "${dup.listingA.title}" (ID: ${dup.listingA.id}, Owner: ${dup.listingA.ownerId}, Status: ${dup.listingA.status})`);
    console.log(`  Listing B : "${dup.listingB.title}" (ID: ${dup.listingB.id}, Owner: ${dup.listingB.ownerId}, Status: ${dup.listingB.status})`);
    console.log(`  Same Owner: ${dup.isSameOwner ? "YES (Collision by same seller)" : "NO (Cross-seller image/spec match)"}`);
    console.log(`  Evidence  : ${dup.evidence.join("; ")}`);
    if (dup.classification === "CONFIRMED_DUPLICATE" && dup.isSameOwner) {
      console.log(`  Action    : Recommend owner consolidation (edit existing ${dup.listingA.id} rather than dual publication).`);
    } else {
      console.log(`  Action    : Route to operations integrity queue for review.`);
    }
    console.log("");
  });

  console.log("===============================================================================");
  console.log("Integrity Notice: No listings were deleted or altered by this diagnostic scan.");
  console.log("===============================================================================\n");
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { diagnoseDuplicates, SAMPLE_INVENTORY };
