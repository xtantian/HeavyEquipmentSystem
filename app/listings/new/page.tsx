import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, HardHat } from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { NewListingForm } from "@/components/marketplace/new-listing-form";
import { getMarketplaceCategories } from "@/lib/supabase/marketplace";

export const metadata = {
  title: "List Your Equipment or Vehicle | Rent It Marketplace",
  description: "Create a verified rental listing for your heavy equipment, vehicle, boat, generator, or production gear.",
};

export default async function NewListingPage() {
  // 1. Require login — redirect unauthenticated visitors to sign in
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/listings/new");
  }

  // 2. Fetch categories with attribute_schema from database
  const categories = await getMarketplaceCategories();

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />

      <main className="flex-1 py-10 sm:py-14 bg-muted/20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb Navigation */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link
                href="/listings"
                className="inline-flex items-center hover:text-foreground transition-colors font-medium"
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Back to Listings
              </Link>
              <span>/</span>
              <span className="font-semibold text-primary">New Listing</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>Owner Portal Verified</span>
            </div>
          </div>

          {/* Page Heading */}
          <div className="mb-8">
            <h1 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground">
              List Your Item for Rent
            </h1>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
              Monetize your idle equipment, vehicles, and commercial gear. Fill in the details below to submit your unit for marketplace verification.
            </p>
          </div>

          {/* New Listing Interactive Form */}
          <NewListingForm categories={categories} userId={userId} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
