"use client";

import * as React from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { DatesFirstSearchBar } from "@/components/marketplace/dates-first-search-bar";

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

interface HeroProps {
  categories?: CategoryOption[];
}

const CAROUSEL_SLIDES = [
  {
    type: "Heavy Equipment",
    caption: "Heavy Equipment • Excavators, Cranes & Earthmovers",
    imageUrl:
      "https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=2070&q=80",
    alt: "Heavy construction equipment excavator on site",
  },
  {
    type: "Cars",
    caption: "Cars • Premium Sedans, Electric SUVs & Trucks",
    imageUrl:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=2070&q=80",
    alt: "Modern luxury car on road",
  },
  {
    type: "Boats",
    caption: "Boats • Yachts, Cruisers & Marine Watercraft",
    imageUrl:
      "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=2070&q=80",
    alt: "Luxury yacht cruising on blue ocean",
  },
  {
    type: "Generators",
    caption: "Generators • Industrial Power & Silent Diesel Units",
    imageUrl:
      "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=2070&q=80",
    alt: "Industrial generator and power supply equipment",
  },
  {
    type: "Cameras",
    caption: "Cameras • Cinema Rigs, Mirrorless & Production Gear",
    imageUrl:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=2070&q=80",
    alt: "Professional cinema camera and lens kit",
  },
];

export function Hero({ categories }: HeroProps) {
  const [currentSlide, setCurrentSlide] = React.useState(0);

  // Auto-slide every 5 seconds
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % CAROUSEL_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative overflow-visible bg-zinc-950 text-zinc-50 pt-16 sm:pt-24 lg:pt-28 pb-20 sm:pb-28 lg:pb-32">
      {/* Fullscreen Auto-Sliding Carousel (5s fade) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {CAROUSEL_SLIDES.map((slide, index) => {
          const isActive = index === currentSlide;
          return (
            <div
              key={slide.type}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                isActive ? "opacity-100 z-10" : "opacity-0 z-0"
              }`}
              aria-hidden={!isActive}
            >
              <Image
                src={slide.imageUrl}
                alt={slide.alt}
                fill
                priority={index === 0}
                sizes="100vw"
                className="object-cover object-center scale-105 transition-transform duration-[6000ms] ease-out"
              />
              {/* Multilayer gradient and dark tint for crisp text contrast */}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-zinc-950/80" />
              <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" />
            </div>
          );
        })}
      </div>

      {/* Hero Content (Centered AutoTempest-style layout) */}
      <div className="relative z-20 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Marketplace Eyebrow */}
        <div className="mb-4 inline-flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-zinc-700 bg-zinc-900/80 px-3.5 py-1 text-xs font-semibold tracking-wider text-zinc-200 uppercase backdrop-blur-sm"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 mr-2" />
            Rent It • Rental Marketplace
          </Badge>
        </div>

        {/* Centered Big Headline */}
        <h1 className="font-heading text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight">
          Rent Any Equipment, Vehicle or Gear.
        </h1>

        {/* Centered Subtitle */}
        <p className="mt-4 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed text-zinc-300">
          Compare verified rentals, check real-time availability dates, and book instantly with transparent rates.
        </p>

        {/* Small Caption + Dots */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          {/* Small Category Caption */}
          <div className="inline-flex items-center gap-2 rounded-full bg-zinc-900/80 border border-zinc-700/80 px-3.5 py-1 text-xs font-medium text-zinc-200 backdrop-blur-md transition-all duration-300">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>{CAROUSEL_SLIDES[currentSlide].caption}</span>
          </div>

          {/* Carousel Dots */}
          <div
            className="flex items-center gap-2 pointer-events-auto"
            role="tablist"
            aria-label="Rental category slides"
          >
            {CAROUSEL_SLIDES.map((slide, idx) => (
              <button
                key={slide.type}
                type="button"
                role="tab"
                aria-selected={idx === currentSlide}
                aria-label={`View ${slide.type} slide`}
                onClick={() => setCurrentSlide(idx)}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                  idx === currentSlide
                    ? "w-6 bg-primary"
                    : "w-2 bg-white/40 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Overlapping White Search Card (AutoTempest style) */}
        <div className="mt-10 sm:mt-12 -mb-28 sm:-mb-36 md:-mb-40 relative z-30">
          <DatesFirstSearchBar categories={categories} />
        </div>
      </div>
    </section>
  );
}
