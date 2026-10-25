/**
 * Reusable skeleton components for production-quality loading states.
 *
 * Each skeleton mirrors the exact layout of its corresponding real component
 * to prevent layout shifts. Uses the shimmer CSS animation defined in globals.css.
 */
import { cn } from "cn";

/* ─── Base Skeleton Primitives ─────────────────────────────────────────── */

function Shimmer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-xl", className)}
      {...props}
    />
  );
}

function Pulse({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("skeleton-pulse rounded-xl bg-muted", className)}
      {...props}
    />
  );
}

/* ─── Listing Card Skeleton ────────────────────────────────────────────── */

export function ListingCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm",
        className
      )}
    >
      {/* Image placeholder */}
      <Shimmer className="h-48 w-full rounded-none" />

      <div className="p-4 space-y-3">
        {/* Category badge */}
        <Shimmer className="h-5 w-20 rounded-full" />

        {/* Title */}
        <Shimmer className="h-5 w-[85%] rounded-lg" />

        {/* Location */}
        <div className="flex items-center gap-1.5">
          <Shimmer className="h-3.5 w-3.5 rounded-full" />
          <Shimmer className="h-3.5 w-32 rounded-lg" />
        </div>

        {/* Price & action */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <Shimmer className="h-5 w-28 rounded-lg" />
          <Shimmer className="h-8 w-20 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/* ─── Listing Cards Grid Skeleton ──────────────────────────────────────── */

export function ListingGridSkeleton({
  count = 8,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-fade-in-up stagger-${Math.min(i + 1, 8)}`}
          style={{ opacity: 0, animationFillMode: "forwards" }}
        >
          <ListingCardSkeleton />
        </div>
      ))}
    </div>
  );
}

/* ─── Stat Card Skeleton (Dashboard) ───────────────────────────────────── */

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Shimmer className="h-4 w-24 rounded-lg" />
        <Shimmer className="h-9 w-9 rounded-xl" />
      </div>
      <Shimmer className="h-8 w-16 rounded-lg" />
      <Shimmer className="h-3.5 w-32 rounded-lg" />
    </div>
  );
}

export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-fade-in-up stagger-${i + 1}`}
          style={{ opacity: 0, animationFillMode: "forwards" }}
        >
          <StatCardSkeleton />
        </div>
      ))}
    </div>
  );
}

/* ─── Table Row Skeleton (Admin/Dashboard tables) ──────────────────────── */

