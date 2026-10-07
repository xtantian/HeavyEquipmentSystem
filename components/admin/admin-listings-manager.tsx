"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Trash2,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Loader2,
  Image as ImageIcon,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { MarketplaceListingItem } from "@/lib/marketplace/mock-listings";
import type { ListingStatus } from "@/lib/supabase/types";
import {
  updateListingStatusAdminAction,
  deleteListingAdminAction,
} from "@/app/admin/actions";

interface AdminListingsManagerProps {
  initialListings: MarketplaceListingItem[];
}

const STATUS_OPTIONS: { value: ListingStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "pending_review", label: "Pending Review" },
  { value: "rented", label: "Rented" },
  { value: "maintenance", label: "Maintenance" },
  { value: "inactive", label: "Inactive" },
];

export function AdminListingsManager({ initialListings }: AdminListingsManagerProps) {
  const [listings, setListings] = React.useState<MarketplaceListingItem[]>(initialListings);
  const [loadingActions, setLoadingActions] = React.useState<Record<string, boolean>>({});
  const [notification, setNotification] = React.useState<{ text: string; type: "success" | "error" } | null>(null);

  const showNotification = (text: string, type: "success" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleStatusChange = async (listingId: string, newStatus: ListingStatus) => {
    setLoadingActions((prev) => ({ ...prev, [listingId]: true }));
    try {
      // Optimistic update
      setListings((prev) =>
        prev.map((item) => (item.id === listingId ? { ...item, status: newStatus } : item))
      );

      const res = await updateListingStatusAdminAction(listingId, newStatus);
      if (res.error) {
        showNotification(res.error, "error");
      } else {
        showNotification(`Listing status updated to "${newStatus}".`, "success");
      }
    } catch (err: unknown) {
      showNotification((err as Error).message || "Failed to update status", "error");
    } finally {
      setLoadingActions((prev) => ({ ...prev, [listingId]: false }));
    }
  };

  const handleDeleteListing = async (listingId: string, title: string) => {
    if (!confirm(`Are you sure you want to permanently delete listing "${title}"?`)) {
      return;
    }

    setLoadingActions((prev) => ({ ...prev, [listingId]: true }));
    try {
      // Optimistic delete
      setListings((prev) => prev.filter((item) => item.id !== listingId));

      const res = await deleteListingAdminAction(listingId);
      if (res.error) {
        showNotification(res.error, "error");
      } else {
        showNotification("Listing deleted successfully.", "success");
      }
    } catch (err: unknown) {
      showNotification((err as Error).message || "Failed to delete listing", "error");
    } finally {
      setLoadingActions((prev) => ({ ...prev, [listingId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {notification && (
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium border shadow-sm animate-in fade-in ${
            notification.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          <span>{notification.text}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-3 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Row */}
      <div className="flex items-center justify-between border-b border-border/80 pb-4">
        <div>
          <span className="text-sm font-semibold text-muted-foreground">
            Total Listings: <span className="text-foreground">{listings.length}</span>
          </span>
        </div>
      </div>

      {/* Listings Table / Cards */}
      {listings.length > 0 ? (
        <div className="space-y-4">
          {listings.map((item) => {
            const photo =
              (item.listing_images?.[0] as { url?: string; image_url?: string } | undefined)?.url ||
              item.listing_images?.[0]?.image_url ||
              item.images?.[0];

            const isLoading = Boolean(loadingActions[item.id]);

            return (
              <Card
                key={item.id}
                className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 sm:p-5 transition-all hover:border-primary/40 shadow-sm"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left info */}
                  <div className="flex items-start gap-4">
                    <div className="relative h-20 w-24 sm:h-24 sm:w-32 shrink-0 overflow-hidden rounded-xl bg-muted border border-border/60">
                      {photo ? (
                        <Image
                          src={photo}
                          alt={item.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-6 w-6 stroke-[1.5]" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs font-semibold">
                          {item.category?.name || "Equipment"}
                        </Badge>
                        <span className="text-muted-foreground/60">•</span>
                        <span className="text-xs font-mono text-muted-foreground">
                          Owner: {item.owner_id || "System"}
                        </span>
                      </div>

                      <h3 className="font-heading text-base sm:text-lg font-bold text-foreground">
                        {item.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{item.location}</span>
                        <span className="font-semibold text-foreground">
                          {formatCurrency(item.price_per_day)} / day
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right actions: Status select & Delete button */}
                  <div className="flex flex-wrap items-center gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-border/60">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Status:
                      </label>
                      <select
                        value={item.status}
                        disabled={isLoading}
                        onChange={(e) => handleStatusChange(item.id, e.target.value as ListingStatus)}
                        className="h-8 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer disabled:opacity-50"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Link href={`/listings/${item.id}`} target="_blank">
                      <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold">
                        View <ExternalLink className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isLoading}
                      onClick={() => handleDeleteListing(item.id, item.title)}
                      className="h-8 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 cursor-pointer"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Delete
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-12 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="font-heading text-lg font-bold text-foreground">No listings found</h3>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            No equipment or vehicle units have been posted to the marketplace yet.
          </p>
        </Card>
      )}
    </div>
  );
}
