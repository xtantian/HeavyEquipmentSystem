"use client";

import * as React from "react";
import Link from "next/link";
import {
  format,
  addDays,
  startOfToday,
  parseISO,
  isBefore,
  isWithinInterval,
  startOfDay,
  endOfDay,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatCurrency,
  calculateInclusiveRentalDays,
  calculateRentalTotalPrice,
} from "@/lib/utils";
import { createBookingAction } from "@/app/listings/[id]/actions";

interface BookedRangeItem {
  start_date: string;
  end_date: string;
  status: string;
}

interface RequestToBookCardProps {
  listingId: string;
  listingTitle: string;
  pricePerDay: number;
  depositAmount: number;
  ownerId?: string;
  bookedRanges?: BookedRangeItem[];
  listingStatus?: string;
}

export function RequestToBookCard({
  listingId,
  listingTitle,
  pricePerDay,
  depositAmount,
  bookedRanges = [],
  listingStatus = "available",
}: RequestToBookCardProps) {
  const today = React.useMemo(() => startOfToday(), []);

  // Find the first available start date (default tomorrow, or next non-booked day)
  const defaultStart = React.useMemo(() => {
    let candidate = addDays(today, 1);
    const isBooked = (d: Date) =>
      bookedRanges.some((r) => {
        const s = startOfDay(parseISO(r.start_date));
        const e = endOfDay(parseISO(r.end_date));
        return isWithinInterval(d, { start: s, end: e });
      });

    while (isBooked(candidate)) {
      candidate = addDays(candidate, 1);
    }
    return candidate;
  }, [today, bookedRanges]);

  const defaultEnd = React.useMemo(() => addDays(defaultStart, 3), [defaultStart]);

  const [startDate, setStartDate] = React.useState<Date | undefined>(defaultStart);
  const [endDate, setEndDate] = React.useState<Date | undefined>(defaultEnd);
  const [startOpen, setStartOpen] = React.useState(false);
  const [endOpen, setEndOpen] = React.useState(false);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [bookedConfirmationId, setBookedConfirmationId] = React.useState<string | null>(null);

  // Helper to determine if a specific date is disabled in calendar
  const isDateDisabled = React.useCallback(
    (date: Date) => {
      // 1. Disable past dates
      if (isBefore(date, today)) return true;

      // 2. Disable dates from bookings with reservation-holding status (pending, accepted, paid, active)
      return bookedRanges.some((range) => {
        const rangeStart = startOfDay(parseISO(range.start_date));
        const rangeEnd = endOfDay(parseISO(range.end_date));
        return isWithinInterval(date, { start: rangeStart, end: rangeEnd });
      });
    },
    [today, bookedRanges]
  );

  // Compute live duration & live price using authoritative inclusive rental helper
  const durationDays = React.useMemo(() => {
    return calculateInclusiveRentalDays(startDate, endDate);
  }, [startDate, endDate]);

  // Live price = inclusive days × price
  const livePrice = React.useMemo(() => {
    return calculateRentalTotalPrice(pricePerDay, startDate, endDate);
  }, [pricePerDay, startDate, endDate]);

  // Check if chosen range contains any disabled/booked days
  const hasRangeConflict = React.useMemo(() => {
    if (!startDate || !endDate) return false;
    let curr = startOfDay(startDate);
    const last = startOfDay(endDate);

    while (isBefore(curr, last) || curr.getTime() === last.getTime()) {
      // Check if curr is in any booked range
      const booked = bookedRanges.some((range) => {
        const s = startOfDay(parseISO(range.start_date));
        const e = endOfDay(parseISO(range.end_date));
        return isWithinInterval(curr, { start: s, end: e });
      });

      if (booked) return true;
      curr = addDays(curr, 1);
    }

    return false;
  }, [startDate, endDate, bookedRanges]);

  const handleStartDateSelect = (d: Date | undefined) => {
    setStartDate(d);
    setServerError(null);
    setErrorCode(null);
    setStartOpen(false);

    // If end date is now before the new start date, advance it
    if (d && endDate && isBefore(endDate, d)) {
      setEndDate(addDays(d, 1));
    }
  };

  const handleEndDateSelect = (d: Date | undefined) => {
    if (d && startDate && isBefore(d, startDate)) {
      setServerError("End date must be on or after start date.");
      return;
    }
    setEndDate(d);
    setServerError(null);
    setErrorCode(null);
    setEndOpen(false);
  };

  const handleRequestToBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setErrorCode(null);

    if (!startDate || !endDate) {
      setServerError("Please select both a start date and an end date.");
      return;
    }

    if (hasRangeConflict) {
      setServerError("Selected date range conflicts with an existing reservation. Please select different dates.");
      setErrorCode("OVERLAP");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createBookingAction({
        listingId,
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
        totalPrice: livePrice,
      });

      if (result.error) {
        setServerError(result.error);
        setErrorCode(result.code || "ERROR");
      } else if (result.success && result.bookingId) {
        setBookedConfirmationId(result.bookingId);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit booking request.";
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="rounded-2xl border border-border/80 bg-card p-6 shadow-xl sticky top-24">
      {/* Rate Header */}
      <div className="flex items-baseline justify-between border-b border-border/60 pb-5">
        <div>
          <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider block">
            Rental Rate
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-extrabold text-foreground">
              {formatCurrency(pricePerDay)}
            </span>
            <span className="text-xs text-muted-foreground">/ day</span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider block">
            Security Deposit
          </span>
          <span className="text-sm font-bold text-amber-500 mt-1 block">
            {formatCurrency(depositAmount)}
          </span>
          <span className="text-[10px] text-muted-foreground block">
            Refundable
          </span>
        </div>
      </div>

      {bookedConfirmationId ? (
        /* Success State */
        <div className="py-6 text-center animate-in fade-in duration-300">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 font-semibold px-3 py-1 text-xs">
            Status: Pending Owner Review
          </Badge>

          <h4 className="font-heading text-xl font-bold text-foreground mt-3">
            Booking Request Submitted!
          </h4>

          <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Your request for <strong className="text-foreground">{listingTitle}</strong> has been created with status{" "}
            <span className="font-semibold text-foreground">pending</span>.
          </p>

          <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-3.5 text-xs text-left space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dates:</span>
              <span className="font-semibold text-foreground">
                {startDate ? format(startDate, "MMM dd, yyyy") : ""} → {endDate ? format(endDate, "MMM dd, yyyy") : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Live Rate Total:</span>
              <span className="font-bold text-foreground">{formatCurrency(livePrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Security Deposit:</span>
              <span className="font-semibold text-amber-500">{formatCurrency(depositAmount)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-border/40">
              <span className="text-muted-foreground">Booking Ref:</span>
              <span className="font-mono text-[11px] text-muted-foreground">{bookedConfirmationId}</span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setBookedConfirmationId(null)}
            className="mt-5 text-xs"
          >
            Adjust Reservation
          </Button>
        </div>
      ) : (
        /* Booking Form */
        <form onSubmit={handleRequestToBook} className="mt-5 space-y-4">
          {listingStatus !== "available" && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>This listing is currently marked <strong>Not Available</strong> and cannot be booked.</span>
            </div>
          )}

          {/* Date Range Picker with Disabled Booked Dates */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-foreground">
                Select Rental Dates
              </span>
              {bookedRanges.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  Booked dates unavailable
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/80 bg-muted/20 p-2">
              {/* Start Date */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Start Date
                </span>
                <Popover open={startOpen} onOpenChange={setStartOpen}>
                  <PopoverTrigger
                    type="button"
                    className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary transition-colors cursor-pointer w-full text-left"
                  >
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">
                      {startDate ? format(startDate, "MMM dd, yyyy") : "Pick date"}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50 bg-popover shadow-2xl" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={handleStartDateSelect}
                      disabled={isDateDisabled}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div className="border-l border-border/60 pl-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  End Date
                </span>
                <Popover open={endOpen} onOpenChange={setEndOpen}>
                  <PopoverTrigger
                    type="button"
                    className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary transition-colors cursor-pointer w-full text-left"
                  >
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">
                      {endDate ? format(endDate, "MMM dd, yyyy") : "Pick date"}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50 bg-popover shadow-2xl" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={handleEndDateSelect}
                      disabled={(date) => isDateDisabled(date) || (startDate ? isBefore(date, startDate) : false)}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Conflict Warning */}
          {hasRangeConflict && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Selected range overlaps with unavailable dates.</span>
            </div>
          )}

          {/* Live Price Breakdown (days x price) & Deposit */}
          <div className="space-y-2.5 border-t border-border/60 pt-4 text-xs">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>
                {durationDays} day{durationDays === 1 ? "" : "s"} × {formatCurrency(pricePerDay)}
              </span>
              <span className="font-semibold text-foreground text-sm">
                {formatCurrency(livePrice)}
              </span>
            </div>

            <div className="flex justify-between items-center text-muted-foreground">
              <span className="flex items-center gap-1">
                Refundable Deposit
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">Escrow</Badge>
              </span>
              <span className="font-semibold text-amber-500">
                {formatCurrency(depositAmount)}
              </span>
            </div>

            {/* Live Total Rate Highlight */}
            <div className="flex items-baseline justify-between border-t border-border/60 pt-3 text-sm font-bold text-foreground">
              <span>Live Rental Price</span>
              <div className="text-right">
                <span className="text-xl text-primary font-extrabold block">
                  {formatCurrency(livePrice)}
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  + {formatCurrency(depositAmount)} refundable deposit
                </span>
              </div>
            </div>
          </div>

          {/* Server Error Alert */}
          {serverError && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3.5 text-xs text-destructive space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{serverError}</span>
              </div>

              {errorCode === "AUTH_REQUIRED" && (
                <div className="pt-1">
                  <Link href={`/sign-in?redirect_url=/listings/${listingId}`}>
                    <Button size="sm" variant="default" className="w-full text-xs font-semibold">
                      Sign In to Book
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Request to Book CTA Button */}
          <Button
            type="submit"
            size="lg"
            disabled={
              isSubmitting ||
              hasRangeConflict ||
              durationDays === 0 ||
              listingStatus !== "available"
            }
            className="w-full font-bold shadow-lg shadow-primary/20 h-12 text-base mt-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting Request...
              </>
            ) : listingStatus !== "available" ? (
              "Not Available for Rent"
            ) : (
              <>
                Request to Book
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          {/* Trust Guarantees */}
          <div className="pt-3 space-y-2 border-t border-border/40 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Free cancellation up to 48 hours before handover.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Status pending until host acceptance.</span>
            </div>
          </div>
        </form>
      )}
    </Card>
  );
}
