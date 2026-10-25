import { DashboardTabsSkeleton } from "@/components/ui/skeletons";

/**
 * Route-level loading state for /dashboard.
 * Renders a skeleton matching the dashboard layout: header, tabs, stats grid,
 * and booking/listing item lists.
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      {/* Navbar placeholder */}
      <div className="h-16 border-b border-border/60 bg-background" />

      <main className="flex-1 py-8 sm:py-12 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8 space-y-2">
            <div className="skeleton-shimmer h-9 w-64 rounded-xl" />
            <div className="skeleton-shimmer h-4 w-96 rounded-lg" />
          </div>

          <DashboardTabsSkeleton />
        </div>
      </main>
    </div>
  );
}
