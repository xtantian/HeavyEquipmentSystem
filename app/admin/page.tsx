import { getAdminOverviewStats } from "@/lib/supabase/admin";
import { AdminOverview } from "@/components/admin/admin-overview";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Overview | Heavy Equipment System",
  description: "Platform analytics, registered accounts, fleet inventory, and active rental status.",
};

export default async function AdminOverviewPage() {
  const stats = await getAdminOverviewStats();

  return <AdminOverview stats={stats} />;
}
