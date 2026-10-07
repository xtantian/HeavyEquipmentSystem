import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";
import type { Database, CategoryRow } from "./types";
import { MARKETPLACE_CATEGORIES } from "@/lib/marketplace/categories";
import { MOCK_LISTINGS, MOCK_BOOKINGS, type MarketplaceListingItem } from "@/lib/marketplace/mock-listings";

function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key);
}

export async function getMarketplaceCategories(): Promise<CategoryRow[]> {
  try {
    const supabase = getPublicClient() || (await createSupabaseServerClient());
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("name", { ascending: true });

    console.log("[select categories]", { count: data?.length, error });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.error("[supabase/marketplace] Error fetching categories:", err);
  }

  // Graceful fallback to default categories schema
  return MARKETPLACE_CATEGORIES.map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    icon: cat.iconName,
    description: cat.description,
    attribute_schema: cat.attributeSchema as unknown as CategoryRow["attribute_schema"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

export const RESERVATION_BLOCKING_STATUSES = [
  "pending",
  "accepted",
  "paid",
  "active",
] as const;

export type ReservationBlockingStatus = (typeof RESERVATION_BLOCKING_STATUSES)[number];

export interface ListingsQueryOptions {
  category?: string;
  q?: string;
  start?: string;
  end?: string;
  min?: string | number;
  max?: string | number;
}

export async function getMarketplaceListings(
  options: ListingsQueryOptions = {}
): Promise<MarketplaceListingItem[]> {
  const { category, q, start, end, min, max } = options;

  try {
    const supabase = getPublicClient() || (await createSupabaseServerClient());

    // 1. Identify category ID if category slug provided
    let categoryId: string | null = null;
    if (category && category !== "all") {
      const { data: catData } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", category)
        .maybeSingle();

      if (catData) {
        categoryId = catData.id;
      }
    }

    // 2. Identify booked listings in the requested date range
    let bookedListingIds: string[] = [];
    if (start || end) {
      let bookingsQuery = supabase
        .from("bookings")
        .select("listing_id")
        .in("status", [...RESERVATION_BLOCKING_STATUSES]);

      if (start && end) {
        bookingsQuery = bookingsQuery.lte("start_date", end).gte("end_date", start);
      } else if (start) {
        bookingsQuery = bookingsQuery.gte("end_date", start);
      } else if (end) {
        bookingsQuery = bookingsQuery.lte("start_date", end);
      }

      const { data: bookingsData } = await bookingsQuery;
      if (bookingsData && bookingsData.length > 0) {
        bookedListingIds = bookingsData.map((b) => b.listing_id);
      }
    }

    // 3. Query listings with relations (including available and newly submitted pending_review)
    let query = supabase
      .from("listings")
      .select(`
        *,
        category:categories(*),
        listing_images(*)
      `)
      .in("status", ["available", "pending_review"]);

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    if (q && q.trim().length > 0) {
      const term = `%${q.trim()}%`;
      query = query.or(`title.ilike.${term},description.ilike.${term},location.ilike.${term}`);
    }

    if (min !== undefined && min !== null && min !== "") {
      const minVal = Number(min);
      if (!isNaN(minVal)) {
        query = query.gte("price_per_day", minVal);
      }
    }

    if (max !== undefined && max !== null && max !== "") {
      const maxVal = Number(max);
      if (!isNaN(maxVal)) {
        query = query.lte("price_per_day", maxVal);
      }
    }

    if (bookedListingIds.length > 0) {
      query = query.not("id", "in", `(${bookedListingIds.join(",")})`);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    console.log("[select listings]", { data, error });

    if (!error && data && data.length > 0) {
      return data as unknown as MarketplaceListingItem[];
    }
  } catch (err) {
    console.error("[supabase/marketplace] Error fetching listings:", err);
  }

  // Graceful fallback to mock listings
  return filterMockListings(options);
}

export async function getAllListingsForAdmin(): Promise<MarketplaceListingItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("listings")
      .select(`
        *,
        category:categories(*),
        listing_images(*)
      `)
      .order("created_at", { ascending: false });

    if (!error && data) {
      return data as unknown as MarketplaceListingItem[];
    }
    if (error) {
      console.error("[supabase/marketplace] Database error fetching admin listings:", error.message);
    }
  } catch (err) {
    console.error("[supabase/marketplace] Error fetching all listings for admin:", err);
  }

  return [];
}

export async function getMarketplaceListingById(
  id: string
): Promise<MarketplaceListingItem | null> {
  try {
    const supabase = getPublicClient() || (await createSupabaseServerClient());
    const { data, error } = await supabase
      .from("listings")
      .select(`
        *,
        category:categories(*),
        listing_images(*)
      `)
      .eq("id", id)
      .maybeSingle();

    if (!error && data) {
      return data as unknown as MarketplaceListingItem;
    }
  } catch (err) {
    console.error(`[supabase/marketplace] Error fetching listing ${id}:`, err);
  }

  const fallback = MOCK_LISTINGS.find((item) => item.id === id);
  return fallback || null;
}

function filterMockListings(options: ListingsQueryOptions): MarketplaceListingItem[] {
  let results = [...MOCK_LISTINGS];

  if (options.category && options.category !== "all") {
    results = results.filter((item) => item.category?.slug === options.category);
  }

  if (options.q && options.q.trim().length > 0) {
    const term = options.q.trim().toLowerCase();
    results = results.filter(
      (item) =>
        item.title.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.location.toLowerCase().includes(term)
    );
  }

  if (options.min !== undefined && options.min !== null && options.min !== "") {
    const minVal = Number(options.min);
    if (!isNaN(minVal)) {
      results = results.filter((item) => item.price_per_day >= minVal);
    }
  }

  if (options.max !== undefined && options.max !== null && options.max !== "") {
    const maxVal = Number(options.max);
    if (!isNaN(maxVal)) {
      results = results.filter((item) => item.price_per_day <= maxVal);
    }
  }

  return results;
}

export interface ListingBookedRange {
  start_date: string;
  end_date: string;
  status: string;
}

export async function getBookedRangesForListing(
  listingId: string
): Promise<ListingBookedRange[]> {
  try {
    const supabase = getPublicClient() || (await createSupabaseServerClient());
    const { data, error } = await supabase
      .from("bookings")
      .select("start_date, end_date, status")
      .eq("listing_id", listingId)
      .in("status", [...RESERVATION_BLOCKING_STATUSES]);

    if (!error && data) {
      return data;
    }
    if (error) {
      console.warn(`[supabase/marketplace] Error fetching bookings for ${listingId}:`, error.message);
    }
  } catch (err) {
    console.warn(`[supabase/marketplace] Error fetching bookings for ${listingId}:`, err);
  }

  // Only check mock bookings for static demo listings if database is unreachable
  if (listingId.startsWith("lst-")) {
    return MOCK_BOOKINGS
      .filter(
        (b) =>
          b.listing_id === listingId &&
          (RESERVATION_BLOCKING_STATUSES as readonly string[]).includes(b.status)
      )
      .map((b) => ({
        start_date: b.start_date,
        end_date: b.end_date,
        status: b.status,
      }));
  }

  return [];
}

export interface DashboardBookingItem {
  id: string;
  listing_id: string;
  renter_id: string;
  start_date: string;
  end_date: string;
  total_price: number;
  status: "pending" | "accepted" | "paid" | "active" | "returned" | "completed" | "cancelled";
  created_at: string;
  listing?: MarketplaceListingItem | null;
}

export async function getUserRentals(userId: string): Promise<DashboardBookingItem[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("bookings")
      .select(`
        *,
        listing:listings(
          *,
          category:categories(*),
          listing_images(*)
        )
      `)
      .eq("renter_id", userId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      return data as unknown as DashboardBookingItem[];
    }
    if (error) {
      console.warn("[supabase] Error fetching user rentals:", error.message);
    }
  } catch (err) {
    console.warn("[supabase] Exception fetching user rentals:", err);
  }

  return [];
}