export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border/40">
      {Array.from({ length: columns }).map((_, i) => (
        <Shimmer
          key={i}
          className={cn(
            "h-4 rounded-lg",
            i === 0 ? "w-10 shrink-0" : "",
            i === 1 ? "w-[30%]" : "",
            i === 2 ? "w-[20%]" : "",
            i >= 3 ? "w-[15%]" : ""
          )}
        />
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card overflow-hidden",
        className
      )}
    >
      {/* Table header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-muted/30 border-b border-border/60">
        {Array.from({ length: columns }).map((_, i) => (
          <Pulse
            key={i}
            className={cn(
              "h-3.5 rounded-lg",
              i === 0 ? "w-8 shrink-0" : "",
              i === 1 ? "w-[25%]" : "",
              i === 2 ? "w-[18%]" : "",
              i >= 3 ? "w-[14%]" : ""
            )}
          />
        ))}
      </div>

      {/* Table rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`animate-fade-in stagger-${Math.min(i + 1, 8)}`}
          style={{ opacity: 0, animationFillMode: "forwards" }}
        >
          <TableRowSkeleton columns={columns} />
        </div>
      ))}
    </div>
  );
}

/* ─── Booking / Rental Item Skeleton ───────────────────────────────────── */

export function BookingItemSkeleton() {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3">
      <div className="flex gap-4">
        {/* Thumbnail */}
        <Shimmer className="h-20 w-20 rounded-xl shrink-0" />

        <div className="flex-1 space-y-2.5">
          {/* Title */}
          <Shimmer className="h-4.5 w-[70%] rounded-lg" />
          {/* Status badge */}
          <Shimmer className="h-5 w-16 rounded-full" />
          {/* Dates */}
          <div className="flex items-center gap-2">
            <Shimmer className="h-3.5 w-3.5 rounded-full" />
            <Shimmer className="h-3.5 w-40 rounded-lg" />
          </div>
        </div>

        {/* Price */}
        <Shimmer className="h-6 w-20 rounded-lg self-start shrink-0" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/40">
        <Shimmer className="h-8 w-24 rounded-xl" />
        <Shimmer className="h-8 w-20 rounded-xl" />
      </div>
    </div>
  );
}

export function BookingListSkeleton({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-fade-in-up stagger-${Math.min(i + 1, 8)}`}
          style={{ opacity: 0, animationFillMode: "forwards" }}
        >
          <BookingItemSkeleton />
        </div>
      ))}
    </div>
  );
}

/* ─── Dashboard Tabs Skeleton ──────────────────────────────────────────── */

export function DashboardTabsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-2xl w-fit">
        <Shimmer className="h-9 w-36 rounded-xl" />
        <Pulse className="h-9 w-36 rounded-xl" />
      </div>

      {/* Sub-stats row */}
      <StatsGridSkeleton count={4} />

      {/* Content list */}
      <BookingListSkeleton count={4} />
    </div>
  );
}

/* ─── Listing Detail Skeleton ──────────────────────────────────────────── */

export function ListingDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Left column: Gallery + details */}
      <div className="lg:col-span-7 space-y-8">
        {/* Gallery */}
        <Shimmer className="h-72 sm:h-96 w-full rounded-2xl" />

        {/* Title + location */}
        <div className="space-y-3">
          <Shimmer className="h-8 w-[75%] rounded-xl" />
          <div className="flex items-center gap-2">
            <Shimmer className="h-4 w-4 rounded-full" />
            <Shimmer className="h-4 w-40 rounded-lg" />
          </div>
        </div>

        {/* Host profile */}
        <div className="rounded-2xl border border-border/80 bg-card p-5">
          <div className="flex items-center gap-4">
            <Shimmer className="h-12 w-12 rounded-full" />
            <div className="space-y-2 flex-1">
              <Shimmer className="h-4 w-32 rounded-lg" />
              <Shimmer className="h-3.5 w-24 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 space-y-3">
          <Shimmer className="h-5 w-36 rounded-lg" />
          <Shimmer className="h-3.5 w-full rounded-lg" />
          <Shimmer className="h-3.5 w-[90%] rounded-lg" />
          <Shimmer className="h-3.5 w-[80%] rounded-lg" />
          <Shimmer className="h-3.5 w-[70%] rounded-lg" />
        </div>

        {/* Specs grid */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 space-y-4">
          <Shimmer className="h-5 w-52 rounded-lg" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1.5"
              >
                <Shimmer className="h-3 w-16 rounded" />
                <Shimmer className="h-4 w-24 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right column: Booking card */}
      <div className="lg:col-span-5">
        <div className="rounded-2xl border border-border/80 bg-card p-6 space-y-5 sticky top-6">
          {/* Price */}
          <div className="flex items-baseline gap-2">
            <Shimmer className="h-8 w-24 rounded-xl" />
            <Shimmer className="h-4 w-12 rounded-lg" />
          </div>

          {/* Divider */}
          <div className="border-t border-border/40" />

          {/* Date pickers */}
          <div className="space-y-3">
            <Shimmer className="h-4 w-20 rounded-lg" />
            <Shimmer className="h-10 w-full rounded-xl" />
            <Shimmer className="h-4 w-20 rounded-lg" />
            <Shimmer className="h-10 w-full rounded-xl" />
          </div>

          {/* Summary */}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <div className="flex justify-between">
              <Shimmer className="h-3.5 w-24 rounded-lg" />
              <Shimmer className="h-3.5 w-16 rounded-lg" />
            </div>
            <div className="flex justify-between">
              <Shimmer className="h-3.5 w-28 rounded-lg" />
              <Shimmer className="h-3.5 w-16 rounded-lg" />
            </div>
            <div className="flex justify-between pt-2 border-t border-border/40">
              <Shimmer className="h-5 w-16 rounded-lg" />
              <Shimmer className="h-5 w-20 rounded-lg" />
            </div>
          </div>

          {/* CTA Button */}
          <Shimmer className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/* ─── Profile Page Skeleton ────────────────────────────────────────────── */

export function ProfileSkeleton() {
  return (
    <div className="space-y-10">
      {/* Profile header card */}
      <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-5">
            {/* Avatar */}
            <Shimmer className="h-20 w-20 sm:h-24 sm:w-24 rounded-full shrink-0" />

            <div className="space-y-3">
              <Shimmer className="h-7 w-44 rounded-lg" />
              <div className="flex items-center gap-2">
                <Shimmer className="h-4 w-4 rounded-full" />
                <Shimmer className="h-4 w-28 rounded-lg" />
              </div>
              <div className="flex items-center gap-2">
                <Shimmer className="h-4 w-4 rounded-full" />
                <Shimmer className="h-4 w-32 rounded-lg" />
              </div>
            </div>
          </div>

          {/* Stats badges */}
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border/60 bg-muted/20 p-3 text-center space-y-1.5 w-20"
              >
                <Shimmer className="h-5 w-8 mx-auto rounded" />
                <Shimmer className="h-3 w-12 mx-auto rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active listings grid */}
      <div className="space-y-4">
        <Shimmer className="h-6 w-40 rounded-lg" />
        <ListingGridSkeleton count={4} />
      </div>

      {/* Reviews section */}
      <div className="space-y-4">
        <Shimmer className="h-6 w-32 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border/80 bg-card p-5 space-y-3"
          >
            <div className="flex items-center gap-3">
              <Shimmer className="h-9 w-9 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <Shimmer className="h-4 w-28 rounded-lg" />
                <Shimmer className="h-3 w-20 rounded-lg" />
              </div>
              <Shimmer className="h-4 w-20 rounded-lg" />
            </div>
            <Shimmer className="h-3.5 w-full rounded-lg" />
            <Shimmer className="h-3.5 w-[80%] rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Admin Overview Stats Skeleton ────────────────────────────────────── */

export function AdminOverviewSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Shimmer className="h-8 w-52 rounded-xl" />
        <Shimmer className="h-4 w-80 rounded-lg" />
      </div>

      {/* Stats cards */}
      <StatsGridSkeleton count={4} />

      {/* Charts placeholder */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/80 bg-card p-6 space-y-4">
          <Shimmer className="h-5 w-40 rounded-lg" />
          <Shimmer className="h-48 w-full rounded-xl" />
        </div>
        <div className="rounded-2xl border border-border/80 bg-card p-6 space-y-4">
          <Shimmer className="h-5 w-36 rounded-lg" />
          <Shimmer className="h-48 w-full rounded-xl" />
        </div>
      </div>

      {/* Recent activity table */}
      <div className="space-y-3">
        <Shimmer className="h-5 w-36 rounded-lg" />
        <TableSkeleton rows={5} columns={5} />
      </div>
    </div>
  );
}

/* ─── Admin Listings Table Skeleton ────────────────────────────────────── */

export function AdminListingsTableSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Shimmer className="h-8 w-64 rounded-xl" />
        <Shimmer className="h-4 w-96 rounded-lg" />
      </div>

      {/* Search / filter bar */}
      <div className="flex items-center gap-3">
        <Shimmer className="h-10 w-64 rounded-xl" />
        <Shimmer className="h-10 w-32 rounded-xl" />
        <Shimmer className="h-10 w-28 rounded-xl" />
      </div>

      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}

/* ─── Marketplace Browse Page Skeleton ─────────────────────────────────── */

export function MarketplaceBrowseSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      {/* Navbar placeholder */}
      <div className="h-16 border-b border-border/60 bg-background" />

      {/* Header + Filters Section */}
      <section className="border-b border-border/60 bg-muted/20 py-8 sm:py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-5">
          {/* Breadcrumb */}
          <Shimmer className="h-3.5 w-28 rounded-lg" />

          {/* Title */}
          <Shimmer className="h-10 w-80 rounded-xl" />
          <Shimmer className="h-4 w-96 rounded-lg" />

          {/* Search bar */}
          <div className="flex gap-3 mt-4">
            <Shimmer className="h-10 flex-1 rounded-xl" />
            <Shimmer className="h-10 w-24 rounded-xl" />
            <Shimmer className="h-10 w-24 rounded-xl" />
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 overflow-hidden pt-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Shimmer
                key={i}
                className="h-8 rounded-full shrink-0"
                style={{ width: `${60 + Math.random() * 40}px` }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Grid section */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between">
            <Shimmer className="h-4 w-48 rounded-lg" />
          </div>
          <ListingGridSkeleton count={8} />
        </div>
      </section>
    </div>
  );
}

/* ─── Saved Listings Skeleton ──────────────────────────────────────────── */

export function SavedListingsSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <div className="h-16 border-b border-border/60 bg-background" />

      <main className="flex-1 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <div className="mb-8 space-y-3">
            <Shimmer className="h-3.5 w-32 rounded-lg" />
            <div className="flex items-center gap-3">
              <Shimmer className="h-10 w-10 rounded-xl" />
              <div className="space-y-1.5">
                <Shimmer className="h-7 w-40 rounded-lg" />
                <Shimmer className="h-4 w-52 rounded-lg" />
              </div>
            </div>
          </div>

          <ListingGridSkeleton count={6} />
        </div>
      </main>
    </div>
  );
}

/* ─── Full-Page Spinner (Fallback) ─────────────────────────────────────── */

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-muted" />
          <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
        </div>
        <p className="text-sm font-medium text-muted-foreground skeleton-pulse">
          Loading...
        </p>
      </div>
    </div>
  );
}

export { Shimmer, Pulse };
