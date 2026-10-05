"use client";

import * as React from "react";
import Image from "next/image";
import { Eye, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FEATURED_EQUIPMENT } from "./mock-data";
import { EquipmentItem } from "./types";
import { EquipmentDetailsModal } from "./equipment-details-modal";
import { formatCurrency } from "@/lib/utils";

const filterTabs = [
  { id: "all", label: "All Equipment" },
  { id: "excavators", label: "Excavators" },
  { id: "wheel-loaders", label: "Wheel Loaders" },
  { id: "bulldozers", label: "Bulldozers" },
  { id: "backhoes", label: "Backhoe Loaders" },
  { id: "cranes", label: "Cranes" },
  { id: "road-rollers", label: "Road Rollers" },
];

export function FeaturedEquipment() {
  const [selectedCategory, setSelectedCategory] = React.useState("all");
  const [selectedEquipment, setSelectedEquipment] = React.useState<EquipmentItem | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const filteredItems = React.useMemo(() => {
    if (selectedCategory === "all") return FEATURED_EQUIPMENT;
    return FEATURED_EQUIPMENT.filter((item) => item.categoryId === selectedCategory);
  }, [selectedCategory]);

  const handleOpenDetails = (item: EquipmentItem) => {
    setSelectedEquipment(item);
    setIsModalOpen(true);
  };

  return (
    <section id="equipment" className="py-16 sm:py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="max-w-2xl">
            <Badge variant="outline" className="mb-2 font-medium tracking-wide uppercase text-xs">
              Featured Fleet & Equipment
            </Badge>
            <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              Featured Fleet Units
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Verified, high-quality rental units ready for short-term and contract hire with transparent daily pricing.
            </p>
          </div>

          <div className="text-xs text-muted-foreground flex items-center gap-1.5 self-start md:self-end">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            <span>Pre-rental verified multi-point inspection</span>
          </div>
        </div>

        {/* Filter Navigation Tabs */}
        <div className="mt-8 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {filterTabs.map((tab) => {
            const isActive = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Equipment Cards Grid */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => {
            const isAvailable = item.availability === "Available";
            return (
              <Card
                key={item.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
              >
                {/* Image & Badges */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  <div className="absolute top-3 left-3">
                    <Badge variant="secondary" className="bg-background/90 text-foreground backdrop-blur-sm text-xs font-semibold">
                      {item.category}
                    </Badge>
                  </div>
                  <div className="absolute top-3 right-3">
                    <Badge
                      className={`text-xs font-semibold px-2 py-0.5 shadow-sm ${
                        isAvailable
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-amber-500 text-zinc-950 hover:bg-amber-600"
                      }`}
                    >
                      {isAvailable ? "Available" : "Reserved"}
                    </Badge>
                  </div>
                </div>

                {/* Card Body */}
                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <h3 className="font-heading text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                      {item.name}
                    </h3>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">
                      Model: {item.model}
                    </p>

                    {/* Spec badges */}
                    <div className="mt-4 grid grid-cols-2 gap-2 border-y border-border/60 py-3">
                      {item.specs.slice(0, 2).map((spec) => (
                        <div key={spec.label} className="text-xs">
                          <span className="text-muted-foreground block text-[11px]">
                            {spec.label}
                          </span>
                          <span className="font-semibold text-foreground mt-0.5 block truncate">
                            {spec.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Price & Action */}
                  <div className="mt-5 flex items-center justify-between pt-1">
                    <div>
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                        Commercial Rate
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-extrabold text-foreground">
                          {formatCurrency(item.rate.daily)}
                        </span>
                        <span className="text-xs text-muted-foreground">/ day</span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDetails(item)}
                      className="font-medium group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors"
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      View Details
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Empty state fallback */}
        {filteredItems.length === 0 && (
          <div className="mt-12 rounded-2xl border border-dashed border-border p-12 text-center">
            <h3 className="text-base font-semibold text-foreground">
              No equipment found in this category
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Select another category or view all equipment.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedCategory("all")}
              className="mt-4"
            >
              Reset Filter
            </Button>
          </div>
        )}
      </div>

      {/* Reusable details modal */}
      <EquipmentDetailsModal
        equipment={selectedEquipment}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </section>
  );
}
