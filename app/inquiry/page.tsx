import Link from "next/link";
import { HardHat, ArrowLeft, ShieldCheck, Clock, Truck } from "lucide-react";
import { RentalInquiryForm } from "@/components/landing/rental-inquiry-form";

export const metadata = {
  title: "Rental Inquiry | Heavy Equipment System",
  description: "Submit machine specifications and project requirements directly to our fleet dispatch team.",
};

export default function InquiryPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-3 transition hover:opacity-90"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <HardHat className="h-5 w-5" />
            </div>
            <div>
              <span className="font-heading text-base font-bold tracking-tight text-foreground block">
                Heavy Equipment
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground block">
                Rental System
              </span>
            </div>
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-10 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          {/* Title Area */}
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Truck className="h-3.5 w-3.5" />
              Direct Fleet Allocation
            </span>
            <h1 className="mt-3 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              Heavy Equipment Rental Inquiry
            </h1>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
              Choose your machinery or request technical dispatch availability across the Philippines.
            </p>
          </div>

          {/* Form Card */}
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-10 shadow-lg">
            <RentalInquiryForm />
          </div>

          {/* Trust Indicators */}
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3 text-center text-xs text-muted-foreground">
            <div className="flex items-center justify-center gap-2 p-3 rounded-xl border border-border/40 bg-card/40">
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>Verified Fleet Machines</span>
            </div>
            <div className="flex items-center justify-center gap-2 p-3 rounded-xl border border-border/40 bg-card/40">
              <Clock className="h-4 w-4 text-primary shrink-0" />
              <span>Prompt Dispatch Confirmation</span>
            </div>
            <div className="flex items-center justify-center gap-2 p-3 rounded-xl border border-border/40 bg-card/40">
              <Truck className="h-4 w-4 text-sky-500 shrink-0" />
              <span>Nationwide Site Mobilization</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
