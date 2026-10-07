import { getAdminUsers } from "@/lib/supabase/admin";
import { AdminUsersTable } from "@/components/admin/admin-users-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "User Management | Admin",
  description: "Governance, account status management, restrictions, and penalties for platform users.",
};

export default async function AdminUsersPage() {
  const users = await getAdminUsers();

  return <AdminUsersTable initialUsers={users} />;
}
