"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, Plus, Image as ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { SaveHeartButton } from "@/components/marketplace/save-heart-button";
import type { MarketplaceListingItem } from "@/lib/marketplace/mock-listings";

interface ListingCardsGridProps {
  listings: MarketplaceListingItem[];
  /** Set of listing IDs the current user has already saved. Empty for guests. */
  initialSavedIds?: string[];
}

/**
 * Renders the marketplace listing grid.
 * Must be a client component so the SaveHeartButton can use Clerk hooks and
 * maintain optimistic saved-state across cards.
 */
export function ListingCardsGrid({
  listings,
  initialSavedIds = [],
}: ListingCardsGridProps) {
  // Keep a local saved-set so toggling one card updates related ones immediately
  const [savedIds, setSavedIds] = React.useState<Set<string>>(
    () => new Set(initialSavedIds)
  );

  const handleToggle = React.useCallback(
    (listingId: string, nowSaved: boolean) => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (nowSaved) {
          next.add(listingId);
        } else {
          next.delete(listingId);
        }
        return next;
      });
    },
    []
  );

  if (listings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-12 sm:p-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
          <Search className="h-6 w-6" />
        </div>
        <h3 className="font-heading text-lg font-bold text-foreground sm:text-xl">
          No listings found
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Try another category, search term, or price range.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/listings">
            <Button variant="outline" size="sm" className="font-semibold">
              Reset Filters
            </Button>
          </Link>
          <Link href="/listings/new">
            <Button size="sm" className="font-semibold">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              List Your Item
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((item) => {
        const firstImage =
          (item.listing_images?.[0] as { url?: string; image_url?: string } | undefined)?.url ||
          item.listing_images?.[0]?.image_url ||
          item.images?.[0];

        const categoryLabel = item.category?.name || "Equipment";
        const rawAttrs = (item.attributes || {}) as Record<string, unknown>;
        const attrEntries = Object.entries(rawAttrs)
          .filter(([key, val]) => val !== null && val !== undefined && key !== "security_deposit")
          .slice(0, 2);

        const isPending = item.has_active_reservation || item.status === "pending_review";
        const isNotAvailable =
          item.status === "inactive" || item.status === "maintenance" || item.status === "restricted";

        const isSaved = savedIds.has(item.id);

        return (
          <Link
            key={item.id}
            href={`/listings/${item.id}`}
            className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-transform duration-200 hover:-translate-y-1"
          >
            <Card className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-lg">
              {/* Image & Badges */}
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                {firstImage ? (
                  <Image
                    src={firstImage}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-muted/60 text-muted-foreground p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background/80 border border-border/60 shadow-sm">
                      <ImageIcon className="h-6 w-6 stroke-[1.5] text-muted-foreground/60" />
                    </div>
                    <span className="mt-2 text-xs font-medium text-muted-foreground/70">
                      No image provided
                    </span>
                  </div>
                )}

                {/* Category badge — top-left */}
                <div className="absolute top-3 left-3">
                  <Badge
                    variant="secondary"
                    className="bg-background/90 text-foreground backdrop-blur-sm text-xs font-semibold"
                  >
                    {categoryLabel}
                  </Badge>
                </div>

                {/* Heart save button — top-right */}
                <div className="absolute top-3 right-3">
                  <SaveHeartButton
                    listingId={item.id}
                    initialSaved={isSaved}
                    onToggle={handleToggle}
                  />
                </div>

                {/* Status badge — previously top-right, now bottom-right so it doesn't clash */}
                <div className="absolute bottom-3 right-3">
                  {isPending ? (
                    <Badge className="bg-amber-500 text-white shadow-sm text-xs font-semibold px-2 py-0.5">
                      Pending
                    </Badge>
                  ) : isNotAvailable ? (
                    <Badge
                      variant="outline"
                      className="bg-muted text-muted-foreground shadow-sm text-xs font-semibold px-2 py-0.5 border-muted-foreground/40"
                    >
                      Not Available
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-600 text-white shadow-sm text-xs font-semibold px-2 py-0.5">
                      Available
                    </Badge>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <h3 className="font-heading text-lg font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                    {item.title}
                  </h3>
                  <p className="text-xs font-medium text-muted-foreground mt-1 truncate">
                    {item.location}
                  </p>

                  {attrEntries.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-2 border-y border-border/60 py-3">
                      {attrEntries.map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-muted-foreground block text-[11px] capitalize truncate">
                            {k.replace(/_/g, " ")}
                          </span>
                          <span className="font-semibold text-foreground mt-0.5 block truncate">
                            {String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Price */}
                <div className="mt-5 flex items-center justify-between pt-1">
                  <div>
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                      Rental Rate
                    </span>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-xl font-extrabold text-foreground group-hover:text-primary transition-colors">
                        {formatCurrency(item.price_per_day)}
                      </span>
                      <span className="text-xs text-muted-foreground">/ day</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

