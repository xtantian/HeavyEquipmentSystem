import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { CategoryTiles } from "@/components/marketplace/category-tiles";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Footer } from "@/components/landing/footer";
import { getMarketplaceCategories } from "@/lib/supabase/marketplace";

export default async function HomePage() {
  const categories = await getMarketplaceCategories();

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground selection:bg-primary/20 selection:text-primary">
      {/* A. NAVBAR */}
      <Navbar />

      <main className="flex-1">
        {/* B. HERO WITH AUTOTEMPEST SEARCH CARD */}
        <Hero categories={categories} />

        {/* C. MULTI-CATEGORY MARKETPLACE TILES */}
        <CategoryTiles />

        {/* D. HOW IT WORKS */}
        <HowItWorks />
      </main>

      {/* E. FOOTER */}
      <Footer />
    </div>
  );
}
