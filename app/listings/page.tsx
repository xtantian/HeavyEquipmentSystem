import Link from "next/link";
import Image from "next/image";
import { Eye, Search, SlidersHorizontal, X, ArrowLeft, ShieldCheck, Image as ImageIcon, Plus } from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  getMarketplaceCategories,
  getMarketplaceListings,
} from "@/lib/supabase/marketplace";
import { BrowseSearchFilters } from "@/components/marketplace/browse-search-filters";

interface ListingsPageProps {
  searchParams: Promise<{
    category?: string;
    q?: string;
    start?: string;
    end?: string;
    min?: string;
    max?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function ListingsPage({ searchParams }: ListingsPageProps) {
  const resolvedParams = await searchParams;
  const currentCategory = resolvedParams.category || "";
  const currentQuery = resolvedParams.q || "";
  const currentStart = resolvedParams.start || "";
  const currentEnd = resolvedParams.end || "";
  const currentMin = resolvedParams.min || "";
  const currentMax = resolvedParams.max || "";

  // Helper to create category hrefs preserving search and price
  const createFilterHref = (newCategory?: string) => {
    const params = new URLSearchParams();
    if (newCategory) params.set("category", newCategory);
    if (currentQuery) params.set("q", currentQuery);
    if (currentMin) params.set("min", currentMin);
    if (currentMax) params.set("max", currentMax);
    if (currentStart) params.set("start", currentStart);
    if (currentEnd) params.set("end", currentEnd);
    const qs = params.toString();
    return `/listings${qs ? `?${qs}` : ""}`;
  };

  // Helper to remove a single param from active filter badges
  const createParamHref = (omitKey: "category" | "q" | "price" | "dates") => {
    const params = new URLSearchParams();
    if (omitKey !== "category" && currentCategory) params.set("category", currentCategory);
    if (omitKey !== "q" && currentQuery) params.set("q", currentQuery);
    if (omitKey !== "price") {
      if (currentMin) params.set("min", currentMin);
      if (currentMax) params.set("max", currentMax);
    }
    if (omitKey !== "dates") {
      if (currentStart) params.set("start", currentStart);
      if (currentEnd) params.set("end", currentEnd);
    }
    const qs = params.toString();
    return `/listings${qs ? `?${qs}` : ""}`;
  };

  // Fetch categories and listings concurrently
  const [categories, listings] = await Promise.all([
    getMarketplaceCategories(),
    getMarketplaceListings({
      category: currentCategory,
      q: currentQuery,
      start: currentStart,
      end: currentEnd,
      min: currentMin,
      max: currentMax,
    }),
  ]);

  const activeCategoryObj = categories.find((c) => c.slug === currentCategory);
  const activeFiltersCount =
    (currentCategory ? 1 : 0) +
    (currentQuery ? 1 : 0) +
    (currentStart || currentEnd ? 1 : 0) +
    (currentMin || currentMax ? 1 : 0);

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />

      <main className="flex-1">
        {/* Header & Filter Section */}
        <section className="border-b border-border/60 bg-muted/20 py-8 sm:py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Link
                    href="/"
                    className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="mr-1 h-3 w-3" />
                    Home
                  </Link>
                  <span className="text-xs text-muted-foreground">/</span>
                  <span className="text-xs font-semibold text-primary">
                    {activeCategoryObj ? activeCategoryObj.name : "All Listings"}
                  </span>
                </div>

                <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                  {activeCategoryObj ? `${activeCategoryObj.name} for Rent` : "Rental Marketplace Listings"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                  {activeCategoryObj?.description ||
                    "Browse vetted items available for flexible short-term and contract hire with transparent daily pricing."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 self-start md:self-end">
                <Link href="/listings/new">
                  <Button size="sm" className="shadow-sm">
                    <Plus className="mr-1.5 h-4 w-4" />
                    List Your Item
                  </Button>
                </Link>
                <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <span>Verified owners</span>
                </div>
              </div>
            </div>

            {/* 1. Search Bar and Price Filter (placed above category chips) */}
            <BrowseSearchFilters
              initialQuery={currentQuery}
              initialMin={currentMin}
              initialMax={currentMax}
            />

            {/* Active search parameters / dates badge row */}
            {activeFiltersCount > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                  <SlidersHorizontal className="h-3 w-3" /> Active Filters:
                </span>

                {currentCategory && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    Category: {activeCategoryObj?.name || currentCategory}
                    <Link href={createParamHref("category")}>
                      <X className="h-3 w-3 hover:text-destructive" />
                    </Link>
                  </Badge>
                )}

                {currentQuery && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    Search: &ldquo;{currentQuery}&rdquo;
                    <Link href={createParamHref("q")}>
                      <X className="h-3 w-3 hover:text-destructive" />
                    </Link>
                  </Badge>
                )}

                {(currentMin || currentMax) && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    Price: ₱{currentMin || "0"} — ₱{currentMax || "∞"}
                    <Link href={createParamHref("price")}>
                      <X className="h-3 w-3 hover:text-destructive" />
                    </Link>
                  </Badge>
                )}

                {(currentStart || currentEnd) && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    Dates: {currentStart || "Any"} → {currentEnd || "Any"}
                    <Link href={createParamHref("dates")}>
                      <X className="h-3 w-3 hover:text-destructive" />
                    </Link>
                  </Badge>
                )}

                <Link
                  href="/listings"
                  className="text-xs text-primary hover:underline ml-1 font-semibold"
                >
                  Clear all
                </Link>
              </div>
            )}

            {/* Category Filter Tabs */}
            <div className="mt-5 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              <Link
                href={createFilterHref()}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  !currentCategory
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                All Items
              </Link>
              {categories.map((cat) => {
                const isActive = currentCategory === cat.slug;
                return (
                  <Link
                    key={cat.id}
                    href={createFilterHref(cat.slug)}
                    className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {cat.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Listings Grid Section */}
        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                Showing <span className="text-foreground">{listings.length}</span> rental units
              </span>
            </div>

            {/* Grid */}
            {listings.length > 0 ? (
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

                  return (
                    <Card
                      key={item.id}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                    >
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
                        <div className="absolute top-3 left-3">
                          <Badge
                            variant="secondary"
                            className="bg-background/90 text-foreground backdrop-blur-sm text-xs font-semibold"
                          >
                            {categoryLabel}
                          </Badge>
                        </div>
                        <div className="absolute top-3 right-3">
                          <Badge className="bg-emerald-600 text-white shadow-sm text-xs font-semibold px-2 py-0.5">
                            Available
                          </Badge>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="flex flex-1 flex-col justify-between p-5">
                        <div>
                          <h3 className="font-heading text-lg font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                            {item.title}
                          </h3>
                          <p className="text-xs font-medium text-muted-foreground mt-0.5 truncate">
                            {item.location}
                          </p>

                          {/* Dynamic Attribute Highlights */}
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

                        {/* Price & Action */}
                        <div className="mt-5 flex items-center justify-between pt-1">
                          <div>
                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                              Rental Rate
                            </span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                              <span className="text-xl font-extrabold text-foreground">
                                {formatCurrency(item.price_per_day)}
                              </span>
                              <span className="text-xs text-muted-foreground">/ day</span>
                            </div>
                          </div>

                          <Link href={`/listings/${item.id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="font-medium group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors"
                            >
                              <Eye className="mr-1.5 h-3.5 w-3.5" />
                              View Details
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              /* Empty State */
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-12 sm:p-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
                  <Search className="h-6 w-6" />
                </div>
                <h3 className="font-heading text-lg font-bold text-foreground sm:text-xl">
                  No listings match your filters
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  We couldn&apos;t find any rental equipment or vehicles for your current selection. Try broadening your search or resetting your filters.
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
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
