"use client";

import * as React from "react";
import { Loader2, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StarRating } from "./star-rating";
import {
  submitListerReviewAction,
  submitRenterReviewAction,
  submitPreliminaryFeedbackAction,
} from "@/app/actions/reviews";

export type ReviewModalMode = "lister" | "renter" | "coordination";

interface WriteListerReviewModalProps {
  bookingId: string;
  listerName: string;
  mode?: ReviewModalMode;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function WriteListerReviewModal({
  bookingId,
  listerName,
  mode = "lister",
  isOpen,
  onClose,
  onSuccess,
}: WriteListerReviewModalProps) {
  const [rating, setRating] = React.useState<number>(5);
  const [punctualityScore, setPunctualityScore] = React.useState<number>(5);
  const [comment, setComment] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (mode === "coordination") {
        const res = await submitPreliminaryFeedbackAction({
          bookingId,
          communicationScore: rating,
          punctualityScore: punctualityScore,
          coordinationNotes: comment.trim() || undefined,
        });

        if (res.error) {
          setErrorMessage(res.error);
          setIsSubmitting(false);
        } else {
          setIsSubmitting(false);
          onSuccess();
          onClose();
        }
      } else if (mode === "renter") {
        const res = await submitRenterReviewAction({
          bookingId,
          rating,
          comment: comment.trim() || undefined,
        });

        if (res.error) {
          setErrorMessage(res.error);
          setIsSubmitting(false);
        } else {
          setIsSubmitting(false);
          onSuccess();
          onClose();
        }
      } else {
        const res = await submitListerReviewAction({
          bookingId,
          rating,
          comment: comment.trim() || undefined,
        });

        if (res.error) {
          setErrorMessage(res.error);
          setIsSubmitting(false);
        } else {
          setIsSubmitting(false);
          onSuccess();
          onClose();
        }
      }
    } catch {
      setErrorMessage("An unexpected network error occurred.");
      setIsSubmitting(false);
    }
  };

  const getModalMeta = () => {
    switch (mode) {
      case "coordination":
        return {
          title: "Preliminary Coordination Feedback",
          subtitle: `Rate early communication & handover logistics with ${listerName}`,
          submitLabel: "Submit Feedback",
        };
      case "renter":
        return {
          title: "Review Verified Renter",
          subtitle: `How was your rental experience with ${listerName}?`,
          submitLabel: "Submit Review",
        };
      case "lister":
      default:
        return {
          title: "Review Equipment Host",
          subtitle: `How was your experience with ${listerName}?`,
          submitLabel: "Submit Review",
        };
    }
  };

  const meta = getModalMeta();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-border/70">
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground">
              {meta.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {meta.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground text-sm font-medium cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {mode === "coordination" && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>Private Platform Feedback:</strong> Shared exclusively with operations to ensure smooth equipment handover. This is <strong>not</strong> published as a public star rating.
              </span>
            </div>
          )}

          {/* Primary Rating Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {mode === "coordination" ? "Communication Score" : "Overall Rating"}
            </label>
            <div className="flex items-center gap-3">
              <StarRating
                rating={rating}
                size="lg"
                interactive
                onRatingChange={setRating}
              />
              <span className="text-sm font-bold text-foreground">
                {rating} out of 5 stars
              </span>
            </div>
          </div>

          {/* Secondary Rating for Coordination Feedback */}
          {mode === "coordination" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Punctuality & Logistics Readiness
              </label>
              <div className="flex items-center gap-3">
                <StarRating
                  rating={punctualityScore}
                  size="lg"
                  interactive
                  onRatingChange={setPunctualityScore}
                />
                <span className="text-sm font-bold text-foreground">
                  {punctualityScore} out of 5 stars
                </span>
              </div>
            </div>
          )}

          {/* Comment Area */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              {mode === "coordination" ? "Coordination Notes (Optional)" : "Written Review (Optional)"}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                mode === "coordination"
                  ? "Note any site access requirements, scheduled pickup times, or equipment briefing details..."
                  : "Share details about punctuality, equipment readiness, handover communication, and reliability..."
              }
              maxLength={1000}
              rows={4}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>Plain text feedback only</span>
              <span>{comment.length} / 1000</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/70">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="font-semibold shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  {meta.submitLabel}
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
