import { ProfileSkeleton } from "@/components/ui/skeletons";

/**
 * Route-level loading state for /profile/[id].
 * Renders a skeleton matching the public lister profile page layout:
 * avatar banner card, active listings grid, and reviews list.
 */
export default function ProfileLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      {/* Navbar placeholder */}
      <div className="h-16 border-b border-border/60 bg-background" />

      <main className="flex-1 py-8 sm:py-12 bg-muted/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Back link */}
          <div className="mb-6">
            <div className="skeleton-shimmer h-3.5 w-36 rounded-lg" />
          </div>

          <ProfileSkeleton />
        </div>
      </main>
    </div>
  );
}
