"use client";

import * as React from "react";
import Image from "next/image";
import { useAuth, useUser } from "@clerk/nextjs";
import {
  CheckCircle2,
  Truck,
  FileText,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Calendar,
  MapPin,
  User,
  Mail,
  Phone,
  MessageSquare,
  ShieldCheck,
  Tag,
} from "lucide-react";
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
import { formatCurrency } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
  const { getToken } = useAuth();
  const { user } = useUser();

  // Mode: "details" for reviewing machine specs, "inquiry" for submitting rental quote
  const [view, setView] = React.useState<"details" | "inquiry">("details");

  // Inquiry Form Fields pre-filled with machine & user context
  const userFullName = user?.fullName || user?.firstName || "";
  const userEmail = user?.primaryEmailAddress?.emailAddress || "";
  const [prevUserKey, setPrevUserKey] = React.useState(user?.id || "");
  const [fullName, setFullName] = React.useState(userFullName);
  const [email, setEmail] = React.useState(userEmail);

  if (user && user.id !== prevUserKey) {
    setPrevUserKey(user.id);
    if (!fullName) setFullName(userFullName);
    if (!email) setEmail(userEmail);
  }

  const [phone, setPhone] = React.useState<string>("");
  const [projectLocation, setProjectLocation] = React.useState<string>("");
  const [startDate, setStartDate] = React.useState<string>("");
  const [message, setMessage] = React.useState<string>("");

  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [requestSubmitted, setRequestSubmitted] = React.useState<boolean>(false);

  // Reset state when modal is closed or opened
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setView("details");
      setRequestSubmitted(false);
      setSubmitError(null);
      setIsSubmitting(false);
      setMessage("");
      setStartDate("");
      onClose();
    }
  };

  const handleSwitchToInquiry = () => {
    setView("inquiry");
    if (equipment && !message) {
      const specSummary =
        equipment.specs && equipment.specs.length > 0
          ? equipment.specs.map((s) => `${s.label}: ${s.value}`).join(", ")
          : "";
      setMessage(
        `Rental inquiry for ${equipment.name} (${equipment.model}) [${specSummary}] at ${formatCurrency(
          equipment.rate.daily
        )}/day.`
      );
    }
  };

  if (!equipment) return null;

  const isAvailable = equipment.availability === "Available";

  // Handle direct inquiry submission to Supabase table `rental_inquiries`
  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipment) return;

    if (!fullName.trim()) {
      setSubmitError("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      setSubmitError("Please enter your email address.");
      return;
    }
    if (!phone.trim()) {
      setSubmitError("Please enter your phone, WhatsApp, or Viber contact number.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Obtain Clerk session token if user is signed in
      const token = await getToken();

      // 2. Initialize browser Supabase client
      const supabase = createSupabaseBrowserClient(token);

      // 3. Construct payload passing machine context & user fields
      const payload = {
        equipment_name: equipment.name,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        project_location: projectLocation.trim() || null,
        start_date: startDate || null,
        message:
          message.trim() ||
          `Rental quote request for ${equipment.name} (${equipment.model})`,
        status: "pending" as const,
      };

      // 4. Insert rental inquiry directly into Supabase table
      const { data, error } = await supabase
        .from("rental_inquiries")
        .insert([payload])
        .select();

      if (error) {
        console.error("Supabase insert error:", error);
        setSubmitError(error.message || "Failed to submit quote inquiry. Please try again.");
        return;
      }

      console.log("Rental inquiry saved to Supabase:", data);
      setRequestSubmitted(true);
    } catch (error: unknown) {
      console.error("Supabase insert error:", error);
      setSubmitError(
        error instanceof Error ? error.message : "An unexpected network or database error occurred."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 sm:p-0 rounded-2xl bg-card border border-border">
        {/* VIEW 1: MACHINE SPECIFICATIONS & DETAILS */}
        {view === "details" && (
          <div>
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
                    <div
                      key={spec.label}
                      className="rounded-lg bg-background p-2.5 border border-border/60"
                    >
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
                    <span className="text-xs font-medium text-muted-foreground">
                      Daily Commercial Rate
                    </span>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-2xl font-extrabold text-foreground">
                        {formatCurrency(equipment.rate.daily)}
                      </span>
                      <span className="text-xs text-muted-foreground">/ operational day</span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-xs font-medium text-muted-foreground">
                      Weekly Rate (Discounted)
                    </span>
                    <div className="flex items-baseline gap-1 mt-0.5 sm:justify-end">
                      <span className="text-lg font-bold text-foreground">
                        {formatCurrency(equipment.rate.weekly)}
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

              {/* Consolidated Footer Action (single primary action, no extra links) */}
              <DialogFooter className="mt-6 flex items-center justify-end gap-3">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button
                  onClick={handleSwitchToInquiry}
                  disabled={!isAvailable}
                  className="font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
                >
                  {isAvailable ? "Request Rental Quote" : "Notify When Available"}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </DialogFooter>
            </div>
          </div>
        )}

        {/* VIEW 2: CONSOLIDATED RENTAL INQUIRY FORM WITH ACTIVE MACHINE CONTEXT */}
        {view === "inquiry" && (
          <div className="p-6">
            {/* Header with Back button */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setView("details")}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  Back to Details
                </Button>
              </div>
              <Badge variant="outline" className="text-xs font-semibold text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/10">
                Inquiry Form
              </Badge>
            </div>

            <DialogHeader className="text-left mt-4 space-y-1">
              <DialogTitle className="text-xl font-bold text-foreground">
                Request Rental Quote
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Submit project details to receive guaranteed dispatch terms and customized logistics rates.
              </DialogDescription>
            </DialogHeader>

            {/* Active Machine Context Card with Specifications */}
            <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
              <div className="flex items-center gap-3.5">
                <div className="relative h-12 w-14 shrink-0 overflow-hidden rounded-lg bg-muted border border-border">
                  <Image
                    src={equipment.image}
                    alt={equipment.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                      {equipment.category}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">{equipment.model}</span>
                  </div>
                  <p className="font-semibold text-sm text-foreground truncate">
                    {equipment.name}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-xs font-bold text-foreground">
                    {formatCurrency(equipment.rate.daily)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">/ day</span>
                </div>
              </div>

              {/* Machine Specifications Grid */}
              {equipment.specs && equipment.specs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-500/20 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {equipment.specs.map((spec) => (
                    <div
                      key={spec.label}
                      className="rounded-lg bg-background/90 px-2.5 py-1.5 border border-border/60 text-[11px]"
                    >
                      <span className="text-muted-foreground block truncate font-medium">{spec.label}</span>
                      <span className="font-semibold text-foreground block truncate">{spec.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Success State */}
            {requestSubmitted ? (
              <div className="my-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-lg font-bold text-foreground">
                  Quote Request Sent Successfully!
                </h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                  Your request for <span className="font-semibold text-foreground">{equipment.name}</span> has been saved directly to our system. A dispatch coordinator will contact you at <span className="font-semibold text-foreground">{phone || email}</span>.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={onClose}>
                    Close Window
                  </Button>
                </div>
              </div>
            ) : (
              /* Inquiry Form */
              <form onSubmit={handleSubmitInquiry} className="mt-5 space-y-4">
                {submitError && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="font-medium">{submitError}</p>
                  </div>
                )}

                {/* Pre-filled Machine Info (Readonly Context Display) */}
                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    Selected Heavy Equipment
                  </label>
                  <div className="flex items-center justify-between rounded-xl border border-blue-500/20 bg-muted/40 px-3.5 py-2.5 text-sm text-foreground">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{equipment.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">({equipment.model})</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Auto-Populated Context
                    </span>
                  </div>
                </div>

                {/* Name & Email Row */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      Your Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Juan Dela Cruz"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      Your Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="contractor@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>
                </div>

                {/* Phone & Location Row */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      Philippine No. / Whatsapp / Viber *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="0917-123-4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      Project Location / City
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Batangas, Cebu, Makati"
                      value={projectLocation}
                      onChange={(e) => setProjectLocation(e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>
                </div>

                {/* Target Date */}
                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    Target Mobilization / Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </div>

                {/* Message / Specifications */}
                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    Project Details & Site Requirements
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Duration of hire, operator needed, ground conditions..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </div>

                {/* Submit Actions */}
                <div className="pt-2 flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setView("details")}
                    disabled={isSubmitting}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting Inquiry...
                      </>
                    ) : (
                      <>
                        Submit Rental Inquiry
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
