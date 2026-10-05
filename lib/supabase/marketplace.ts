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

export interface ListingsQueryOptions {
  category?: string;
  q?: string;
  start?: string;
  end?: string;
}

export async function getMarketplaceListings(
  options: ListingsQueryOptions = {}
): Promise<MarketplaceListingItem[]> {
  const { category, q, start, end } = options;

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
        .in("status", ["accepted", "paid", "active"]);

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

    // 3. Query listings with relations
    let query = supabase
      .from("listings")
      .select(`
        *,
        category:categories(*),
        listing_images(*)
      `)
      .eq("status", "available");

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    if (q && q.trim().length > 0) {
      query = query.ilike("title", `%${q.trim()}%`);
    }

    if (bookedListingIds.length > 0) {
      query = query.not("id", "in", `(${bookedListingIds.join(",")})`);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      return data as unknown as MarketplaceListingItem[];
    }
  } catch (err) {
    console.error("[supabase/marketplace] Error fetching listings:", err);
  }

  // Graceful fallback to mock listings
  return filterMockListings(options);
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
      .in("status", ["accepted", "paid", "active"]);

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn(`[supabase/marketplace] Error fetching bookings for ${listingId}:`, err);
  }

  return MOCK_BOOKINGS
    .filter(
      (b) => b.listing_id === listingId && ["accepted", "paid", "active"].includes(b.status)
    )
    .map((b) => ({
      start_date: b.start_date,
      end_date: b.end_date,
      status: b.status,
    }));
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
    const supabase = getPublicClient() || (await createSupabaseServerClient());
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

    if (!error && data && data.length > 0) {
      return data as unknown as DashboardBookingItem[];
    }
  } catch (err) {
    console.warn("[supabase] Error fetching user rentals:", err);
  }

  // Check MOCK_BOOKINGS for this user
  const userBookings = MOCK_BOOKINGS.filter((b) => b.renter_id === userId);
  if (userBookings.length > 0) {
    return userBookings.map((b) => ({
      ...b,
      listing: MOCK_LISTINGS.find((l) => l.id === b.listing_id) || null,
    }));
  }

  // Sample initial rentals for demonstration
  return [
    {
      id: "demo-bk-1",
      listing_id: "lst-car-tesla-3",
      renter_id: userId,
      start_date: "2026-10-12",
      end_date: "2026-10-16",
      total_price: 340,
      status: "pending" as const,
      created_at: new Date().toISOString(),
      listing: MOCK_LISTINGS.find((l) => l.id === "lst-car-tesla-3") || null,
    },
    {
      id: "demo-bk-2",
      listing_id: "lst-cam-sony-fx3",
      renter_id: userId,
      start_date: "2026-10-20",
      end_date: "2026-10-23",
      total_price: 420,
      status: "accepted" as const,
      created_at: new Date().toISOString(),
      listing: MOCK_LISTINGS.find((l) => l.id === "lst-cam-sony-fx3") || null,
    },
  ];
}

export async function getUserListingsAndIncoming(userId: string): Promise<{
  listings: MarketplaceListingItem[];
  incomingBookings: DashboardBookingItem[];
}> {
  let listings: MarketplaceListingItem[] = [];
  let incomingBookings: DashboardBookingItem[] = [];

  try {
    const supabase = getPublicClient() || (await createSupabaseServerClient());

    // 1. Fetch user's listings
    const { data: listData, error: listError } = await supabase
      .from("listings")
      .select(`
        *,
        category:categories(*),
        listing_images(*)
      `)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    if (!listError && listData) {
      listings = listData as unknown as MarketplaceListingItem[];
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
      }
    }
  } catch (err) {
    console.warn("[supabase] Error fetching user listings and incoming bookings:", err);
  }

  // Fallback for listings
  if (listings.length === 0) {
    const userMockListings = MOCK_LISTINGS.filter((l) => l.owner_id === userId);
    if (userMockListings.length > 0) {
      listings = userMockListings;
    } else {
      listings = [MOCK_LISTINGS[0], MOCK_LISTINGS[2]];
    }
  }

  // Fallback for incoming bookings
  if (incomingBookings.length === 0) {
    const listingIds = new Set(listings.map((l) => l.id));
    const matched = MOCK_BOOKINGS.filter((b) => listingIds.has(b.listing_id));
    if (matched.length > 0) {
      incomingBookings = matched.map((b) => ({
        ...b,
        listing: listings.find((l) => l.id === b.listing_id) || null,
      }));
    } else {
      incomingBookings = [
        {
          id: "demo-incoming-1",
          listing_id: listings[0]?.id || "lst-car-tesla-3",
          renter_id: "user_client_4492",
          start_date: "2026-10-18",
          end_date: "2026-10-22",
          total_price: 340,
          status: "pending" as const,
          created_at: new Date().toISOString(),
          listing: listings[0] || null,
        },
      ];
    }
  }

  return { listings, incomingBookings };
}
