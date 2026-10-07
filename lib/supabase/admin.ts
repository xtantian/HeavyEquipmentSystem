import "server-only";

import { createSupabaseServiceClient, createSupabaseServerClient } from "./server";
import type { UserAccountStatus, UserRole } from "./types";
import type { MarketplaceListingItem } from "@/lib/marketplace/mock-listings";

export interface AdminOverviewStats {
  totalRegisteredUsers: number;
  activeUsers: number;
  currentlyActiveUsers: number;
  totalUsersUsedRental: number;
  totalActiveRentals: number;
  totalEquipmentListings: number;
  totalReportedListings: number;
  listingsByStatus: {
    available: number;
    rented: number;
    maintenance: number;
    restricted: number;
    pending_review: number;
    deleted: number;
  };
  rentalsByStatus: {
    active: number;
    paid: number;
    pending: number;
    completed: number;
    cancelled: number;
  };
  usersByStatus: {
    active: number;
    restricted: number;
    banned: number;
    deleted: number;
  };
}

export interface AdminUserItem {
  id: string;
  clerk_user_id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserAccountStatus;
  avatar_url: string | null;
  created_at: string;
  rentalCount: number;
  listingCount: number;
}

export interface AdminReportItem {
  id: string;
  listing_id: string;
  listing_title: string;
  reporter_id: string;
  reporter_email: string | null;
  reason: string;
  details: string | null;
  status: "pending" | "reviewed" | "dismissed" | "action_taken";
  created_at: string;
}

export interface AdminAuditLogItem {
  id: string;
  admin_id: string;
  admin_email: string | null;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

/**
 * Resolves an administrative Supabase client.
 * Prefers the elevated service-role client; falls back to the authenticated admin server client.
 */
async function getAdminSupabaseClient() {
  try {
    return createSupabaseServiceClient();
  } catch {
    return await createSupabaseServerClient();
  }
}

/**
 * Retrieve comprehensive overview statistics strictly from the database.
 * No fabricated statistics or artificial minimums.
 */
export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const stats: AdminOverviewStats = {
    totalRegisteredUsers: 0,
    activeUsers: 0,
    currentlyActiveUsers: 0,
    totalUsersUsedRental: 0,
    totalActiveRentals: 0,
    totalEquipmentListings: 0,
    totalReportedListings: 0,
    listingsByStatus: {
      available: 0,
      rented: 0,
      maintenance: 0,
      restricted: 0,
      pending_review: 0,
      deleted: 0,
    },
    rentalsByStatus: {
      active: 0,
      paid: 0,
      pending: 0,
      completed: 0,
      cancelled: 0,
    },
    usersByStatus: {
      active: 0,
      restricted: 0,
      banned: 0,
      deleted: 0,
    },
  };

  try {
    const supabase = await getAdminSupabaseClient();

    // 1. Users / Profiles statistics
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, clerk_user_id, status, updated_at");

    if (!profilesError && profilesData) {
      stats.totalRegisteredUsers = profilesData.length;
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      for (const p of profilesData) {
        const pStatus = (p.status as UserAccountStatus) || "active";
        if (pStatus === "active") stats.activeUsers++;
        if (stats.usersByStatus[pStatus] !== undefined) {
          stats.usersByStatus[pStatus]++;
        }
        if (p.updated_at && p.updated_at >= oneDayAgo) {
          stats.currentlyActiveUsers++;
        }
      }
    }

    // 2. Listings statistics
    const { data: listingsData, error: listingsError } = await supabase
      .from("listings")
      .select("id, status, is_reported");

    if (!listingsError && listingsData) {
      for (const item of listingsData) {
        const s = item.status as keyof typeof stats.listingsByStatus;
        if (item.status !== "deleted") {
          stats.totalEquipmentListings++;
        }
        if (stats.listingsByStatus[s] !== undefined) {
          stats.listingsByStatus[s]++;
        }
        if (item.is_reported) {
          stats.totalReportedListings++;
        }
      }
    }

    // 3. Reports count from listing_reports table
    const { count: reportsCount } = await supabase
      .from("listing_reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if (reportsCount !== null && reportsCount !== undefined && reportsCount > 0) {
      stats.totalReportedListings = Math.max(stats.totalReportedListings, reportsCount);
    }

    // 4. Rentals / Bookings statistics
    const { data: bookingsData, error: bookingsError } = await supabase
      .from("bookings")
      .select("id, renter_id, status");

    if (!bookingsError && bookingsData) {
      const uniqueRenters = new Set<string>();

      for (const b of bookingsData) {
        if (b.renter_id) uniqueRenters.add(b.renter_id);
        const st = b.status as keyof typeof stats.rentalsByStatus;
        if (["active", "paid"].includes(b.status)) {
          stats.totalActiveRentals++;
        }
        if (stats.rentalsByStatus[st] !== undefined) {
          stats.rentalsByStatus[st]++;
        }
      }
      stats.totalUsersUsedRental = uniqueRenters.size;
    }
  } catch (err) {
    console.error("[getAdminOverviewStats] Error calculating stats from database:", err);
  }

