import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  User,
  MapPin,
  Calendar,
  Layers,
  ArrowLeft,
  ShieldCheck,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/reviews/star-rating";
import { ListerReviewsList } from "@/components/reviews/lister-reviews-list";
import {
  getPublicListerProfile,
  getListerRatingSummary,
  getListerReviews,
  getPublicListingsByOwner,
} from "@/lib/supabase/lister-reviews";
import { formatCurrency } from "@/lib/utils";

interface ListerProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function ListerProfilePage({ params }: ListerProfilePageProps) {
  const { id } = await params;

  // Query profile, ratings summary, reviews list, and active listings concurrently
  const [profile, summary, reviews, listings] = await Promise.all([
    getPublicListerProfile(id),
    getListerRatingSummary(id),
    getListerReviews(id),
    getPublicListingsByOwner(id),
  ]);

  if (!profile && listings.length === 0) {
    notFound();
  }

  const memberSinceFormatted = profile?.member_since
    ? format(parseISO(profile.member_since), "MMMM yyyy")
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />

      <main className="flex-1 py-8 sm:py-12 bg-muted/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Back Navigation */}
          <div className="mb-6">
            <Link
              href="/listings"
              className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to Marketplace
            </Link>
          </div>

          {/* Profile Header Banner Card */}
          <Card className="overflow-hidden rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm mb-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              {/* Left: Avatar + Details */}
              <div className="flex items-start sm:items-center gap-5">
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 overflow-hidden rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center font-bold text-primary text-2xl shadow-inner">
                  {profile?.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={profile.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <User className="h-10 w-10 text-primary/70" />
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                      {profile?.name || "Equipment Host"}
                    </h1>
                    {profile?.role === "admin" && (
                      <Badge className="bg-primary text-primary-foreground text-xs font-semibold">
                        Staff Verified
                      </Badge>
                    )}
                  </div>

                  {/* Reputation Badges */}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {summary.total_reviews > 0 ? (
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <StarRating rating={summary.average_rating} size="sm" />
                        <span>{summary.average_rating.toFixed(1)}</span>
                        <span className="text-muted-foreground font-normal">
                          ({summary.total_reviews} {summary.total_reviews === 1 ? "review" : "reviews"})
                        </span>
                      </div>
                    ) : (
                      <span className="italic text-muted-foreground">New Host • No reviews yet</span>
                    )}

                    {memberSinceFormatted && (
                      <>
                        <span className="text-muted-foreground/40">•</span>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>Member since {memberSinceFormatted}</span>
                        </div>
                      </>
                    )}

                    <span className="text-muted-foreground/40">•</span>
                    <div className="flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{listings.length} active {listings.length === 1 ? "listing" : "listings"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Trust Status Badge */}
              <div className="flex sm:flex-col items-start sm:items-end gap-2 bg-muted/20 p-4 rounded-2xl border border-border/50">
                <div className="flex items-center gap-1.5 text-emerald-600 font-semibold text-xs">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Platform Identity Verified</span>
                </div>
                <p className="text-[11px] text-muted-foreground text-left sm:text-right max-w-xs">
                  All transactions and equipment handovers through Rent It are protected with deposit escrow.
                </p>
              </div>
            </div>
          </Card>

          {/* Main Content Layout: 2 Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Active Equipment Listings by Host (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="border-b border-border/70 pb-3">
                <h2 className="font-heading text-xl font-bold text-foreground">
                  Active Listings ({listings.length})
                </h2>
                <p className="text-xs text-muted-foreground">
                  Equipment units currently available for rent from this host.
                </p>
              </div>

              {listings.length > 0 ? (
                <div className="space-y-4">
                  {listings.map((item) => {
                    const photo =
                      item.listing_images?.[0]?.image_url ||
                      item.images?.[0];

                    return (
                      <Card
                        key={item.id}
                        className="overflow-hidden rounded-2xl border border-border/80 bg-card hover:border-primary/40 hover:shadow-sm transition-all p-4"
                      >
                        <div className="flex items-start gap-4">
                          <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-muted border border-border/60">
                            {photo ? (
                              <Image
                                src={photo}
                                alt={item.title}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <ImageIcon className="h-6 w-6 stroke-[1.5]" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                              {item.category?.name || "Equipment"}
                            </span>
                            <h3 className="font-heading text-sm font-bold text-foreground truncate mt-0.5">
                              {item.title}
                            </h3>
                            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 text-primary shrink-0" />
                              <span className="truncate">{item.location}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="font-bold text-xs text-foreground">
                                {formatCurrency(item.price_per_day)} <span className="font-normal text-muted-foreground">/ day</span>
                              </span>
                              <Link href={`/listings/${item.id}`}>
                                <Button variant="ghost" size="sm" className="h-7 text-xs font-semibold px-2">
                                  View Unit
                                  <ExternalLink className="ml-1 h-3 w-3" />
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="p-8 rounded-2xl border border-dashed border-border/80 bg-muted/20 text-center">
                  <Layers className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">
                    This host currently has no publicly active equipment listings.
                  </p>
                </Card>
              )}
            </div>

            {/* Right: Lister Ratings & Reviews (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="border-b border-border/70 pb-3">
                <h2 className="font-heading text-xl font-bold text-foreground">
                  Host Reputation & Reviews
                </h2>
                <p className="text-xs text-muted-foreground">
                  Feedback from verified renters who have completed equipment rentals with this host.
                </p>
              </div>

              <ListerReviewsList reviews={reviews} summary={summary} />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
