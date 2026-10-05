import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, ShieldCheck, Sparkles, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ListingGallery } from "@/components/marketplace/listing-gallery";
import { RequestToBookCard } from "@/components/marketplace/request-to-book-card";
import {
  getMarketplaceListingById,
  getBookedRangesForListing,
} from "@/lib/supabase/marketplace";

interface ListingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ListingDetailPage({ params }: ListingDetailPageProps) {
  const { id } = await params;
  const [listing, bookedRanges] = await Promise.all([
    getMarketplaceListingById(id),
    getBookedRangesForListing(id),
  ]);

  if (!listing) {
    notFound();
  }

  // Compile gallery images
  const galleryImages = [
    ...(listing.listing_images?.map((img) => img.image_url) || []),
    ...(listing.images || []),
  ].filter(Boolean);

  const rawAttributes = (listing.attributes || {}) as Record<string, unknown>;
  const depositAmount = Number(rawAttributes.security_deposit) || Math.max(200, Math.round(listing.price_per_day * 1.5));

  // Attribute fields list (excluding security deposit which has its own display)
  const attributeEntries = Object.entries(rawAttributes).filter(
    ([key, value]) => key !== "security_deposit" && value !== null && value !== undefined && value !== ""
  );

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />

      <main className="flex-1 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb & Navigation */}
          <div className="mb-6 flex items-center justify-between">
            <Link
              href="/listings"
              className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to all listings
            </Link>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs capitalize">
                {listing.category?.name || "Rental"}
              </Badge>
              <Badge className="bg-emerald-600 text-white text-xs">
                Verified Listing
              </Badge>
            </div>
          </div>

          {/* Main 2-Column Layout */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Left: Gallery & Details (Columns 1-7) */}
            <div className="lg:col-span-7 space-y-8">
              {/* Photo Gallery */}
              <ListingGallery images={galleryImages} title={listing.title} />

              {/* Title & Metadata Header */}
              <div>
                <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                  {listing.title}
                </h1>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>{listing.location}</span>
                </div>
              </div>

              {/* Overview / Description */}
              <div className="rounded-2xl border border-border/80 bg-card p-6">
                <h3 className="font-heading text-base font-bold text-foreground mb-2">
                  About this Rental
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                  {listing.description}
                </p>
              </div>

              {/* JSONB Dynamic Attributes Card */}
              {attributeEntries.length > 0 && (
                <div className="rounded-2xl border border-border/80 bg-card p-6">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
                    <h3 className="font-heading text-base font-bold text-foreground">
                      Technical & Equipment Specifications
                    </h3>
                    <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                      Verified Data
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {attributeEntries.map(([key, val]) => (
                      <div
                        key={key}
                        className="rounded-xl border border-border/50 bg-muted/20 p-3"
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block capitalize">
                          {key.replace(/_/g, " ")}
                        </span>
                        <span className="font-medium text-foreground text-sm mt-0.5 block">
                          {typeof val === "boolean" ? (val ? "Yes" : "No") : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verification & Trust */}
              <Card className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-heading text-sm font-bold text-foreground">
                      Rent It Protected Reservation
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      Every booking includes host identity verification, dispute mediation, and refundable deposit protection held securely in escrow until return.
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Right: Booking Form Card (Columns 8-12) */}
            <div className="lg:col-span-5">
              <RequestToBookCard
                listingId={listing.id}
                listingTitle={listing.title}
                pricePerDay={listing.price_per_day}
                depositAmount={depositAmount}
                ownerId={listing.owner_id}
                bookedRanges={bookedRanges}
              />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
