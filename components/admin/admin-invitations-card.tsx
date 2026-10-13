"use client";

import * as React from "react";
import {
  UserPlus,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  Mail,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getAdminInvitationsAction,
  revokeAdminInvitationAction,
  type AdminInvitationItem,
} from "@/app/admin/actions";
import { AdminInvitationsDialog } from "@/components/admin/admin-invitations-dialog";

export function AdminInvitationsCard() {
  const [invitations, setInvitations] = React.useState<AdminInvitationItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [actionMessage, setActionMessage] = React.useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchInvitations = React.useCallback(async () => {
    try {
      const res = await getAdminInvitationsAction();
      if (res.success) {
        setInvitations(res.invitations);
      }
    } catch (err) {
      console.warn("[AdminInvitationsCard] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let ignore = false;
    getAdminInvitationsAction()
      .then((res) => {
        if (!ignore && res.success) {
          setInvitations(res.invitations);
        }
      })
      .catch((err) => {
        console.warn("[AdminInvitationsCard] Fetch error:", err);
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleRevoke = async (inv: AdminInvitationItem) => {
    const idToRevoke = inv.clerk_invitation_id || inv.id;
    if (!idToRevoke) return;

    setRevokingId(idToRevoke);
    setActionMessage(null);

    try {
      const res = await revokeAdminInvitationAction(idToRevoke);
      if (res.success) {
        setActionMessage({
          text: `Invitation for ${inv.email} has been revoked.`,
          type: "success",
        });
        await fetchInvitations();
      } else {
        setActionMessage({
          text: res.error || "Failed to revoke invitation.",
          type: "error",
        });
      }
    } catch (err: unknown) {
      setActionMessage({
        text: (err as Error).message || "An unexpected error occurred while revoking.",
        type: "error",
      });
    } finally {
      setRevokingId(null);
    }
  };

  const pendingInvites = invitations.filter((i) => i.status === "pending");

  return (
    <Card className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-lg font-bold text-foreground">
              Administrator Invitations
            </h3>
            <Badge variant="outline" className="border-primary/30 text-primary text-xs">
              {pendingInvites.length} Pending
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Invite new administrators securely via Clerk Backend API with server-verified role promotion.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="font-semibold gap-1.5 shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            Invite Administrator
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchInvitations}
            disabled={loading}
            aria-label="Refresh invitations list"
            className="h-9 w-9 p-0"
          >
            <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Notification banner */}
      {actionMessage && (
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-xs font-medium border shadow-sm ${
            actionMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-muted-foreground hover:text-foreground ml-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Invitations List / Table */}
      {loading && invitations.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Loading administrator invitations...</span>
        </div>
      ) : invitations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-muted/20 space-y-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">No pending admin invitations</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm mx-auto">
              Click &quot;Invite Administrator&quot; above to invite authorized colleagues to manage platform governance.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-background">
          {invitations.map((inv) => {
            const isPending = inv.status === "pending";
            const isRevoked = inv.status === "revoked";
            const isAccepted = inv.status === "accepted";
            const isRevoking = revokingId === (inv.clerk_invitation_id || inv.id);

            return (
              <div
                key={inv.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">
                        {inv.email}
                      </span>
                      {isPending && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 bg-amber-500/10 text-amber-600 text-[10px] font-semibold gap-1"
                        >
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                      {isAccepted && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold gap-1"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          Accepted
                        </Badge>
                      )}
                      {isRevoked && (
                        <Badge
                          variant="outline"
                          className="border-destructive/30 bg-destructive/10 text-destructive text-[10px] font-semibold gap-1"
                        >
                          <XCircle className="h-3 w-3" />
                          Revoked
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                      <span>Invited: {new Date(inv.created_at).toLocaleDateString()}</span>
                      <span>Role: Administrator</span>
                    </div>
                  </div>
                </div>

                {isPending && (
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isRevoking}
                      onClick={() => handleRevoke(inv)}
                      className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10 h-8 font-semibold"
                    >
                      {isRevoking ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Revoking...
                        </>
                      ) : (
                        "Revoke"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Invite Modal Dialog */}
      <AdminInvitationsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchInvitations}
      />
    </Card>
  );
}
