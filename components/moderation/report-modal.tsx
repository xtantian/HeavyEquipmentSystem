"use client";

import * as React from "react";
import { Flag, AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { submitReportAction } from "@/app/actions/reports";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: "listing" | "profile";
  targetId: string;
  targetTitle: string;
  targetOwnerId?: string;
  currentUserId?: string;
}

const LISTING_REASONS = [
  "Suspected duplicate equipment",
  "False or misleading information",
  "Suspected fraud or ownership misrepresentation",
  "Inappropriate or stolen images",
  "Incorrect price or availability",
  "Other platform violation",
];

const PROFILE_REASONS = [
  "Suspected fraud or impersonation",
  "Harassment or abusive behavior",
  "Misleading identity or equipment ownership claims",
  "Repeated duplicate listings",
  "Spam or unsolicited advertising",
  "Other platform violation",
];

export function ReportModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetTitle,
  targetOwnerId,
  currentUserId,
}: ReportModalProps) {
  const [reason, setReason] = React.useState<string>("");
  const [details, setDetails] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSuccess, setIsSuccess] = React.useState<boolean>(false);

  const handleClose = () => {
    setReason("");
    setDetails("");
    setErrorMessage(null);
    setIsSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  const reasonsList = targetType === "listing" ? LISTING_REASONS : PROFILE_REASONS;

  const isSelfReport = Boolean(targetOwnerId && currentUserId && targetOwnerId === currentUserId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSelfReport) {
      setErrorMessage(`You cannot report your own ${targetType === "listing" ? "equipment listing" : "profile"}.`);
      return;
    }
    if (!reason) {
      setErrorMessage("Please select a reason for reporting.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await submitReportAction({
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to submit report.");
        setIsSubmitting(false);
      } else {
        setIsSuccess(true);
        setIsSubmitting(false);
        setTimeout(() => {
          handleClose();
        }, 2200);
      }
    } catch {
      setErrorMessage("A network error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <Flag className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading text-lg font-bold text-foreground">
                Report {targetType === "listing" ? "Equipment Listing" : "User Profile"}
              </h3>
              <p className="text-xs text-muted-foreground line-clamp-1">
                Target: <span className="font-semibold text-foreground">{targetTitle}</span>
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClose}
            disabled={isSubmitting}
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h4 className="font-heading text-base font-bold text-foreground">
              Report Submitted
            </h4>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Thank you for keeping Rent It safe. Our moderation team will review this report and take appropriate action.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSelfReport && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>You are registered as the owner of this {targetType === "listing" ? "equipment listing" : "profile"}. Platform integrity policies do not allow self-reporting.</span>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Reason Radio / Select */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Reason for Reporting <span className="text-destructive">*</span>
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {reasonsList.map((r) => (
                  <label
                    key={r}
                    className={`flex items-center gap-3 rounded-xl border p-2.5 text-xs font-medium cursor-pointer transition-colors ${
                      reason === r
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border/80 text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="report_reason"
                      value={r}
                      checked={reason === r}
                      onChange={(e) => setReason(e.target.value)}
                      className="text-primary focus:ring-primary"
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Additional Details */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Additional Details (Optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Provide context, links, or specific discrepancies to assist the moderation review..."
                maxLength={1000}
                rows={3}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>Reports are confidential</span>
                <span>{details.length}/1000</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/80">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={isSubmitting}
                className="text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={isSubmitting || !reason || isSelfReport}
                className="text-xs font-semibold cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Report"
                )}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
