import Image from "next/image";
import { ArrowRight, CheckCircle2, Shield, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-zinc-950 text-zinc-50">
      {/* Background Hero Image with refined cinematic overlay */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/hero_equipment.jpg"
          alt="Heavy excavators and wheel loaders on an industrial project site"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-40 mix-blend-luminosity filter contrast-125"
        />
        {/* Multilayer gradient for contrast and typography readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/85 to-zinc-950/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-zinc-950/60" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
        <div className="max-w-2xl lg:max-w-3xl">
          {/* Eyebrow */}
          <div className="mb-4 inline-flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-zinc-700 bg-zinc-900/80 px-3 py-1 text-xs font-semibold tracking-wider text-zinc-200 uppercase backdrop-blur-sm"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 mr-1.5" />
              Heavy Equipment Rental
            </Badge>
            <span className="hidden sm:inline-block text-xs font-medium text-zinc-400">
              Commercial Fleet Operations
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl lg:leading-[1.12]">
            Power Your Next Project With the Right Equipment.
          </h1>

          {/* Supporting Copy */}
          <p className="mt-5 text-base sm:text-lg lg:text-xl leading-relaxed text-zinc-300">
            Find reliable heavy equipment, check availability, and start your rental request in one place.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
            <a href="#equipment">
              <Button
                size="lg"
                className="h-12 px-6 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
              >
                Browse Equipment
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </a>
            <a href="#how-it-works">
              <Button
                variant="outline"
                size="lg"
                className="h-12 border-zinc-700 bg-zinc-900/60 px-6 text-base font-medium text-zinc-100 backdrop-blur-sm hover:bg-zinc-800 hover:text-white"
              >
                How It Works
              </Button>
            </a>
          </div>

          {/* Value highlights */}
          <div className="mt-10 border-t border-zinc-800/80 pt-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              <div className="flex items-center gap-2.5 text-zinc-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span className="text-xs sm:text-sm font-medium">
                  Verified Machine Specs
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-zinc-300">
                <Shield className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                <span className="text-xs sm:text-sm font-medium">
                  Pre-Dispatch Inspections
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-zinc-300">
                <Truck className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                <span className="text-xs sm:text-sm font-medium">
                  Heavy Transport Logistics
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
