import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { categoryIconMap } from "@/lib/marketplace/categories";
import { getMarketplaceCategories } from "@/lib/supabase/marketplace";

export async function CategoryTiles() {
  const categories = await getMarketplaceCategories();

  return (
    <section
      id="categories"
      className="pt-28 pb-16 sm:pt-36 sm:pb-20 lg:pt-40 bg-muted/30 border-b border-border/60 relative z-10"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 mb-2">
              <Badge
                variant="outline"
                className="font-semibold tracking-wider uppercase text-[11px] border-primary/30 text-primary"
              >
                <Sparkles className="h-3 w-3 mr-1 text-primary" />
                Marketplace Categories
              </Badge>
            </div>
            <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              Explore Rental Categories
            </h2>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground">
              Select a category to view vetted listings, check live dates availability, and book verified rentals.
            </p>
          </div>

          <Link
            href="/listings"
            className="inline-flex items-center text-sm font-semibold text-primary hover:underline group shrink-0"
          >
            <span>View all inventory</span>
            <ArrowUpRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        {/* Category Tiles Grid */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => {
            const Icon = (category.icon && categoryIconMap[category.icon]) || Sparkles;

            return (
              <Link
                key={category.id}
                href={`/listings?category=${category.slug}`}
                className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl block"
              >
                <Card className="relative h-full border border-border/80 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg">
                  {/* Top Bar with Icon and Badge */}
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-300 group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground shadow-sm">
                      <Icon className="h-6 w-6" />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-0.5 text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-heading text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                        {category.name}
                      </h3>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {category.description || "Discover verified rentals in this category."}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
