import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy equipment management route.
 * Redirects visitors directly to the consolidated marketplace dashboard at /dashboard.
 */
export default function EquipmentManagementPage() {
  redirect("/dashboard");
}
