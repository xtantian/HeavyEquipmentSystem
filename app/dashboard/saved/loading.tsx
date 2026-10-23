import { SavedListingsSkeleton } from "@/components/ui/skeletons";

/**
 * Route-level loading state for /dashboard/saved.
 * Renders a skeleton matching the saved listings page with header, breadcrumb,
 * and listing cards grid.
 */
export default function SavedListingsLoading() {
  return <SavedListingsSkeleton />;
}
