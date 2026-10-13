import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Heart, ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { getSavedListings, getSavedListingIds } from "@/app/actions/saved-listings";
import { ListingCardsGrid } from "@/components/marketplace/listing-cards-grid";

export const metadata = {
  title: "Saved Listings | Rent It Marketplace",
  description: "Browse the equipment listings you have saved for later.",
};

export const dynamic = "force-dynamic";

export default async function SavedListingsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/dashboard/saved");
  }

  // Both calls are needed: savedListings gives us full data, savedIds gives initial heart state
  const [savedListings, { savedIds }] = await Promise.all([
    getSavedListings(),
    getSavedListingIds(),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />

      <main className="flex-1 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="mr-1 h-3 w-3" />
                Dashboard
              </Link>
              <span className="text-xs text-muted-foreground">/</span>
              <span className="text-xs font-semibold text-primary">Saved Listings</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
                <Heart className="h-5 w-5" fill="currentColor" />
              </div>
              <div>
                <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                  Saved Listings
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {savedListings.length === 0
                    ? "You haven't saved any listings yet."
                    : `${savedListings.length} saved listing${savedListings.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
          </div>

          {/* Listings */}
          {savedListings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-12 sm:p-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
                <Heart className="h-6 w-6" />
              </div>
              <h3 className="font-heading text-lg font-bold text-foreground sm:text-xl">
                No saved listings yet
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Browse the marketplace and tap the heart icon on any listing to save it here for easy access later.
              </p>
              <div className="mt-6">
                <Link href="/listings">
                  <Button size="sm" className="font-semibold">
                    Browse Listings
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <ListingCardsGrid listings={savedListings} initialSavedIds={savedIds} />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

