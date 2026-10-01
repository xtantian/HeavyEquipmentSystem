"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import {
  HardHat,
  Truck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  MapPin,
  User,
  Mail,
  Phone,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const EQUIPMENT_OPTIONS = [
  "Excavator (Backhoe)",
  "Hydraulic Breaker",
  "Grader",
  "Forklift",
  "Wheel Loader",
  "Vibrator Compactor (Pison)",
  "Boom Truck",
  "Mobile Crane",
  "Dump Truck",
  "Cargo Truck",
  "Backhoe Loader",
  "Jack Hammer",
  "Welding Machine",
  "Generator",
  "Wing Van",
  "Trailer",
  "Truck",
  "Tower Crane",
];

interface RentalInquiryFormProps {
  initialEquipment?: string;
  onSuccess?: () => void;
  className?: string;
}

export function RentalInquiryFormContent({
  initialEquipment,
  onSuccess,
  className = "",
}: RentalInquiryFormProps) {
  const searchParams = useSearchParams();
  const { getToken } = useAuth();
  const { user } = useUser();

  // Read equipment query param from URL (e.g. ?equipment=Excavator%20(Backhoe))
  const urlEquipment = searchParams?.get("equipment") || "";

  // State
  const [equipmentName, setEquipmentName] = React.useState<string>(
    initialEquipment || urlEquipment || EQUIPMENT_OPTIONS[0]
  );
  const [fullName, setFullName] = React.useState<string>("");
  const [email, setEmail] = React.useState<string>("");
  const [phone, setPhone] = React.useState<string>("");
  const [projectLocation, setProjectLocation] = React.useState<string>("");
  const [startDate, setStartDate] = React.useState<string>("");
  const [message, setMessage] = React.useState<string>("");

  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSuccess, setIsSuccess] = React.useState<boolean>(false);

  // Auto-populate when URL query param or initialEquipment changes
  React.useEffect(() => {
    const target = initialEquipment || urlEquipment;
    if (target) {
      // Find matching option (case-insensitive substring or exact match)
      const matched = EQUIPMENT_OPTIONS.find(
        (eq) =>
          eq.toLowerCase() === target.toLowerCase() ||
          eq.toLowerCase().includes(target.toLowerCase()) ||
          target.toLowerCase().includes(eq.toLowerCase())
      );
      if (matched) {
        setEquipmentName(matched);
      } else {
        setEquipmentName(target);
      }
    }
  }, [urlEquipment, initialEquipment]);

  // Pre-fill user details if logged in with Clerk
  React.useEffect(() => {
    if (user) {
      if (!fullName) {
        setFullName(user.fullName || user.firstName || "");
      }
      if (!email && user.primaryEmailAddress) {
        setEmail(user.primaryEmailAddress.emailAddress);
      }
    }
  }, [user, fullName, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation
    if (!equipmentName.trim()) {
      setErrorMessage("Please select a heavy equipment unit.");
      return;
    }
    if (!fullName.trim()) {
      setErrorMessage("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (!phone.trim()) {
      setErrorMessage("Please enter your phone, WhatsApp, or Viber contact number.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Get session token if authenticated
      const token = await getToken();
      const supabase = createSupabaseBrowserClient(token);

      const payload = {
        equipment_name: equipmentName.trim(),
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        project_location: projectLocation.trim() || null,
        start_date: startDate || null,
        message: message.trim() || null,
        status: "pending" as const,
      };

      const { data, error } = await supabase
        .from("rental_inquiries")
        .insert([payload])
        .select();

      if (error) {
        console.error("Supabase insert error:", error);
        setErrorMessage(error.message || "Failed to submit rental inquiry. Please try again.");
        return;
      }

      console.log("Rental inquiry saved to Supabase:", data);
      setIsSuccess(true);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      console.error("Supabase insert error:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected network error occurred."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setIsSuccess(false);
    setErrorMessage(null);
    setMessage("");
    setStartDate("");
  };

  if (isSuccess) {
    return (
      <div className={`rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 sm:p-8 text-center ${className}`}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h3 className="mt-4 text-xl font-bold text-foreground">
          Inquiry Successfully Submitted!
        </h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Your quote request for <span className="font-semibold text-foreground">{equipmentName}</span> has been saved directly to our system. Our dispatch coordinator will contact you at <span className="font-semibold text-foreground">{phone || email}</span> shortly.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={handleReset} variant="outline" size="sm">
            Submit Another Inquiry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-5 ${className}`}>
      {/* Error Banner */}
      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-medium">{errorMessage}</p>
        </div>
      )}

      {/* Equipment Select */}
      <div>
        <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5 text-primary" />
          Select Heavy Equipment *
        </label>
        <div className="relative">
          <select
            value={equipmentName}
            onChange={(e) => setEquipmentName(e.target.value)}
            required
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {EQUIPMENT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            {/* If urlEquipment is a custom machine not in list, render it as selected option */}
            {!EQUIPMENT_OPTIONS.includes(equipmentName) && (
              <option value={equipmentName}>{equipmentName}</option>
            )}
          </select>
        </div>
      </div>

      {/* Name & Email Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            Your Name *
          </label>
          <input
            type="text"
            required
            placeholder="Juan Dela Cruz"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            Your Email *
          </label>
          <input
            type="email"
            required
            placeholder="contractor@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
      </div>

      {/* Phone / Whatsapp / Viber */}
      <div>
        <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
          Philippine No. / Whatsapp / Viber *
        </label>
        <input
          type="tel"
          required
          placeholder="0917-123-4567 or +63 917 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>

      {/* Project Location & Start Date Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            Project Location / City
          </label>
          <input
            type="text"
            placeholder="e.g. Batangas City, Davao, Makati"
            value={projectLocation}
            onChange={(e) => setProjectLocation(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            Target Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
      </div>

      {/* Message / Additional Site Requirements */}
      <div>
        <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          Message & Project Requirements
        </label>
        <textarea
          rows={3}
          placeholder="Estimated rental duration, ground conditions, operator requirements, or special hauling notes..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-11 text-base font-semibold shadow-md transition-all"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting Rental Inquiry...
          </>
        ) : (
          <>
            Submit Rental Inquiry
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      <p className="text-center text-[11px] text-muted-foreground">
        • Direct fleet dispatch inquiry • Fast response within commercial working hours
      </p>
    </form>
  );
}

/**
 * Wrapped in React.Suspense for Next.js App Router query parameter safety.
 */
export function RentalInquiryForm(props: RentalInquiryFormProps) {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
          Loading inquiry form...
        </div>
      }
    >
      <RentalInquiryFormContent {...props} />
    </React.Suspense>
  );
}
