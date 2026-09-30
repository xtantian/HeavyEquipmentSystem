"use client";

import * as React from "react";
import Image from "next/image";
import { CheckCircle2, Truck, FileText, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EquipmentItem } from "./types";

interface EquipmentDetailsModalProps {
  equipment: EquipmentItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EquipmentDetailsModal({
  equipment,
  isOpen,
  onClose,
}: EquipmentDetailsModalProps) {
  const [requestSubmitted, setRequestSubmitted] = React.useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setRequestSubmitted(false);
      onClose();
    }
  };

  if (!equipment) return null;

  const isAvailable = equipment.availability === "Available";

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 sm:p-0 rounded-2xl bg-card border border-border">
        {/* Machine Image Preview Header */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
          <Image
            src={equipment.image}
            alt={equipment.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 640px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                {equipment.category}
              </span>
              <h2 className="font-heading text-xl font-bold text-white sm:text-2xl">
                {equipment.name}
              </h2>
            </div>
            <Badge
              variant={isAvailable ? "default" : "secondary"}
              className={`px-2.5 py-1 text-xs font-semibold ${
                isAvailable
                  ? "bg-emerald-600 text-white"
                  : "bg-amber-500 text-zinc-950"
              }`}
            >
              {isAvailable ? "Available for Dispatch" : "Currently Reserved"}
            </Badge>
          </div>
        </div>

        <div className="p-6">
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-lg font-bold text-foreground">
              Fleet Asset Specifications — {equipment.model}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Serial verified operational asset ready for commercial project allocation.
            </DialogDescription>
          </DialogHeader>

          {/* Description */}
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {equipment.description}
          </p>

          {/* Operational Specifications Grid */}
          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-3 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Certified Machine Specifications
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {equipment.specs.map((spec) => (
                <div key={spec.label} className="rounded-lg bg-background p-2.5 border border-border/60">
                  <span className="block text-[11px] font-medium text-muted-foreground">
                    {spec.label}
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold text-foreground">
                    {spec.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Suitable project applications */}
          <div className="mt-4">
            <span className="text-xs font-medium text-muted-foreground block mb-2">
              Recommended Project Applications:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {equipment.suitableProjects.map((project) => (
                <Badge key={project} variant="outline" className="text-xs py-0.5">
                  {project}
                </Badge>
              ))}
            </div>
          </div>

          {/* Rate & Breakdown */}
          <div className="mt-6 rounded-xl border border-border/80 bg-card p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/60">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Daily Commercial Rate</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl font-extrabold text-foreground">
                    ${equipment.rate.daily.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">/ operational day</span>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-xs font-medium text-muted-foreground">Weekly Rate (Discounted)</span>
                <div className="flex items-baseline gap-1 mt-0.5 sm:justify-end">
                  <span className="text-lg font-bold text-foreground">
                    ${equipment.rate.weekly.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">/ 5-day week</span>
                </div>
              </div>
            </div>

            <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Multi-point pre-delivery inspection included</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                <span>Heavy-haul transport coordination available</span>
              </div>
            </div>
          </div>

          {/* Request Feedback Alert */}
          {requestSubmitted && (
            <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                Rental Inquire Initiated
              </div>
              <p className="mt-1">
                Your request for {equipment.name} has been staged. When connected with Supabase authentication, contractor requests are automatically routed to fleet dispatch officers.
              </p>
            </div>
          )}

          {/* Footer CTAs */}
          <DialogFooter className="mt-6 gap-2 sm:gap-0">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {!requestSubmitted ? (
              <Button
                onClick={() => setRequestSubmitted(true)}
                disabled={!isAvailable}
                className="font-medium"
              >
                {isAvailable ? "Request Rental Quote" : "Notify When Available"}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
