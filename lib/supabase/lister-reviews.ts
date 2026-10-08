import "server-only";
import { createSupabaseServerClient } from "./server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export interface PublicListerProfile {
  clerk_user_id: string;
  name: string;
  avatar_url: string | null;
  role: string;
  member_since: string;
}

export interface ListerReviewSummary {
  average_rating: number;
  total_reviews: number;
  rating_distribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}

export interface ListerReviewWithReviewer {
  id: string;
  reviewer_id: string;
  lister_id: string;
  booking_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: {
    name: string;
    avatar_url: string | null;
  };
}

function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key);
}

/**
 * Fetches public profile details for a given lister.
 * Strictly excludes private fields (email, phone, private metadata).
 */
export async function getPublicListerProfile(
  listerId: string
): Promise<PublicListerProfile | null> {
  try {
    const supabase = getPublicClient() || (await createSupabaseServerClient());
    const { data, error } = await supabase
      .from("profiles")
      .select("clerk_user_id, first_name, last_name, avatar_url, role, created_at")
      .eq("clerk_user_id", listerId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
    return {
      clerk_user_id: data.clerk_user_id,
      name: fullName || "Equipment Host",
      avatar_url: data.avatar_url,
      role: data.role,
      member_since: data.created_at,
    };
  } catch (err) {
    console.error("[getPublicListerProfile] Error:", err);
    return null;
  }
}

/**
 * Computes average rating, total review count, and 1-5 star distribution
 * directly from real database records.
 */
export async function getListerRatingSummary(
  listerId: string
): Promise<ListerReviewSummary> {
  const summary: ListerReviewSummary = {
    average_rating: 0,
    total_reviews: 0,
    rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  };

  try {
    const supabase = getPublicClient() || (await createSupabaseServerClient());
    const { data, error } = await supabase
      .from("lister_reviews")
      .select("rating")
      .eq("lister_id", listerId);

    if (error || !data || data.length === 0) {
      return summary;
    }

    summary.total_reviews = data.length;
    let sum = 0;

    for (const rev of data) {
      sum += rev.rating;
      if (rev.rating in summary.rating_distribution) {
        summary.rating_distribution[rev.rating as 1 | 2 | 3 | 4 | 5]++;
      }
    }

    summary.average_rating = Number((sum / data.length).toFixed(1));
    return summary;
  } catch (err) {
    console.error("[getListerRatingSummary] Error:", err);
    return summary;
  }
}

/**
 * Fetches recent reviews for a lister with joined public reviewer profile information.
 */
export async function getListerReviews(
  listerId: string,
  limit = 20
): Promise<ListerReviewWithReviewer[]> {
  try {
    const supabase = getPublicClient() || (await createSupabaseServerClient());
    const { data: reviewsData, error } = await supabase
      .from("lister_reviews")
      .select("id, reviewer_id, lister_id, booking_id, rating, comment, created_at")
      .eq("lister_id", listerId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !reviewsData || reviewsData.length === 0) {
      return [];
    }

    // Resolve reviewer profiles
    const reviewerIds = Array.from(new Set(reviewsData.map((r) => r.reviewer_id)));
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("clerk_user_id, first_name, last_name, avatar_url")
      .in("clerk_user_id", reviewerIds);

    const profileMap = new Map<string, { name: string; avatar_url: string | null }>();
    if (profilesData) {
      for (const p of profilesData) {
        const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Verified Renter";
        profileMap.set(p.clerk_user_id, {
          name,
          avatar_url: p.avatar_url,
        });
      }
    }

    return reviewsData.map((r) => ({
      ...r,
      reviewer: profileMap.get(r.reviewer_id) || {
        name: "Verified Renter",
        avatar_url: null,
      },
    }));
  } catch (err) {
    console.error("[getListerReviews] Error:", err);
    return [];
  }
}

/**
 * Fetches public listings owned by this lister.
 */
export async function getPublicListingsByOwner(ownerId: string) {
  try {
    const supabase = getPublicClient() || (await createSupabaseServerClient());
    const { data, error } = await supabase
      .from("listings")
      .select(`
        *,
        category:categories(*),
        listing_images(*)
      `)
      .eq("owner_id", ownerId)
      .eq("status", "available")
      .order("created_at", { ascending: false });

    if (error || !data) {
      return [];
    }
    return data;
  } catch (err) {
    console.error("[getPublicListingsByOwner] Error:", err);
    return [];
  }
}

/**
 * Checks whether a booking has already been reviewed by the reviewer.
 */
export async function hasBookingBeenReviewed(bookingId: string, reviewerId: string): Promise<boolean> {
  try {
    const supabase = getPublicClient() || (await createSupabaseServerClient());
    const { data, error } = await supabase
      .from("lister_reviews")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("reviewer_id", reviewerId)
      .maybeSingle();

    if (error || !data) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
