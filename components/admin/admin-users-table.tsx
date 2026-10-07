"use client";

import * as React from "react";
import {
  Search,
  UserCheck,
  AlertTriangle,
  UserX,
  Trash2,
  RotateCcw,
  Eye,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  Layers,
  HardHat,
  Filter,
  CheckCircle2,
  XCircle,
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
import type { AdminUserItem } from "@/lib/supabase/admin";
import type { UserAccountStatus } from "@/lib/supabase/types";
import { updateUserAccountStatusAction } from "@/app/admin/actions";
import { AdminConfirmDialog } from "@/components/admin/admin-confirm-dialog";

interface AdminUsersTableProps {
  initialUsers: AdminUserItem[];
}

export function AdminUsersTable({ initialUsers }: AdminUsersTableProps) {
  const [users, setUsers] = React.useState<AdminUserItem[]>(initialUsers);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // Notification message
  const [notification, setNotification] = React.useState<{ text: string; type: "success" | "error" } | null>(null);

  // View User Details Modal
  const [viewingUser, setViewingUser] = React.useState<AdminUserItem | null>(null);

  // Confirmation Dialog
  const [confirmDialog, setConfirmDialog] = React.useState<{
    open: boolean;
    type: "restrict" | "unrestrict" | "ban" | "delete" | "restore";
    user: AdminUserItem | null;
    reason: string;
    loading: boolean;
  }>({
    open: false,
    type: "restrict",
    user: null,
    reason: "",
    loading: false,
  });

  const showNotification = (text: string, type: "success" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const filteredUsers = React.useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.clerk_user_id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || u.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, statusFilter]);

  const handleConfirmAction = async () => {
    const { type, user, reason } = confirmDialog;
    if (!user) return;

    setConfirmDialog((prev) => ({ ...prev, loading: true }));

    let newStatus: UserAccountStatus = "active";
    if (type === "restrict") newStatus = "restricted";
    if (type === "ban") newStatus = "banned";
    if (type === "delete") newStatus = "deleted";
    if (type === "restore" || type === "unrestrict") newStatus = "active";

    try {
      // Optimistic update
      setUsers((prev) =>
        prev.map((item) => (item.id === user.id ? { ...item, status: newStatus } : item))
      );

      const res = await updateUserAccountStatusAction(user.clerk_user_id, newStatus, reason);
      if (res.error) {
        showNotification(res.error, "error");
      } else {
        showNotification(
          `User "${user.name}" account status updated to "${newStatus.toUpperCase()}".`,
          "success"
        );
      }
    } catch (err: unknown) {
      showNotification((err as Error).message || "Failed to update account status", "error");
    } finally {
      setConfirmDialog({
        open: false,
        type: "restrict",
        user: null,
        reason: "",
        loading: false,
      });
    }
  };

  const renderStatusBadge = (status: UserAccountStatus) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-emerald-600 text-white text-[11px] font-semibold gap-1">
            <CheckCircle2 className="h-3 w-3" /> Active
          </Badge>
        );
      case "restricted":
        return (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[11px] font-semibold gap-1">
            <AlertTriangle className="h-3 w-3" /> Restricted
          </Badge>
        );
      case "banned":
        return (
          <Badge variant="destructive" className="text-[11px] font-semibold gap-1">
            <UserX className="h-3 w-3" /> Banned
          </Badge>
        );
      case "deleted":
        return (
          <Badge variant="outline" className="border-destructive/30 text-destructive text-[11px] font-semibold gap-1">
            <XCircle className="h-3 w-3" /> Deleted
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

      {/* ── Header & Search Controls ─────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
            User Account Management
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Monitor registered users, review rental history, enforce account restrictions, and apply penalties.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search user name, email, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 pr-3 text-xs bg-background rounded-lg border-border/80"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            <option value="all">All Statuses ({users.length})</option>
            <option value="active">Active Only</option>
            <option value="restricted">Restricted</option>
            <option value="banned">Banned</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
      </div>

      {/* ── User Table ───────────────────────────────────────── */}
      {filteredUsers.length > 0 ? (
        <Card className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border/80 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">User</th>
                  <th className="px-4 py-3.5">Email</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Account Status</th>
                  <th className="px-4 py-3.5">Rentals</th>
                  <th className="px-4 py-3.5">Registration</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredUsers.map((u) => {
                  return (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                      {/* Name */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs uppercase">
                            {u.name.slice(0, 2)}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground block">
                              {u.name}
                            </span>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {u.clerk_user_id.slice(0, 16)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-4 whitespace-nowrap text-muted-foreground font-medium">
                        {u.email}
                      </td>

                      {/* Role */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <Badge
                          variant={u.role === "admin" ? "default" : "secondary"}
                          className="text-[10px] font-semibold capitalize"
                        >
                          {u.role}
                        </Badge>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {renderStatusBadge(u.status)}
                      </td>

                      {/* Number of Rentals */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="font-semibold text-foreground">
                          {u.rentalCount}
                        </span>{" "}
                        <span className="text-muted-foreground">hires</span>
                      </td>

                      {/* Registration Date */}
                      <td className="px-4 py-4 whitespace-nowrap text-muted-foreground">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View details */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingUser(u)}
                            className="h-7 text-xs px-2 cursor-pointer"
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            View
                          </Button>

                          {/* Unrestrict / Restore buttons */}
                          {u.status === "restricted" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setConfirmDialog({
                                  open: true,
                                  type: "unrestrict",
                                  user: u,
                                  reason: "",
                                  loading: false,
                                })
                              }
                              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-500/30 cursor-pointer"
                            >
                              Unrestrict
                            </Button>
                          )}

                          {(u.status === "banned" || u.status === "deleted") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setConfirmDialog({
                                  open: true,
                                  type: "restore",
                                  user: u,
                                  reason: "",
                                  loading: false,
                                })
                              }
                              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-500/30 cursor-pointer"
                            >
                              <RotateCcw className="mr-1 h-3 w-3" />
                              Restore
                            </Button>
                          )}

                          {/* Restrict action */}
                          {u.status === "active" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setConfirmDialog({
                                  open: true,
                                  type: "restrict",
                                  user: u,
                                  reason: "",
                                  loading: false,
                                })
                              }
                              className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 cursor-pointer"
                            >
                              Restrict
                            </Button>
                          )}

                          {/* Ban action */}
                          {u.status !== "banned" && u.status !== "deleted" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setConfirmDialog({
                                  open: true,
                                  type: "ban",
                                  user: u,
                                  reason: "",
                                  loading: false,
                                })
                              }
                              className="h-7 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                            >
                              Ban
                            </Button>
                          )}

                          {/* Delete action */}
                          {u.status !== "deleted" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setConfirmDialog({
                                  open: true,
                                  type: "delete",
                                  user: u,
                                  reason: "",
                                  loading: false,
                                })
                              }
                              className="h-7 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-12 text-center">
          <UserX className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="font-heading text-lg font-bold text-foreground">No accounts match criteria</h3>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Try adjusting your search query or clearing the status dropdown filter.
          </p>
        </Card>
      )}

      {/* ── View User Modal ──────────────────────────────────── */}
      {viewingUser && (
        <Dialog open={Boolean(viewingUser)} onOpenChange={(open) => !open && setViewingUser(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <span>{viewingUser.name}</span>
                {renderStatusBadge(viewingUser.status)}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Clerk ID: <span className="font-mono text-foreground">{viewingUser.clerk_user_id}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/30 p-3 border border-border/60">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Email Address</span>
                  <span className="font-semibold text-foreground truncate block">{viewingUser.email}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">System Role</span>
                  <span className="font-semibold text-foreground capitalize">{viewingUser.role}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Total Rentals Completed</span>
                  <span className="font-semibold text-foreground">{viewingUser.rentalCount} bookings</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Listings Posted</span>
                  <span className="font-semibold text-foreground">{viewingUser.listingCount} items</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/20 border border-border/40">
                <span className="text-muted-foreground block text-[11px]">Registration Date</span>
                <span className="font-semibold text-foreground">
                  {viewingUser.created_at ? new Date(viewingUser.created_at).toLocaleString() : "—"}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button size="sm" onClick={() => setViewingUser(null)} className="text-xs font-semibold">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Confirmation Dialog for Ban, Restrict, Delete, Restore ── */}
      <AdminConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={
          confirmDialog.type === "restrict"
            ? "Restrict User Account"
            : confirmDialog.type === "unrestrict"
            ? "Unrestrict Account"
            : confirmDialog.type === "ban"
            ? "Ban User from Platform"
            : confirmDialog.type === "delete"
            ? "Delete User Account"
            : "Restore User Account"
        }
        description={
          confirmDialog.type === "restrict"
            ? `Restricting ${confirmDialog.user?.name} will prevent them from posting new listings or requesting rentals.`
            : confirmDialog.type === "unrestrict"
            ? `Unrestricting ${confirmDialog.user?.name} will restore standard booking and listing capabilities.`
            : confirmDialog.type === "ban"
            ? `Banning ${confirmDialog.user?.name} will terminate their access and suspend their active listings.`
            : confirmDialog.type === "delete"
            ? `Soft-deleting ${confirmDialog.user?.name} marks the account deleted while safeguarding contractual rental records.`
            : `Restoring ${confirmDialog.user?.name} returns their account to active status.`
        }
        confirmLabel={
          confirmDialog.type === "restrict"
            ? "Restrict Account"
            : confirmDialog.type === "unrestrict"
            ? "Unrestrict"
            : confirmDialog.type === "ban"
            ? "Ban Account"
            : confirmDialog.type === "delete"
            ? "Delete Account"
            : "Restore Account"
        }
        confirmVariant={
          confirmDialog.type === "restore" || confirmDialog.type === "unrestrict"
            ? "default"
            : "destructive"
        }
        isLoading={confirmDialog.loading}
        onConfirm={handleConfirmAction}
        requireReason={confirmDialog.type === "restrict" || confirmDialog.type === "ban"}
        reasonPlaceholder="e.g. Terms of Service violation, non-payment, or safety breach..."
        reasonValue={confirmDialog.reason}
        onReasonChange={(reason) => setConfirmDialog((prev) => ({ ...prev, reason }))}
      />
    </div>
  );
}