export async function getUserListingsAndIncoming(userId: string): Promise<{
  listings: MarketplaceListingItem[];
  incomingBookings: DashboardBookingItem[];
}> {
  let listings: MarketplaceListingItem[] = [];
  let incomingBookings: DashboardBookingItem[] = [];

  try {
    const supabase = await createSupabaseServerClient();

    // 1. Fetch user's listings (excluding soft-deleted)
    const { data: listData, error: listError } = await supabase
      .from("listings")
      .select(`
        *,
        category:categories(*),
        listing_images(*)
      `)
      .eq("owner_id", userId)
      .neq("status", "deleted")
      .order("created_at", { ascending: false });

    if (!listError && listData) {
      listings = listData as unknown as MarketplaceListingItem[];
    } else if (listError) {
      console.warn("[supabase] Error fetching user listings:", listError.message);
    }

    // 2. Fetch incoming bookings for these listings
    if (listings.length > 0) {
      const listingIds = listings.map((l) => l.id);
      const { data: bkData, error: bkError } = await supabase
        .from("bookings")
        .select(`
          *,
          listing:listings(
            *,
            category:categories(*),
            listing_images(*)
          )
        `)
        .in("listing_id", listingIds)
        .order("created_at", { ascending: false });

      if (!bkError && bkData) {
        incomingBookings = bkData as unknown as DashboardBookingItem[];
      } else if (bkError) {
        console.warn("[supabase] Error fetching incoming bookings:", bkError.message);
      }
    }
  } catch (err) {
    console.warn("[supabase] Error fetching user listings and incoming bookings:", err);
  }

  return { listings, incomingBookings };
}
