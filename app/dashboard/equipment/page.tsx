import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EquipmentRow, EquipmentCategoryRow, EquipmentStatus } from "@/lib/supabase/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { HardHat, Truck, Layers, AlertCircle } from "lucide-react";

/**
 * Status badge helper matching the rental operational lifecycle.
 */
function StatusBadge({ status }: { status: EquipmentStatus }) {
  switch (status) {
    case "available":
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          Available
        </span>
      );
    case "reserved":
      return (
        <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
          Reserved
        </span>
      );
    case "maintenance":
      return (
        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
          Maintenance
        </span>
      );
    case "inactive":
      return (
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
          Inactive
        </span>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default async function EquipmentManagementPage() {
  const supabase = await createSupabaseServerClient();

  // 1. Fetch equipment from Supabase
  const { data: equipment, error: equipmentError } = await supabase
    .from("equipment")
    .select("*")
    .order("name", { ascending: true });

  // 2. Fetch categories from Supabase
  const { data: categories, error: categoriesError } = await supabase
    .from("equipment_categories")
    .select("*")
    .order("name", { ascending: true });

  // Map category IDs to category names for fast display lookup
  const categoryMap = new Map<string, string>();
  if (categories) {
    for (const cat of categories) {
      categoryMap.set(cat.id, cat.name);
    }
  }

  const equipmentList: EquipmentRow[] = equipment ?? [];
  const categoryList: EquipmentCategoryRow[] = categories ?? [];

  // Summary counts for dashboard overview
  const totalCount = equipmentList.length;
  const availableCount = equipmentList.filter((e) => e.status === "available").length;
  const reservedCount = equipmentList.filter((e) => e.status === "reserved").length;
  const maintenanceCount = equipmentList.filter((e) => e.status === "maintenance").length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <HardHat className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Equipment Management
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Manage and monitor physical machinery inventory across all job sites.
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground sm:text-sm"
          >
            ← Back to Home
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Quick Fleet Metrics */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <span className="text-xs font-medium text-muted-foreground">Total Fleet</span>
            <p className="mt-1 text-2xl font-bold">{totalCount}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Available Units
            </span>
            <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {availableCount}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              Reserved Units
            </span>
            <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
              {reservedCount}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              In Maintenance
            </span>
            <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
              {maintenanceCount}
            </p>
          </div>
        </div>

        {/* Database Error Alert */}
        {(equipmentError || categoriesError) && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Unable to fetch equipment from database</p>
              <p className="mt-1 opacity-90">
                {equipmentError?.message || categoriesError?.message}. Make sure migration 002 is
                applied to your Supabase project.
              </p>
            </div>
          </div>
        )}

        {/* Equipment Table Card */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold text-card-foreground">Fleet Inventory</h2>
            <p className="text-xs text-muted-foreground">
              Live equipment status and pricing records connected directly to Supabase.
            </p>
          </div>

          {equipmentList.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Truck className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold">No equipment found</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                There are no equipment records in the database. Apply migration 002 to insert sample
                records.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Daily Rate</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipmentList.map((item) => {
                  const categoryName = categoryMap.get(item.category_id) || "Uncategorized";
                  const formattedDailyRate = new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(item.daily_rate);

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <Truck className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold leading-tight">{item.name}</p>
                            {item.operating_weight && (
                              <p className="text-[11px] text-muted-foreground">
                                {item.operating_weight}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Layers className="h-3.5 w-3.5" />
                          {categoryName}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.model}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-foreground">
                        {formattedDailyRate}
                        <span className="text-xs font-normal text-muted-foreground"> / day</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}
