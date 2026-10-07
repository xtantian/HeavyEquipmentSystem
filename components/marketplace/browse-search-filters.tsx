"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface BrowseSearchFiltersProps {
  initialQuery?: string;
  initialMin?: string;
  initialMax?: string;
}

export function BrowseSearchFilters({
  initialQuery = "",
  initialMin = "",
  initialMax = "",
}: BrowseSearchFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentQ = searchParams.get("q") || "";
  const currentMin = searchParams.get("min") || "";
  const currentMax = searchParams.get("max") || "";

  const [prevParams, setPrevParams] = React.useState({
    q: initialQuery || currentQ,
    min: initialMin || currentMin,
    max: initialMax || currentMax,
  });
  const [query, setQuery] = React.useState(initialQuery || currentQ);
  const [minPrice, setMinPrice] = React.useState(initialMin || currentMin);
  const [maxPrice, setMaxPrice] = React.useState(initialMax || currentMax);

  if (
    prevParams.q !== currentQ ||
    prevParams.min !== currentMin ||
    prevParams.max !== currentMax
  ) {
    setPrevParams({ q: currentQ, min: currentMin, max: currentMax });
    setQuery(currentQ);
    setMinPrice(currentMin);
    setMaxPrice(currentMax);
  }

  // Push updated params to URL while preserving others (e.g. category, start, end)
  const updateUrl = React.useCallback(
    (newParams: { q?: string; min?: string; max?: string }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (newParams.q !== undefined) {
        if (newParams.q.trim()) {
          params.set("q", newParams.q.trim());
        } else {
          params.delete("q");
        }
      }

      if (newParams.min !== undefined) {
        if (newParams.min.trim()) {
          params.set("min", newParams.min.trim());
        } else {
          params.delete("min");
        }
      }

      if (newParams.max !== undefined) {
        if (newParams.max.trim()) {
          params.set("max", newParams.max.trim());
        } else {
          params.delete("max");
        }
      }

      const queryString = params.toString();
      router.push(`${pathname}${queryString ? `?${queryString}` : ""}`);
    },
    [router, pathname, searchParams]
  );

  // Debounce search query by 300ms
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const currentParamQ = searchParams.get("q") || "";
      if (query !== currentParamQ) {
        updateUrl({ q: query });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchParams, updateUrl]);

  // Debounce price inputs by 300ms
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const currentParamMin = searchParams.get("min") || "";
      const currentParamMax = searchParams.get("max") || "";
      if (minPrice !== currentParamMin || maxPrice !== currentParamMax) {
        updateUrl({ min: minPrice, max: maxPrice });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [minPrice, maxPrice, searchParams, updateUrl]);

  const handleClearPrice = () => {
    setMinPrice("");
    setMaxPrice("");
    updateUrl({ min: "", max: "" });
  };

  const hasPriceFilter = Boolean(minPrice || maxPrice);

  return (
    <div className="mt-5 space-y-3">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search listings by title, description, or location..."
          className="h-11 pl-10 pr-10 text-sm bg-background border-border/80 shadow-sm rounded-xl focus-visible:ring-primary"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Price Filter (PHP, ₱) Row */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mr-1">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Price / day (PHP):
        </span>

        <div className="relative w-28 sm:w-32">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
            ₱
          </span>
          <Input
            type="number"
            min={0}
            step="100"
            placeholder="Min"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="h-8 pl-7 pr-2 text-xs bg-background rounded-lg border-border/80"
          />
        </div>

        <span className="text-xs text-muted-foreground font-medium">—</span>

        <div className="relative w-28 sm:w-32">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
            ₱
          </span>
          <Input
            type="number"
            min={0}
            step="100"
            placeholder="Max"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="h-8 pl-7 pr-2 text-xs bg-background rounded-lg border-border/80"
          />
        </div>

        {hasPriceFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearPrice}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="mr-1 h-3 w-3" /> Clear Price
          </Button>
        )}
      </div>
    </div>
  );
}
