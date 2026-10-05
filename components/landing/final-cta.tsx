import Link from "next/link";
import { ArrowRight, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden py-16 sm:py-24 bg-zinc-950 text-zinc-50 border-t border-zinc-800">
      {/* Subtle industrial grid background pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3.5 py-1 text-xs font-semibold text-zinc-300 backdrop-blur-sm">
            <HardHat className="h-3.5 w-3.5 text-amber-400" />
            <span>Multi-Category Rentals Available</span>
          </div>

          <h2 className="mt-6 font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Ready to Find the Rental You Need?
          </h2>

          <p className="mt-4 text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            Browse available listings, check real-time availability, and start your rental request with transparent rates.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <Link href="/listings">
              <Button
                size="lg"
                className="h-12 px-7 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
              >
                Browse Listings
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>

            <Link href="/sign-up">
              <Button
                variant="outline"
                size="lg"
                className="h-12 border-zinc-700 bg-zinc-900/80 px-7 text-base font-medium text-zinc-100 backdrop-blur-sm hover:bg-zinc-800 hover:text-white"
              >
                Get Started
              </Button>
            </Link>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-zinc-500">
            <span>• No credit card required to explore</span>
            <span>• Verified items & owners</span>
            <span>• Flexible local pickup & delivery</span>
          </div>
        </div>
      </div>
    </section>
  );
}
