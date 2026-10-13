import Link from "next/link";
import { SlidersHorizontal, X, ArrowLeft, ShieldCheck, Plus } from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getMarketplaceCategories,
  getMarketplaceListings,
} from "@/lib/supabase/marketplace";
import { getSavedListingIds } from "@/app/actions/saved-listings";
import { BrowseSearchFilters } from "@/components/marketplace/browse-search-filters";
import { ListingCardsGrid } from "@/components/marketplace/listing-cards-grid";

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

  // Fetch categories, listings, and the current user's saved listing IDs concurrently
  const [categories, listings, { savedIds }] = await Promise.all([
    getMarketplaceCategories(),
    getMarketplaceListings({
      category: currentCategory,
      q: currentQuery,
      start: currentStart,
      end: currentEnd,
      min: currentMin,
      max: currentMax,
    }),
    getSavedListingIds(),
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

            {/* 1. Search Bar and Price Filter */}
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

            {/* Category Filter Tabs: Horizontally scrollable without ugly wrapping */}
            <div className="mt-5 flex gap-2 overflow-x-auto pb-2 scrollbar-none flex-nowrap">
              <Link
                href={createFilterHref()}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
                    className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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

            {/* Grid — client component so hearts can use Clerk hooks */}
            <ListingCardsGrid listings={listings} initialSavedIds={savedIds} />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
