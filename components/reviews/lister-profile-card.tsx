import Link from "next/link";
import Image from "next/image";
import { User, Calendar, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "./star-rating";
import type { PublicListerProfile, ListerReviewSummary } from "@/lib/supabase/lister-reviews";
import { format, parseISO } from "date-fns";

interface ListerProfileCardProps {
  profile: PublicListerProfile | null;
  summary: ListerReviewSummary;
  listerId: string;
}

export function ListerProfileCard({ profile, summary, listerId }: ListerProfileCardProps) {
  const memberSinceFormatted = profile?.member_since
    ? format(parseISO(profile.member_since), "MMMM yyyy")
    : null;

  return (
    <Card className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm transition-all hover:border-border">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Avatar & Info */}
        <div className="flex items-start sm:items-center gap-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-lg">
            {profile?.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={profile.name}
                fill
                className="object-cover"
              />
            ) : (
              <User className="h-7 w-7 text-primary/70" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Listed By Host
              </span>
              {profile?.role === "admin" && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/40 text-primary">
                  Official Staff
                </Badge>
              )}
            </div>

            <h3 className="font-heading text-lg font-bold text-foreground">
              {profile?.name || "Equipment Host"}
            </h3>

            {/* Ratings Summary */}
            <div className="mt-1 flex items-center gap-2">
              {summary.total_reviews > 0 ? (
                <>
                  <div className="flex items-center gap-1">
                    <StarRating rating={summary.average_rating} size="xs" />
                    <span className="font-bold text-xs text-foreground">
                      {summary.average_rating.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-muted-foreground/60 text-xs">•</span>
                  <span className="text-xs text-muted-foreground">
                    {summary.total_reviews} {summary.total_reviews === 1 ? "review" : "reviews"}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  New host • No reviews yet
                </span>
              )}
            </div>

            {memberSinceFormatted && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3 text-muted-foreground/70" />
                <span>Member since {memberSinceFormatted}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: View Profile Button */}
        <div className="self-start sm:self-center">
          <Link href={`/profile/${listerId}`}>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors bg-primary/5 hover:bg-primary/10 px-3.5 py-2 rounded-xl border border-primary/20">
              View Profile
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>
      </div>
    </Card>
  );
}
