"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Search,
  Eye,
  ShieldAlert,
  RotateCcw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Filter,
  ExternalLink,
  Image as ImageIcon,
  Clock,
  Layers,
  Flag,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import type { MarketplaceListingItem } from "@/lib/marketplace/mock-listings";
import type { ListingStatus } from "@/lib/supabase/types";
import {
  restrictListingAction,
  restoreListingAction,
  softDeleteListingAction,
} from "@/app/admin/actions";
import { AdminConfirmDialog } from "@/components/admin/admin-confirm-dialog";

interface AdminListingsTableProps {
  initialListings: MarketplaceListingItem[];
}

export function AdminListingsTable({ initialListings }: AdminListingsTableProps) {
  const [listings, setListings] = React.useState<MarketplaceListingItem[]>(initialListings);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // Notification Banner
  const [notification, setNotification] = React.useState<{ text: string; type: "success" | "error" } | null>(null);

  // View Listing Details Modal
  const [viewingItem, setViewingItem] = React.useState<MarketplaceListingItem | null>(null);

  // Confirmation Dialog States
  const [confirmDialog, setConfirmDialog] = React.useState<{
    open: boolean;
    type: "restrict" | "delete" | "restore";
    item: MarketplaceListingItem | null;
    reason: string;
    loading: boolean;
  }>({
    open: false,
    type: "restrict",
    item: null,
    reason: "",
    loading: false,
  });

  const showNotification = (text: string, type: "success" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Filter listings
  const filteredListings = React.useMemo(() => {
    return listings.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.owner_id && item.owner_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.category?.name && item.category.name.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesStatus = true;
      if (statusFilter === "reported") {
        matchesStatus = Boolean(item.is_reported || item.report_reason);
      } else if (statusFilter !== "all") {
        matchesStatus = item.status === statusFilter;
      }

      return matchesSearch && matchesStatus;
    });
  }, [listings, searchQuery, statusFilter]);

  // Execute confirmed actions
  const handleConfirmAction = async () => {
    const { type, item, reason } = confirmDialog;
    if (!item) return;

    setConfirmDialog((prev) => ({ ...prev, loading: true }));

    try {
      if (type === "restrict") {
        // Optimistic update
        setListings((prev) =>
          prev.map((l) => (l.id === item.id ? { ...l, status: "restricted" as ListingStatus, report_reason: reason } : l))
        );
        const res = await restrictListingAction(item.id, reason);
        if (res.error) {
          showNotification(res.error, "error");
        } else {
          showNotification(`Listing "${item.title}" is now restricted and hidden from public browse.`, "success");
        }
      } else if (type === "restore") {
        // Optimistic update
        setListings((prev) =>
          prev.map((l) => (l.id === item.id ? { ...l, status: "available" as ListingStatus, report_reason: null, is_reported: false } : l))
        );
        const res = await restoreListingAction(item.id);
        if (res.error) {
          showNotification(res.error, "error");
        } else {
          showNotification(`Listing "${item.title}" has been restored to available status.`, "success");
        }
      } else if (type === "delete") {
        // Optimistic update (soft-delete status)
        setListings((prev) =>
          prev.map((l) => (l.id === item.id ? { ...l, status: "deleted" as ListingStatus, report_reason: reason } : l))
        );
        const res = await softDeleteListingAction(item.id, reason);
        if (res.error) {
          showNotification(res.error, "error");
        } else {
          showNotification(`Listing "${item.title}" soft-deleted. Historical rental records remain preserved.`, "success");
        }
      }
    } catch (err: unknown) {
      showNotification((err as Error).message || "Operation failed", "error");
    } finally {
      setConfirmDialog({
        open: false,
        type: "restrict",
        item: null,
        reason: "",
        loading: false,
      });
    }
  };

  const renderStatusBadge = (status: string, isReported?: boolean) => {
    if (isReported) {
      return (
        <Badge variant="destructive" className="gap-1 text-[11px] font-semibold">
          <Flag className="h-3 w-3" /> Reported
        </Badge>
      );
    }

    switch (status) {
      case "available":
        return (
          <Badge className="bg-emerald-600 text-white text-[11px] font-semibold">
            Available
          </Badge>
        );
      case "rented":
        return (
          <Badge className="bg-blue-600 text-white text-[11px] font-semibold">
            Rented
          </Badge>
        );
      case "maintenance":
        return (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[11px] font-semibold">
            Maintenance
          </Badge>
        );
      case "restricted":
        return (
          <Badge variant="destructive" className="text-[11px] font-semibold">
            Restricted / Hidden
          </Badge>
        );
      case "pending_review":
        return (
          <Badge variant="secondary" className="text-[11px] font-semibold">
            Pending Review
          </Badge>
        );
      case "deleted":
        return (
          <Badge variant="outline" className="border-destructive/30 text-destructive text-[11px] font-semibold">
            Soft-Deleted
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
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

      {/* ── Header & Search / Filter Controls ────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
            Equipment Listing Management
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Monitor, restrict, restore, and review machinery items across the marketplace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search title, category, owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 pr-3 text-xs bg-background rounded-lg border-border/80"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            <option value="all">All Statuses ({listings.length})</option>
            <option value="available">Available</option>
            <option value="restricted">Restricted / Hidden</option>
            <option value="reported">Reported / Flagged</option>
            <option value="pending_review">Pending Review</option>
            <option value="rented">Rented</option>
            <option value="maintenance">Maintenance</option>
            <option value="deleted">Soft-Deleted</option>
          </select>
        </div>
      </div>

      {/* ── Listings Table / Cards ────────────────────────────── */}
      {filteredListings.length > 0 ? (
        <div className="space-y-3">
          {filteredListings.map((item) => {
            const photo =
              (item.listing_images?.[0] as { url?: string; image_url?: string } | undefined)?.url ||
              item.listing_images?.[0]?.image_url ||
              item.images?.[0];

            const isRestricted = item.status === "restricted";
            const isDeleted = item.status === "deleted";
            const isReported = Boolean(item.is_reported || item.report_reason);

            return (
              <Card
                key={item.id}
                className={`overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all shadow-sm ${
                  isRestricted
                    ? "border-destructive/30 bg-destructive/5"
                    : isDeleted
                    ? "border-border/60 bg-muted/20 opacity-75"
                    : "border-border/80 bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Thumbnail & Details */}
                  <div className="flex items-start gap-4">
                    <div className="relative h-20 w-24 sm:h-24 sm:w-32 shrink-0 overflow-hidden rounded-xl bg-muted border border-border/60">
                      {photo ? (
                        <Image src={photo} alt={item.title} fill className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-6 w-6 stroke-[1.5]" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs font-semibold">
                          {item.category?.name || "Equipment"}
                        </Badge>
                        <span className="text-muted-foreground/60">•</span>
                        <span className="text-xs font-mono text-muted-foreground">
                          Owner: {item.owner_id ? `${item.owner_id.slice(0, 14)}...` : "System"}
                        </span>
                        {renderStatusBadge(item.status, isReported)}
                      </div>

                      <h3 className="font-heading text-base sm:text-lg font-bold text-foreground">
                        {item.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{item.location}</span>
                        <span className="font-semibold text-foreground">
                          {formatCurrency(item.price_per_day)} / day
                        </span>
                        {item.created_at && (
                          <span>Listed: {new Date(item.created_at).toLocaleDateString()}</span>
                        )}
                      </div>

                      {item.report_reason && (
                        <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1 text-xs text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>Flag Reason: {item.report_reason}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Actions: View, Restrict, Restore, Soft-Delete */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 lg:pt-0 border-t lg:border-t-0 border-border/60 self-start lg:self-center">
                    {/* View Details Modal Trigger */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingItem(item)}
                      className="h-8 text-xs font-medium cursor-pointer"
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      View Details
                    </Button>

                    {/* Restrict or Restore */}
                    {isRestricted || isDeleted ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfirmDialog({
                            open: true,
                            type: "restore",
                            item,
                            reason: "",
                            loading: false,
                          })
                        }
                        className="h-8 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 border-emerald-500/30 cursor-pointer"
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Restore Listing
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfirmDialog({
                            open: true,
                            type: "restrict",
                            item,
                            reason: "",
                            loading: false,
                          })
                        }
                        className="h-8 text-xs font-semibold text-amber-600 hover:bg-amber-50 hover:text-amber-700 border-amber-500/30 cursor-pointer"
                      >
                        <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
                        Restrict / Hide
                      </Button>
                    )}

                    {/* Soft Delete */}
                    {!isDeleted && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setConfirmDialog({
                            open: true,
                            type: "delete",
                            item,
                            reason: "",
                            loading: false,
                          })
                        }
                        className="h-8 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-12 text-center">
          <Layers className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="font-heading text-lg font-bold text-foreground">No listings match filter</h3>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Try adjusting your search keywords or resetting the status dropdown filter.
          </p>
        </Card>
      )}

      {/* ── View Listing Details Modal ───────────────────────── */}
      {viewingItem && (
        <Dialog open={Boolean(viewingItem)} onOpenChange={(open) => !open && setViewingItem(null)}>
          <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">
                {viewingItem.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Category: {viewingItem.category?.name || "Equipment"} • Location: {viewingItem.location}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Rental Rate</span>
                  <span className="font-bold text-foreground text-sm">
                    {formatCurrency(viewingItem.price_per_day)} / day
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Owner User ID</span>
                  <span className="font-mono text-foreground font-semibold">
                    {viewingItem.owner_id}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Status</span>
                  {renderStatusBadge(viewingItem.status, Boolean(viewingItem.is_reported))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                  Description
                </h4>
                <p className="text-xs text-muted-foreground whitespace-pre-line bg-muted/20 p-3 rounded-lg border border-border/60">
                  {viewingItem.description}
                </p>
              </div>

              {/* Attributes */}
              {viewingItem.attributes && Object.keys(viewingItem.attributes).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                    Technical Specifications
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(viewingItem.attributes as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className="p-2 rounded-lg bg-muted/30 border border-border/40">
                        <span className="text-muted-foreground block text-[10px] capitalize">
                          {k.replace(/_/g, " ")}
                        </span>
                        <span className="font-semibold text-foreground">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Link href={`/listings/${viewingItem.id}`} target="_blank">
                <Button variant="outline" size="sm" className="text-xs gap-1">
                  Public Listing Page <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
              <Button size="sm" onClick={() => setViewingItem(null)} className="text-xs font-semibold">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Confirmation Dialog for Restrict, Restore, and Delete ── */}
      <AdminConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={
          confirmDialog.type === "restrict"
            ? "Restrict & Hide Listing"
            : confirmDialog.type === "restore"
            ? "Restore Equipment Listing"
            : "Soft-Delete Listing"
        }
        description={
          confirmDialog.type === "restrict"
            ? `Restricting "${confirmDialog.item?.title}" will immediately hide it from the marketplace browse page and block new booking requests.`
            : confirmDialog.type === "restore"
            ? `Restoring "${confirmDialog.item?.title}" will clear restriction flags and make the unit active and bookable again.`
            : `Are you sure you want to soft-delete "${confirmDialog.item?.title}"? The item will be removed from marketplace browse, but past rental contracts and accounting history are preserved.`
        }
        confirmLabel={
          confirmDialog.type === "restrict"
            ? "Restrict Listing"
            : confirmDialog.type === "restore"
            ? "Restore to Available"
            : "Soft-Delete"
        }
        confirmVariant={
          confirmDialog.type === "restore" ? "default" : "destructive"
        }
        isLoading={confirmDialog.loading}
        onConfirm={handleConfirmAction}
        requireReason={confirmDialog.type === "restrict"}
        reasonPlaceholder="e.g., Inaccurate specs, safety complaint, or platform rule violation..."
        reasonValue={confirmDialog.reason}
        onReasonChange={(reason) => setConfirmDialog((prev) => ({ ...prev, reason }))}
      />
    </div>
  );
}
