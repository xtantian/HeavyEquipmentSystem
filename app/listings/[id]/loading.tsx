import { ListingDetailSkeleton } from "@/components/ui/skeletons";

/**
 * Route-level loading state for /listings/[id].
 * Renders a two-column skeleton matching the listing detail layout:
 * gallery, title, host profile, description, specs on the left;
 * booking card on the right.
 */
export default function ListingDetailLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      {/* Navbar placeholder */}
      <div className="h-16 border-b border-border/60 bg-background" />

      <main className="flex-1 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Back link */}
          <div className="mb-6 flex items-center justify-between">
            <div className="skeleton-shimmer h-3.5 w-32 rounded-lg" />
            <div className="flex gap-2">
              <div className="skeleton-shimmer h-5 w-16 rounded-full" />
              <div className="skeleton-shimmer h-5 w-24 rounded-full" />
            </div>
          </div>

          <ListingDetailSkeleton />
        </div>
      </main>
    </div>
  );
}
