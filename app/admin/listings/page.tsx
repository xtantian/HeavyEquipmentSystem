import { getAdminAllListings } from "@/lib/supabase/admin";
import { AdminListingsTable } from "@/components/admin/admin-listings-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Equipment Listing Management | Admin",
  description: "View, filter, restrict, soft-delete, and restore heavy equipment listings.",
};

export default async function AdminListingsPage() {
  const listings = await getAdminAllListings();

  return <AdminListingsTable initialListings={listings} />;
}
