"use client";

import * as React from "react";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StarRating } from "./star-rating";
import { submitListerReviewAction } from "@/app/actions/reviews";

interface WriteListerReviewModalProps {
  bookingId: string;
  listerName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function WriteListerReviewModal({
  bookingId,
  listerName,
  isOpen,
  onClose,
  onSuccess,
}: WriteListerReviewModalProps) {
  const [rating, setRating] = React.useState<number>(5);
  const [comment, setComment] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
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
    } catch {
      setErrorMessage("An unexpected network error occurred.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-border/70">
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground">
              Review Equipment Host
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              How was your experience with <span className="font-semibold text-foreground">{listerName}</span>?
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground text-sm font-medium"
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

          {/* Star Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Overall Rating
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

          {/* Comment Area */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Written Feedback (Optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share details about punctuality, equipment readiness, handover communication, and reliability..."
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
                  Submitting Review...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Submit Review
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
