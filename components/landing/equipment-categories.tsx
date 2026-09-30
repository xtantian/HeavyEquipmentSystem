import { EQUIPMENT_CATEGORIES } from "./mock-data";
import {
  Truck,
  Wrench,
  HardHat,
  Boxes,
  Compass,
  Layers,
  Cog,
  ArrowUpRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Map category icons
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Truck: Truck,
  Wrench: Wrench,
  HardHat: HardHat,
  Boxes: Boxes,
  Compass: Compass,
  Layers: Layers,
  Cog: Cog,
};

export function EquipmentCategories() {
  return (
    <section id="categories" className="py-16 sm:py-20 bg-muted/40 border-b border-border/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-2xl">
          <Badge variant="outline" className="mb-2 font-medium tracking-wide uppercase text-xs">
            Fleet Classification
          </Badge>
          <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            Equipment Categories
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Explore industrial machinery organized by operational discipline, payload capacity, and site application.
          </p>
        </div>

        {/* Categories Grid */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EQUIPMENT_CATEGORIES.map((category) => {
            const IconComponent = iconMap[category.iconName] || Truck;
            return (
              <a
                key={category.id}
                href="#equipment"
                className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl block"
              >
                <Card className="h-full border border-border/80 bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground group-hover:text-primary">
                      {category.machineCount} Units
                      <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  </div>

                  <div className="mt-4">
                    <h3 className="font-heading text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                      {category.name}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {category.description}
                    </p>
                  </div>
                </Card>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
