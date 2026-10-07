"use client";

import * as React from "react";
import Link from "next/link";
import {
  Flag,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Trash2,
  ExternalLink,
  Eye,
  Filter,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AdminReportItem } from "@/lib/supabase/admin";
import {
  restrictListingAction,
  softDeleteListingAction,
  dismissReportAction,
} from "@/app/admin/actions";
import { AdminConfirmDialog } from "@/components/admin/admin-confirm-dialog";

interface AdminReportsTableProps {
  initialReports: AdminReportItem[];
}

export function AdminReportsTable({ initialReports }: AdminReportsTableProps) {
  const [reports, setReports] = React.useState<AdminReportItem[]>(initialReports);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [notification, setNotification] = React.useState<{ text: string; type: "success" | "error" } | null>(null);

  // Dialog State
  const [confirmDialog, setConfirmDialog] = React.useState<{
    open: boolean;
    type: "restrict" | "delete" | "dismiss";
    report: AdminReportItem | null;
    loading: boolean;
  }>({
    open: false,
    type: "restrict",
    report: null,
    loading: false,
  });

  const showNotification = (text: string, type: "success" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const filteredReports = React.useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter === "all") return true;
      return r.status === statusFilter;
    });
  }, [reports, statusFilter]);

  const handleConfirmAction = async () => {
    const { type, report } = confirmDialog;
    if (!report) return;

    setConfirmDialog((prev) => ({ ...prev, loading: true }));

    try {
      if (type === "restrict") {
        setReports((prev) =>
          prev.map((r) => (r.id === report.id ? { ...r, status: "action_taken" } : r))
        );
        const res = await restrictListingAction(report.listing_id, report.reason);
        if (res.error) {
          showNotification(res.error, "error");
        } else {
          showNotification(`Listing restricted following violation review.`, "success");
        }
      } else if (type === "delete") {
        setReports((prev) =>
          prev.map((r) => (r.id === report.id ? { ...r, status: "action_taken" } : r))
        );
        const res = await softDeleteListingAction(report.listing_id, report.reason);
        if (res.error) {
          showNotification(res.error, "error");
        } else {
          showNotification(`Listing soft-deleted.`, "success");
        }
      } else if (type === "dismiss") {
        setReports((prev) =>
          prev.map((r) => (r.id === report.id ? { ...r, status: "dismissed" } : r))
        );
        const res = await dismissReportAction(report.id, report.listing_id);
        if (res.error) {
          showNotification(res.error, "error");
        } else {
          showNotification("Report marked as dismissed.", "success");
        }
      }
    } catch (err: unknown) {
      showNotification((err as Error).message || "Operation failed", "error");
    } finally {
      setConfirmDialog({
        open: false,
        type: "restrict",
        report: null,
        loading: false,
      });
    }
  };

  return (
    <div className="space-y-6">
      {notification && (
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium border shadow-sm animate-in fade-in ${
            notification.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          <span>{notification.text}</span>
          <button onClick={() => setNotification(null)} className="ml-3 text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
            Platform Violation Reports
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Review equipment listings reported by renters and contractors for safety, spec inaccuracies, or policy fraud.
          </p>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer self-start sm:self-auto"
        >
          <option value="all">All Reports ({reports.length})</option>
          <option value="pending">Pending Review</option>
          <option value="action_taken">Action Taken</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {filteredReports.length > 0 ? (
        <div className="space-y-3">
          {filteredReports.map((r) => {
            const isPending = r.status === "pending";

            return (
              <Card
                key={r.id}
                className={`overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all shadow-sm ${
                  isPending
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border/80 bg-card"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="destructive" className="text-xs font-bold gap-1">
                        <AlertTriangle className="h-3 w-3" /> {r.reason}
                      </Badge>
                      <Badge
                        variant={r.status === "pending" ? "default" : "secondary"}
                        className="text-[10px] capitalize"
                      >
                        Status: {r.status.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Reported on: {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="font-heading text-base sm:text-lg font-bold text-foreground">
                      Target Listing: {r.listing_title}
                    </h3>

                    {r.details && (
                      <p className="text-xs text-muted-foreground bg-background/60 p-2.5 rounded-lg border border-border/40">
                        &ldquo;{r.details}&rdquo;
                      </p>
                    )}

                    <div className="text-[11px] text-muted-foreground">
                      Submitted by: <span className="font-mono">{r.reporter_id}</span>{" "}
                      {r.reporter_email && `(${r.reporter_email})`}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-3 lg:pt-0 border-t lg:border-t-0 border-border/60 self-start lg:self-center">
                    <Link href={`/listings/${r.listing_id}`} target="_blank">
                      <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1">
                        View Unit <ExternalLink className="h-3 w-3" />
                      </Button>
                    </Link>

                    {isPending && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setConfirmDialog({
                              open: true,
                              type: "restrict",
                              report: r,
                              loading: false,
                            })
                          }
                          className="h-8 text-xs font-semibold text-amber-600 hover:bg-amber-50 hover:text-amber-700 border-amber-500/30 cursor-pointer"
                        >
                          <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                          Restrict Unit
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setConfirmDialog({
                              open: true,
                              type: "dismiss",
                              report: r,
                              loading: false,
                            })
                          }
                          className="h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Dismiss Report
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-12 text-center">
          <Flag className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="font-heading text-lg font-bold text-foreground">No reports found</h3>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            No equipment violation reports are pending for this filter.
          </p>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <AdminConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={
          confirmDialog.type === "restrict"
            ? "Restrict Reported Equipment"
            : confirmDialog.type === "delete"
            ? "Soft-Delete Reported Unit"
            : "Dismiss Violation Report"
        }
        description={
          confirmDialog.type === "restrict"
            ? `Take action on report by restricting "${confirmDialog.report?.listing_title}". This will immediately hide it from public browse.`
            : confirmDialog.type === "dismiss"
            ? `Dismiss this report if you determined that the equipment complies with platform rules.`
            : `Soft-delete "${confirmDialog.report?.listing_title}".`
        }
        confirmLabel={
          confirmDialog.type === "restrict"
            ? "Restrict Listing"
            : confirmDialog.type === "dismiss"
            ? "Dismiss"
            : "Delete"
        }
        confirmVariant={
          confirmDialog.type === "dismiss" ? "default" : "destructive"
        }
        isLoading={confirmDialog.loading}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}
