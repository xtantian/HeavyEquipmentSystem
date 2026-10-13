"use client";

import * as React from "react";
import { UserPlus, Loader2, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { inviteAdminAction } from "@/app/admin/actions";

interface AdminInvitationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AdminInvitationsDialog({
  open,
  onOpenChange,
  onSuccess,
}: AdminInvitationsDialogProps) {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const handleClose = () => {
    if (loading) return;
    setEmail("");
    setError(null);
    setSuccessMessage(null);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter an email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await inviteAdminAction(trimmed);
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }

      setSuccessMessage(
        `Administrator invitation sent successfully to ${trimmed}. The invitee will receive an email to complete setup.`
      );
      setEmail("");
      setLoading(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      setError((err as Error).message || "An unexpected error occurred while sending the invitation.");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl">
        <DialogHeader className="space-y-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-1">
            <UserPlus className="h-5 w-5" />
          </div>
          <DialogTitle className="font-heading text-lg sm:text-xl font-bold text-foreground">
            Invite Administrator
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Send an official Clerk invitation to delegate platform governance privileges. Privileges will be granted through server-verified authorization upon sign-up.
          </DialogDescription>
        </DialogHeader>

        {successMessage ? (
          <div className="py-4 space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <p className="leading-relaxed">{successMessage}</p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} className="w-full font-semibold">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email" className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Invitee Email Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="invite-email"
                type="email"
                required
                disabled={loading}
                placeholder="colleague@domain.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                className="h-10 rounded-xl bg-background"
                autoFocus
              />
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-muted/50 border border-border/60 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              <span>Role: <strong>Administrator</strong> (Server-governed via Clerk Backend)</span>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={handleClose}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full sm:w-auto font-semibold gap-1.5"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Send Invitation
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
