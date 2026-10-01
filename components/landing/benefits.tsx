import { WHY_CHOOSE_BENEFITS } from "./mock-data";
import {
  FileText,
  Banknote,
  Clock,
  ShieldCheck,
  Truck,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const benefitIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText: FileText,
  Banknote: Banknote,
  DollarSign: Banknote,
  Clock: Clock,
  ShieldCheck: ShieldCheck,
  Truck: Truck,
  SlidersHorizontal: SlidersHorizontal,
};

export function Benefits() {
  return (
    <section id="benefits" className="py-16 sm:py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-2xl">
          <Badge variant="outline" className="mb-2 font-medium tracking-wide uppercase text-xs">
            Commercial Advantage
          </Badge>
          <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            Why Choose the Platform
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Built to provide project estimators, equipment coordinators, and site superintendents with operational transparency and dependable machine dispatch.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {WHY_CHOOSE_BENEFITS.map((benefit) => {
            const Icon = benefitIcons[benefit.iconName] || ShieldCheck;
            return (
              <Card
                key={benefit.title}
                className="h-full border border-border/80 bg-card p-6 rounded-2xl transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary" className="text-[11px] font-medium px-2 py-0.5">
                    {benefit.tag}
                  </Badge>
                </div>

                <div className="mt-4">
                  <h3 className="font-heading text-base font-bold text-foreground">
                    {benefit.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {benefit.description}
                  </p>
                </div>

                <div className="mt-5 border-t border-border/60 pt-3 flex items-center gap-1.5 text-xs text-primary font-medium">
                  <Check className="h-3.5 w-3.5" />
                  <span>Standard on all rentals</span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
