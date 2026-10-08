"use client";

import * as React from "react";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { User, Star, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StarRating } from "./star-rating";
import type { ListerReviewWithReviewer, ListerReviewSummary } from "@/lib/supabase/lister-reviews";

interface ListerReviewsListProps {
  reviews: ListerReviewWithReviewer[];
  summary: ListerReviewSummary;
}

export function ListerReviewsList({ reviews, summary }: ListerReviewsListProps) {
  return (
    <div className="space-y-8">
      {/* Summary Scorecard */}
      <Card className="p-6 rounded-2xl border border-border/80 bg-card">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Average Rating Large */}
          <div className="md:col-span-4 text-center md:text-left md:border-r border-border/60 md:pr-6">
            <div className="text-4xl sm:text-5xl font-extrabold font-heading text-foreground tracking-tight">
              {summary.total_reviews > 0 ? summary.average_rating.toFixed(1) : "—"}
            </div>
            <div className="mt-2 flex justify-center md:justify-start">
              <StarRating rating={summary.average_rating} size="md" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Based on {summary.total_reviews} verified rental {summary.total_reviews === 1 ? "review" : "reviews"}
            </p>
          </div>

          {/* Breakdown Bars */}
          <div className="md:col-span-8 space-y-2">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = summary.rating_distribution[stars as 1 | 2 | 3 | 4 | 5] || 0;
              const percentage = summary.total_reviews > 0 ? (count / summary.total_reviews) * 100 : 0;

              return (
                <div key={stars} className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1 w-12 text-muted-foreground font-medium">
                    <span>{stars}</span>
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  </div>

                  <div className="flex-1 h-2 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  <div className="w-8 text-right font-mono text-muted-foreground">
                    {count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Individual Reviews */}
      <div className="space-y-4">
        <h3 className="font-heading text-lg font-bold text-foreground">
          Recent Reviews ({reviews.length})
        </h3>

        {reviews.length > 0 ? (
          <div className="space-y-4">
            {reviews.map((rev) => (
              <Card key={rev.id} className="p-5 rounded-2xl border border-border/70 bg-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-xs">
                      {rev.reviewer.avatar_url ? (
                        <Image
                          src={rev.reviewer.avatar_url}
                          alt={rev.reviewer.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <User className="h-5 w-5 text-primary/70" />
                      )}
                    </div>

                    <div>
                      <h4 className="font-heading text-sm font-bold text-foreground">
                        {rev.reviewer.name}
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        {format(parseISO(rev.created_at), "MMMM d, yyyy")}
                      </p>
                    </div>
                  </div>

                  <StarRating rating={rev.rating} size="sm" />
                </div>

                {rev.comment ? (
                  <p className="mt-3 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {rev.comment}
                  </p>
                ) : (
                  <p className="mt-2 text-xs italic text-muted-foreground">
                    Rating submitted without additional written comment.
                  </p>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-10 rounded-2xl border border-dashed border-border/80 bg-muted/20 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
            <h4 className="font-heading text-sm font-bold text-foreground">No reviews yet</h4>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Be the first renter to share your experience with this equipment owner after completing a rental.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
