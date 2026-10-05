import { HOW_IT_WORKS_STEPS } from "./mock-data";
import { Search, Calendar, FileCheck, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const stepIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Search: Search,
  Calendar: Calendar,
  FileCheck: FileCheck,
  Truck: Truck,
};

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-24 bg-muted/30 border-y border-border/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto">
          <Badge variant="outline" className="mb-2 font-medium tracking-wide uppercase text-xs">
            Rental Workflow
          </Badge>
          <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            How It Works
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            A seamless, 4-step rental process designed for verified renters and owners across all categories.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 relative">
          {HOW_IT_WORKS_STEPS.map((step) => {
            const Icon = stepIcons[step.iconName] || Search;
            return (
              <div key={step.step} className="relative group">
                <Card className="h-full border border-border/80 bg-card p-6 rounded-2xl flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md">
                  <div>
                    {/* Step Number & Icon Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-border/60">
                      <span className="font-heading text-2xl font-extrabold text-primary/80">
                        {step.step}
                      </span>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="mt-4">
                      <h3 className="font-heading text-base font-bold text-foreground">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-lg bg-muted/40 p-2.5 border border-border/40 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground block mb-0.5">Key requirement:</span>
                    {step.detail}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