  return stats;
}

/**
 * Fetch all registered users with rental and listing counts.
 * Genuine database records only.
 */
export async function getAdminUsers(): Promise<AdminUserItem[]> {
  try {
    const supabase = await getAdminSupabaseClient();

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && profiles && profiles.length > 0) {
      const userIds = profiles.map((p) => p.clerk_user_id);

      const [bookingsRes, listingsRes] = await Promise.all([
        supabase.from("bookings").select("renter_id").in("renter_id", userIds),
        supabase.from("listings").select("owner_id").in("owner_id", userIds),
      ]);

      const rentalCountMap: Record<string, number> = {};
      const listingCountMap: Record<string, number> = {};

      (bookingsRes.data || []).forEach((b) => {
        rentalCountMap[b.renter_id] = (rentalCountMap[b.renter_id] || 0) + 1;
      });

      (listingsRes.data || []).forEach((l) => {
        listingCountMap[l.owner_id] = (listingCountMap[l.owner_id] || 0) + 1;
      });

      return profiles.map((p) => {
        const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ");
        return {
          id: p.id,
          clerk_user_id: p.clerk_user_id,
          name: fullName || p.email?.split("@")[0] || "User",
          email: p.email || "No email",
          role: (p.role as UserRole) || "customer",
          status: (p.status as UserAccountStatus) || "active",
          avatar_url: p.avatar_url,
          created_at: p.created_at,
          rentalCount: rentalCountMap[p.clerk_user_id] || 0,
          listingCount: listingCountMap[p.clerk_user_id] || 0,
        };
      });
    }
  } catch (err) {
    console.error("[getAdminUsers] Database query error:", err);
  }

  return [];
}

/**
 * Fetch all listings for equipment listing management.
 * Returns genuine database records only.
 */
export async function getAdminAllListings(): Promise<MarketplaceListingItem[]> {
  try {
    const supabase = await getAdminSupabaseClient();

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
      console.error("[getAdminAllListings] Database error:", error.message);
    }
  } catch (err) {
    console.error("[getAdminAllListings] Exception:", err);
  }

  return [];
}

/**
 * Fetch reported listings and user complaints.
 * Genuine database records only.
 */
export async function getAdminReports(): Promise<AdminReportItem[]> {
  try {
    const supabase = await getAdminSupabaseClient();

    const { data, error } = await supabase
      .from("listing_reports")
      .select(`
        *,
        listing:listings(title)
      `)
      .order("created_at", { ascending: false });

    if (!error && data) {
      type RawReport = {
        id: string;
        listing_id: string;
        listing?: { title?: string } | null;
        reporter_id?: string | null;
        reporter_email?: string | null;
        reason: string;
        details?: string | null;
        status: string;
        created_at: string;
      };

      return (data as unknown as RawReport[]).map((r) => ({
        id: r.id,
        listing_id: r.listing_id,
        listing_title: r.listing?.title || "Listing Unit",
        reporter_id: r.reporter_id || "Anonymous",
        reporter_email: r.reporter_email || null,
        reason: r.reason,
        details: r.details || null,
        status: (r.status as AdminReportItem["status"]) || "pending",
        created_at: r.created_at,
      }));
    }
  } catch (err) {
    console.error("[getAdminReports] Database query error:", err);
  }

  return [];
}

/**
 * Fetch recent audit logs of admin operations.
 * Strictly from the database.
 */
export async function getAdminAuditLogs(): Promise<AdminAuditLogItem[]> {
  try {
    const supabase = await getAdminSupabaseClient();

    const { data, error } = await supabase
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data && data.length > 0) {
      return (data as unknown as Array<{
        id: string;
        admin_id: string;
        admin_email: string | null;
        action: string;
        target_type: string;
        target_id: string;
        details: Record<string, unknown>;
        created_at: string;
      }>).map((l) => ({
        id: l.id,
        admin_id: l.admin_id,
        admin_email: l.admin_email,
        action: l.action,
        target_type: l.target_type,
        target_id: l.target_id,
        details: l.details || {},
        created_at: l.created_at,
      }));
    }
  } catch (err) {
    console.error("[getAdminAuditLogs] Database query error:", err);
  }

  return [];
}
