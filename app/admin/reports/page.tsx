import { getAdminReports } from "@/lib/supabase/admin";
import { AdminReportsTable } from "@/components/admin/admin-reports-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reports & Platform Violations | Admin",
  description: "Review and take action on equipment listings reported by renters.",
};

export default async function AdminReportsPage() {
  const reports = await getAdminReports();

  return <AdminReportsTable initialReports={reports} />;
}
