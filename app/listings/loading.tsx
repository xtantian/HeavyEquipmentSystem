import { MarketplaceBrowseSkeleton } from "@/components/ui/skeletons";

/**
 * Route-level loading state for /listings.
 * Renders a full-page marketplace browse skeleton matching the listing grid,
 * search filters, and category tabs layout.
 */
export default function ListingsLoading() {
  return <MarketplaceBrowseSkeleton />;
}
