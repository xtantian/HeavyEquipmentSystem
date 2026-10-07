"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  CalendarCheck,
  Layers,
  MapPin,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Plus,
  ArrowRight,
  ExternalLink,
  Shield,
  Loader2,
  Image as ImageIcon,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, calculateInclusiveRentalDays } from "@/lib/utils";
import type { DashboardBookingItem } from "@/lib/supabase/marketplace";
import type { MarketplaceListingItem } from "@/lib/marketplace/mock-listings";
import { updateBookingStatusAction, deleteUserListingAction } from "@/app/dashboard/actions";

interface DashboardTabsProps {
  initialRentals: DashboardBookingItem[];
  initialListings: MarketplaceListingItem[];
  initialIncomingBookings: DashboardBookingItem[];
  userId: string;
}

export function DashboardTabs({
  initialRentals,
  initialListings,
  initialIncomingBookings,
  userId,
}: DashboardTabsProps) {
  const [activeTab, setActiveTab] = React.useState<"rentals" | "listings">("rentals");

  // State for optimistic updates
  const [rentals, setRentals] = React.useState<DashboardBookingItem[]>(initialRentals);
  const [incomingBookings, setIncomingBookings] = React.useState<DashboardBookingItem[]>(initialIncomingBookings);
  const [listings, setListings] = React.useState<MarketplaceListingItem[]>(initialListings);

  // Loading indicator map for action buttons
  const [loadingActions, setLoadingActions] = React.useState<Record<string, boolean>>({});

  // Notification message
  const [notification, setNotification] = React.useState<{ text: string; type: "success" | "info" } | null>(null);

  const showNotification = (text: string, type: "success" | "info" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Helper for Status Badge styling
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 font-semibold px-2.5 py-0.5 text-xs">
            <Clock className="mr-1 h-3 w-3" />
            Pending Review
          </Badge>
        );
      case "accepted":
        return (
          <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-600 font-semibold px-2.5 py-0.5 text-xs">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Accepted
          </Badge>
        );
      case "paid":
        return (
          <Badge className="bg-emerald-600 text-white font-semibold px-2.5 py-0.5 text-xs">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Paid & Confirmed
          </Badge>
        );
      case "active":
        return (
          <Badge className="bg-green-600 text-white font-semibold px-2.5 py-0.5 text-xs">
            <Clock className="mr-1 h-3 w-3" />
            Active Rental
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive font-semibold px-2.5 py-0.5 text-xs">
            <XCircle className="mr-1 h-3 w-3" />
            Cancelled
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="secondary" className="font-semibold px-2.5 py-0.5 text-xs">
            Completed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Cancel booking action (from Renter tab)
  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm("Are you sure you want to cancel this reservation?")) return;

    setLoadingActions((prev) => ({ ...prev, [bookingId]: true }));
    try {
      // Optimistic update
      setRentals((prev) =>
        prev.map((item) =>
          item.id === bookingId ? { ...item, status: "cancelled" } : item
        )
      );

      const res = await updateBookingStatusAction(bookingId, "cancelled");
      if (res.error) {
        showNotification(res.error, "info");
      } else {
        showNotification("Reservation cancelled successfully.", "info");
      }
    } catch (err) {
      console.error("Cancel booking error:", err);
    } finally {
      setLoadingActions((prev) => ({ ...prev, [bookingId]: false }));
    }
  };

  // Accept booking request (from Owner tab)
  const handleAcceptRequest = async (bookingId: string) => {
    setLoadingActions((prev) => ({ ...prev, [bookingId]: true }));
    try {
      // Optimistic update
      setIncomingBookings((prev) =>
        prev.map((item) =>
          item.id === bookingId ? { ...item, status: "accepted" } : item
        )
      );

      const res = await updateBookingStatusAction(bookingId, "accepted");
      if (res.error) {
        showNotification(res.error, "info");
      } else {
        showNotification("Booking request accepted! Renter notified.", "success");
      }
    } catch (err) {
      console.error("Accept request error:", err);
    } finally {
      setLoadingActions((prev) => ({ ...prev, [bookingId]: false }));
    }
  };

  // Decline booking request (from Owner tab)
  const handleDeclineRequest = async (bookingId: string) => {
    if (!confirm("Decline this booking request? The dates will be released.")) return;

    setLoadingActions((prev) => ({ ...prev, [bookingId]: true }));
    try {
      // Optimistic update
      setIncomingBookings((prev) =>
        prev.map((item) =>
          item.id === bookingId ? { ...item, status: "cancelled" } : item
        )
      );

      const res = await updateBookingStatusAction(bookingId, "cancelled");
      if (res.error) {
        showNotification(res.error, "info");
      } else {
        showNotification("Booking request declined.", "info");
      }
    } catch (err) {
      console.error("Decline request error:", err);
    } finally {
      setLoadingActions((prev) => ({ ...prev, [bookingId]: false }));
    }
  };

  // Delete own listing action (from Owner tab)
  const handleDeleteListing = async (listingId: string) => {
    if (!confirm("Are you sure you want to delete this listing?")) return;

    setLoadingActions((prev) => ({ ...prev, [listingId]: true }));
    try {
      setListings((prev) => prev.filter((item) => item.id !== listingId));
      const res = await deleteUserListingAction(listingId);
      if (res.error) {
        showNotification(res.error, "info");
      } else {
        showNotification("Listing deleted successfully.", "success");
      }
    } catch (err) {
      console.error("Delete listing error:", err);
    } finally {
      setLoadingActions((prev) => ({ ...prev, [listingId]: false }));
    }
  };

  const pendingIncomingCount = incomingBookings.filter((b) => b.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-xs sm:text-sm font-medium border shadow-sm animate-in fade-in duration-200 ${
            notification.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-primary/10 border-primary/30 text-primary"
          }`}
        >
          <span>{notification.text}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-3 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2-Tab Navigation Bar */}
      <div className="flex border-b border-border/80">
        <button
          type="button"
          onClick={() => setActiveTab("rentals")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-semibold transition-all cursor-pointer ${
            activeTab === "rentals"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarCheck className="h-4 w-4" />
          <span>My Rentals</span>
          <Badge variant="secondary" className="ml-1 text-[11px] px-1.5 py-0 h-4">
            {rentals.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("listings")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-semibold transition-all cursor-pointer ${
            activeTab === "listings"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>My Listings</span>
          {pendingIncomingCount > 0 ? (
            <Badge className="ml-1 bg-amber-500 text-white text-[11px] px-1.5 py-0 h-4">
              {pendingIncomingCount} pending
            </Badge>
          ) : (
            <Badge variant="secondary" className="ml-1 text-[11px] px-1.5 py-0 h-4">
              {listings.length}
            </Badge>
          )}
        </button>
      </div>

      {/* ══════════════ TAB 1: MY RENTALS ══════════════ */}
      {activeTab === "rentals" && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="font-heading text-lg sm:text-xl font-bold text-foreground">
                Your Rental Bookings
              </h2>
              <p className="text-xs text-muted-foreground">
                Track status, review reservation dates, and manage booking cancellations.
              </p>
            </div>

            <Link href="/listings">
              <Button variant="outline" size="sm" className="self-start sm:self-auto font-medium">
                Browse More Rentals
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          {rentals.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {rentals.map((booking) => {
                const listing = booking.listing;
                const photo =
                  (listing?.listing_images?.[0] as { url?: string; image_url?: string } | undefined)?.url ||
                  listing?.listing_images?.[0]?.image_url ||
                  listing?.images?.[0];

                const canCancel = booking.status === "pending" || booking.status === "accepted";
                const isActionLoading = Boolean(loadingActions[booking.id]);

                return (
                  <Card
                    key={booking.id}
                    className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 sm:p-5 transition-all hover:border-border"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: Thumbnail & Details */}
                      <div className="flex items-start gap-4">
                        <div className="relative h-20 w-24 sm:h-24 sm:w-32 shrink-0 overflow-hidden rounded-xl bg-muted border border-border/60">
                          {photo ? (
                            <Image
                              src={photo}
                              alt={listing?.title || "Rental unit"}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ImageIcon className="h-6 w-6 stroke-[1.5]" />
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                              {listing?.category?.name || "Equipment"}
                            </span>
                            <span className="text-muted-foreground/60">•</span>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              Ref: {booking.id}
                            </span>
                          </div>

                          <h3 className="font-heading text-base sm:text-lg font-bold text-foreground mt-0.5 line-clamp-1">
                            {listing?.title || "Reserved Unit"}
                          </h3>

                          {listing?.location && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="truncate">{listing.location}</span>
                            </div>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-medium text-foreground">
                                {format(parseISO(booking.start_date), "MMM dd, yyyy")} → {format(parseISO(booking.end_date), "MMM dd, yyyy")}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                ({calculateInclusiveRentalDays(booking.start_date, booking.end_date)}{" "}
                                {calculateInclusiveRentalDays(booking.start_date, booking.end_date) === 1 ? "day" : "days"})
                              </span>
                            </div>

                            <div className="font-semibold text-foreground">
                              Total: {formatCurrency(booking.total_price)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Status & Cancel Button */}
                      <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-border/60">
                        {renderStatusBadge(booking.status)}

                        {canCancel && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isActionLoading}
                            onClick={() => handleCancelBooking(booking.id)}
                            className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 cursor-pointer"
                          >
                            {isActionLoading ? (
                              <>
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                Cancelling...
                              </>
                            ) : (
                              "Cancel Reservation"
                            )}
                          </Button>
                        )}

                        {listing?.id && (
                          <Link href={`/listings/${listing.id}`}>
                            <span className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                              View Listing <ExternalLink className="h-3 w-3" />
                            </span>
                          </Link>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-12 text-center">
              <CalendarCheck className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="font-heading text-lg font-bold text-foreground">No active rentals found</h3>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                You haven&apos;t booked any equipment or vehicles yet. Browse our marketplace to find verified items.
              </p>
              <Link href="/listings" className="mt-5 inline-block">
                <Button size="sm">Browse Listings</Button>
              </Link>
            </Card>
          )}
        </div>
      )}

      {/* ══════════════ TAB 2: MY LISTINGS ══════════════ */}
      {activeTab === "listings" && (
        <div className="space-y-8">
          {/* Section 1: Incoming Booking Requests */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h2 className="font-heading text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
                  Incoming Booking Requests
                  {pendingIncomingCount > 0 && (
                    <Badge className="bg-amber-500 text-white text-xs">
                      {pendingIncomingCount} Action Required
                    </Badge>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Review and accept or decline reservation requests for your listed units.
                </p>
              </div>
            </div>

            {incomingBookings.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {incomingBookings.map((request) => {
                  const listing = request.listing;
                  const photo =
                    (listing?.listing_images?.[0] as { url?: string; image_url?: string } | undefined)?.url ||
                    listing?.listing_images?.[0]?.image_url ||
                    listing?.images?.[0];

                  const isPending = request.status === "pending";
                  const isActionLoading = Boolean(loadingActions[request.id]);

                  return (
                    <Card
                      key={request.id}
                      className={`overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all ${
                        isPending
                          ? "border-amber-500/40 bg-card shadow-md"
                          : "border-border/80 bg-card/60"
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Unit & Renter Info */}
                        <div className="flex items-start gap-4">
                          <div className="relative h-20 w-24 sm:h-24 sm:w-32 shrink-0 overflow-hidden rounded-xl bg-muted border border-border/60">
                            {photo ? (
                              <Image
                                src={photo}
                                alt={listing?.title || "Listing unit"}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <ImageIcon className="h-6 w-6 stroke-[1.5]" />
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                                {listing?.category?.name || "Equipment"}
                              </span>
                              <span className="text-muted-foreground/60">•</span>
                              <span className="text-xs text-muted-foreground font-mono">
                                Renter: {request.renter_id}
                              </span>
                            </div>

                            <h3 className="font-heading text-base sm:text-lg font-bold text-foreground mt-0.5">
                              {listing?.title || "Listed Unit"}
                            </h3>

                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium text-foreground">
                                  {format(parseISO(request.start_date), "MMM dd, yyyy")} → {format(parseISO(request.end_date), "MMM dd, yyyy")}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  ({calculateInclusiveRentalDays(request.start_date, request.end_date)}{" "}
                                  {calculateInclusiveRentalDays(request.start_date, request.end_date) === 1 ? "day" : "days"})
                                </span>
                              </div>

                              <div className="font-bold text-foreground">
                                Payout Estimate: {formatCurrency(request.total_price)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions (Accept / Decline) & Status */}
                        <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-border/60">
                          {renderStatusBadge(request.status)}

                          {isPending ? (
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={isActionLoading}
                                onClick={() => handleAcceptRequest(request.id)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm cursor-pointer"
                              >
                                {isActionLoading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                    Accept
                                  </>
                                )}
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isActionLoading}
                                onClick={() => handleDeclineRequest(request.id)}
                                className="border-destructive/40 text-destructive hover:bg-destructive/10 text-xs font-semibold cursor-pointer"
                              >
                                {isActionLoading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <XCircle className="mr-1 h-3.5 w-3.5" />
                                    Decline
                                  </>
                                )}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {request.status === "accepted" && "Accepted reservation"}
                              {request.status === "cancelled" && "Request declined"}
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8 text-center">
                <Clock className="mx-auto h-9 w-9 text-muted-foreground mb-2" />
                <h4 className="font-heading text-sm font-bold text-foreground">No incoming booking requests</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  When renters request your equipment, they will appear here for you to accept or decline.
                </p>
              </Card>
            )}
          </div>

          {/* Section 2: My Listed Units */}
          <div className="space-y-4 pt-4 border-t border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-heading text-lg sm:text-xl font-bold text-foreground">
                  Your Listed Equipment & Units
                </h2>
                <p className="text-xs text-muted-foreground">
                  Inventory active or pending verification on the marketplace.
                </p>
              </div>

              <Link href="/listings/new">
                <Button size="sm" className="font-semibold shadow-sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  List New Item
                </Button>
              </Link>
            </div>

            {listings.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((item) => {
                  const photo =
                    (item.listing_images?.[0] as { url?: string; image_url?: string } | undefined)?.url ||
                    item.listing_images?.[0]?.image_url ||
                    item.images?.[0];

                  return (
                    <Card
                      key={item.id}
                      className="overflow-hidden rounded-2xl border border-border/80 bg-card transition-all hover:border-primary/40 hover:shadow-md flex flex-col justify-between"
                    >
                      <div>
                        <div className="relative aspect-[16/10] w-full bg-muted">
                          {photo ? (
                            <Image
                              src={photo}
                              alt={item.title}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ImageIcon className="h-6 w-6 stroke-[1.5]" />
                            </div>
                          )}

                          <div className="absolute top-2.5 left-2.5">
                            <Badge variant="secondary" className="text-xs font-semibold backdrop-blur-sm bg-background/90">
                              {item.category?.name || "Equipment"}
                            </Badge>
                          </div>

                          <div className="absolute top-2.5 right-2.5">
                            {item.status === "pending_review" ? (
                              <Badge className="bg-amber-500 text-white text-[10px] font-semibold">
                                Pending Review
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-600 text-white text-[10px] font-semibold">
                                Available
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="p-4">
                          <h3 className="font-heading text-base font-bold text-foreground line-clamp-1">
                            {item.title}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {item.location}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-border/60 p-4 pt-3 bg-muted/10">
                        <span className="font-bold text-foreground text-sm">
                          {formatCurrency(item.price_per_day)} <span className="text-xs font-normal text-muted-foreground">/ day</span>
                        </span>

                        <div className="flex items-center gap-1">
                          <Link href={`/listings/${item.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold">
                              View
                              <ExternalLink className="ml-1 h-3 w-3" />
                            </Button>
                          </Link>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={Boolean(loadingActions[item.id])}
                            onClick={() => handleDeleteListing(item.id)}
                            className="h-8 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-12 text-center">
                <Layers className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <h3 className="font-heading text-lg font-bold text-foreground">You haven&apos;t listed any items yet</h3>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                  Earn income by renting out your machinery, vehicles, boats, and production gear.
                </p>
                <Link href="/listings/new" className="mt-5 inline-block">
                  <Button size="sm">
                    <Plus className="mr-1.5 h-4 w-4" />
                    List Your First Item
                  </Button>
                </Link>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
