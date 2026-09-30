import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { EquipmentCategories } from "@/components/landing/equipment-categories";
import { FeaturedEquipment } from "@/components/landing/featured-equipment";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Benefits } from "@/components/landing/benefits";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground selection:bg-primary/20 selection:text-primary">
      {/* A. NAVBAR */}
      <Navbar />

      <main className="flex-1">
        {/* B. HERO */}
        <Hero />

        {/* C. EQUIPMENT CATEGORIES */}
        <EquipmentCategories />

        {/* D. FEATURED EQUIPMENT */}
        <FeaturedEquipment />

        {/* E. HOW IT WORKS */}
        <HowItWorks />

        {/* F. WHY CHOOSE THE PLATFORM */}
        <Benefits />

        {/* G. FINAL CALL TO ACTION */}
        <FinalCta />
      </main>

      {/* H. FOOTER */}
      <Footer />
    </div>
  );
}
