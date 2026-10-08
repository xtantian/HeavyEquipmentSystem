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
  Loader2,
  Image as ImageIcon,
  Trash2,
  Star,
  History,
  Power,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, calculateInclusiveRentalDays } from "@/lib/utils";
import type { DashboardBookingItem } from "@/lib/supabase/marketplace";
import type { MarketplaceListingItem } from "@/lib/marketplace/mock-listings";
import {
  updateBookingStatusAction,
  deleteUserListingAction,
  toggleListingAvailabilityAction,
} from "@/app/dashboard/actions";
import { WriteListerReviewModal } from "@/components/reviews/write-lister-review-modal";

interface DashboardTabsProps {
  initialRentals: DashboardBookingItem[];
  initialListings: MarketplaceListingItem[];
  initialIncomingBookings: DashboardBookingItem[];
  initialRentalHistory?: DashboardBookingItem[];
  userId?: string;
}

export function DashboardTabs({
  initialRentals,
  initialListings,
  initialIncomingBookings,
  initialRentalHistory = [],
  userId: _userId,
}: DashboardTabsProps) {
  const [activeTab, setActiveTab] = React.useState<"rentals" | "listings">("rentals");
  const [listingsSubTab, setListingsSubTab] = React.useState<"active" | "history">("active");

  // State for optimistic updates
  const [rentals, setRentals] = React.useState<DashboardBookingItem[]>(initialRentals);
  const [incomingBookings, setIncomingBookings] = React.useState<DashboardBookingItem[]>(initialIncomingBookings);
  const [listings, setListings] = React.useState<MarketplaceListingItem[]>(initialListings);
  const [rentalHistory] = React.useState<DashboardBookingItem[]>(initialRentalHistory);

  // Review modal state
  const [reviewingBooking, setReviewingBooking] = React.useState<{
    id: string;
    listerName: string;
  } | null>(null);

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
          <Badge variant="secondary" className="font-semibold px-2.5 py-0.5 text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        );
      case "returned":
        return (
          <Badge variant="secondary" className="font-semibold px-2.5 py-0.5 text-xs bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Returned
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Helper for Listing Lifecycle status in Active listings
  const getListingStateInfo = (item: MarketplaceListingItem) => {
    if (item.status === "inactive" || item.status === "maintenance" || item.status === "restricted") {
      return {
        label: "Not Available",
        badge: (
          <Badge variant="outline" className="border-muted-foreground/40 bg-muted text-muted-foreground font-semibold text-[11px] px-2 py-0.5">
            <AlertCircle className="mr-1 h-3 w-3" />
            Not Available
          </Badge>
        ),
        isAvailable: false,
      };
    }
    if (item.status === "pending_review" || item.has_active_reservation) {
      return {
        label: "Pending",
        badge: (
          <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-600 font-semibold text-[11px] px-2 py-0.5">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        ),
        isAvailable: false,
      };
    }
    return {
      label: "Available",
      badge: (
        <Badge className="bg-emerald-600 text-white font-semibold text-[11px] px-2 py-0.5">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Available
        </Badge>
      ),
      isAvailable: true,
    };
  };

  // Cancel booking action (from Renter tab)
  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm("Are you sure you want to cancel this reservation?")) return;

    setLoadingActions((prev) => ({ ...prev, [bookingId]: true }));
    try {
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

  // Toggle listing availability action (Owner controls available <-> inactive)
  const handleToggleAvailability = async (listingId: string) => {
    setLoadingActions((prev) => ({ ...prev, [listingId]: true }));
    try {
      const currentListing = listings.find((l) => l.id === listingId);
      const willBeAvailable = currentListing?.status !== "available";

      // Optimistic update
      setListings((prev) =>
        prev.map((item) =>
          item.id === listingId
            ? { ...item, status: willBeAvailable ? "available" : "inactive" }
            : item
        )
      );

      const res = await toggleListingAvailabilityAction(listingId);
      if (res.error) {
        showNotification(res.error, "info");
        // Revert
        setListings((prev) =>
          prev.map((item) =>
            item.id === listingId
              ? { ...item, status: willBeAvailable ? "inactive" : "available" }
              : item
          )
        );
      } else {
        showNotification(
          res.newStatus === "available"
            ? "Listing is now Available for rent."
            : "Listing is now marked Not Available.",
          "success"
        );
      }
    } catch (err) {
      console.error("Toggle listing availability error:", err);
    } finally {
      setLoadingActions((prev) => ({ ...prev, [listingId]: false }));
    }
  };

  // Delete own listing action (from Owner tab)
  const handleDeleteListing = async (listingId: string) => {
    if (!confirm("Are you sure you want to remove this listing?")) return;

    setLoadingActions((prev) => ({ ...prev, [listingId]: true }));
    try {
      setListings((prev) => prev.filter((item) => item.id !== listingId));
      const res = await deleteUserListingAction(listingId);
      if (res.error) {
        showNotification(res.error, "info");
      } else {
        showNotification("Listing removed successfully.", "success");
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
            className="ml-3 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Primary 2-Tab Navigation Bar */}
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

                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="truncate max-w-[200px]">{listing?.location || "Pickup location"}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Price & Status & Actions */}
                      <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-border/60">
                        <div className="text-left md:text-right">
                          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                            Total Price
                          </span>
                          <span className="text-base sm:text-lg font-extrabold text-foreground">
                            {formatCurrency(booking.total_price)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {renderStatusBadge(booking.status)}

                          {canCancel && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isActionLoading}
                              onClick={() => handleCancelBooking(booking.id)}
                              className="border-destructive/40 text-destructive hover:bg-destructive/10 text-xs font-semibold cursor-pointer h-7 px-2.5"
                            >
                              {isActionLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Cancel"
                              )}
                            </Button>
                          )}

                          {(booking.status === "completed" || booking.status === "returned") && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setReviewingBooking({
                                  id: booking.id,
                                  listerName: listing?.title ? `Owner of ${listing.title}` : "Equipment Owner",
                                })
                              }
                              disabled={booking.is_reviewed}
                              className="text-xs font-semibold border-primary/40 text-primary hover:bg-primary/10 h-7 px-2.5 cursor-pointer"
                            >
                              <Star className="mr-1 h-3 w-3 fill-primary/30" />
                              {booking.is_reviewed ? "Reviewed" : "Review Lister"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-12 text-center">
              <CalendarCheck className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="font-heading text-lg font-bold text-foreground">No rental bookings yet</h3>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                Explore our catalog to find excavators, heavy machinery, and commercial vehicles available for flexible rental.
              </p>
              <Link href="/listings" className="mt-5 inline-block">
                <Button size="sm">
                  Browse Marketplace
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </Card>
          )}
        </div>
      )}

      {/* ══════════════ TAB 2: MY LISTINGS ══════════════ */}
      {activeTab === "listings" && (
        <div className="space-y-6">
          {/* Sub-Tabs: [ Active Listings ] [ Rental History ] */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/70 pb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setListingsSubTab("active")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  listingsSubTab === "active"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Active Listings</span>
                <Badge
                  variant={listingsSubTab === "active" ? "secondary" : "outline"}
                  className="ml-1 text-[11px] px-1.5 py-0 h-4"
                >
                  {listings.length}
                </Badge>
              </button>

              <button
                type="button"
                onClick={() => setListingsSubTab("history")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  listingsSubTab === "history"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <History className="h-4 w-4" />
                <span>Rental History</span>
                <Badge
                  variant={listingsSubTab === "history" ? "secondary" : "outline"}
                  className="ml-1 text-[11px] px-1.5 py-0 h-4"
                >
                  {rentalHistory.length}
                </Badge>
              </button>
            </div>

            <Link href="/listings/new">
              <Button size="sm" className="font-semibold shadow-sm self-start sm:self-auto">
                <Plus className="mr-1.5 h-4 w-4" />
                List New Item
              </Button>
            </Link>
          </div>

          {/* ── Sub-view A: Active Listings ── */}
          {listingsSubTab === "active" && (
            <div className="space-y-6">
              {/* Incoming Booking Requests (if any pending/active incoming requests) */}
              {incomingBookings.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-heading text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                        Incoming Rental Requests
                        {pendingIncomingCount > 0 && (
                          <Badge className="bg-amber-500 text-white text-xs">
                            {pendingIncomingCount} Action Required
                          </Badge>
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Review and accept or decline reservation requests for your listed units.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
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
                          className={`overflow-hidden rounded-2xl border p-4 transition-all ${
                            isPending
                              ? "border-amber-500/40 bg-card shadow-sm"
                              : "border-border/80 bg-card/60"
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="flex items-start gap-4">
                              <div className="relative h-16 w-20 sm:h-20 sm:w-28 shrink-0 overflow-hidden rounded-xl bg-muted border border-border/60">
                                {photo ? (
                                  <Image
                                    src={photo}
                                    alt={listing?.title || "Listing unit"}
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                    <ImageIcon className="h-5 w-5 stroke-[1.5]" />
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

                                <h4 className="font-heading text-base font-bold text-foreground mt-0.5 line-clamp-1">
                                  {listing?.title || "Listed Unit"}
                                </h4>

                                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="font-medium text-foreground">
                                      {format(parseISO(request.start_date), "MMM dd, yyyy")} → {format(parseISO(request.end_date), "MMM dd, yyyy")}
                                    </span>
                                  </div>

                                  <div className="font-bold text-foreground">
                                    Payout: {formatCurrency(request.total_price)}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-border/60">
                              {renderStatusBadge(request.status)}

                              {isPending && (
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={isActionLoading}
                                    onClick={() => handleAcceptRequest(request.id)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm cursor-pointer h-7"
                                  >
                                    {isActionLoading ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <>
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
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
                                    className="border-destructive/40 text-destructive hover:bg-destructive/10 text-xs font-semibold cursor-pointer h-7"
                                  >
                                    {isActionLoading ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <>
                                        <XCircle className="mr-1 h-3 w-3" />
                                        Decline
                                      </>
                                    )}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Active Listings Grid */}
              <div className="space-y-4">
                <div>
                  <h3 className="font-heading text-base sm:text-lg font-bold text-foreground">
                    Your Listed Items
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Items active, reserved, or configured in your rental catalog.
                  </p>
                </div>

                {listings.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {listings.map((item) => {
                      const photo =
                        (item.listing_images?.[0] as { url?: string; image_url?: string } | undefined)?.url ||
                        item.listing_images?.[0]?.image_url ||
                        item.images?.[0];

                      const stateInfo = getListingStateInfo(item);
                      const isActionLoading = Boolean(loadingActions[item.id]);

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
                                  {item.category?.name || "Category"}
                                </Badge>
                              </div>

                              <div className="absolute top-2.5 right-2.5">
                                {stateInfo.badge}
                              </div>
                            </div>

                            <div className="p-4">
                              <h4 className="font-heading text-base font-bold text-foreground line-clamp-1">
                                {item.title}
                              </h4>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {item.location}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 border-t border-border/60 p-4 pt-3 bg-muted/10">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-foreground text-sm">
                                {formatCurrency(item.price_per_day)}{" "}
                                <span className="text-xs font-normal text-muted-foreground">/ day</span>
                              </span>

                              <div className="flex items-center gap-1">
                                <Link href={`/listings/${item.id}`}>
                                  <Button variant="ghost" size="sm" className="h-7 text-xs font-semibold px-2">
                                    View
                                    <ExternalLink className="ml-1 h-3 w-3" />
                                  </Button>
                                </Link>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={isActionLoading}
                                  onClick={() => handleDeleteListing(item.id)}
                                  className="h-7 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer px-2"
                                  aria-label="Delete listing"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>

                            {/* Authoritative Availability Toggle Button */}
                            <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                Status: <strong className="text-foreground">{stateInfo.label}</strong>
                              </span>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isActionLoading}
                                onClick={() => handleToggleAvailability(item.id)}
                                className={`h-7 text-xs font-semibold cursor-pointer ${
                                  item.status === "available"
                                    ? "border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                                    : "border-emerald-600/40 text-emerald-600 hover:bg-emerald-600/10"
                                }`}
                              >
                                {isActionLoading ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <Power className="mr-1 h-3 w-3" />
                                )}
                                {item.status === "available" ? "Set Unavailable" : "Make Available"}
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
                    <h3 className="font-heading text-lg font-bold text-foreground">
                      You don&apos;t have any active listings yet. List an item to start renting it out.
                    </h3>
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                      Earn income by listing your property, cars, tech, tools, or special vehicles on the marketplace.
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

          {/* ── Sub-view B: Rental History ── */}
          {listingsSubTab === "history" && (
            <div className="space-y-4">
              <div>
                <h3 className="font-heading text-base sm:text-lg font-bold text-foreground">
                  Completed Rental History
                </h3>
                <p className="text-xs text-muted-foreground">
                  Past completed rentals for your listed items. Completed items remain reusable in your active inventory.
                </p>
              </div>

              {rentalHistory.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {rentalHistory.map((item) => {
                    const listing = item.listing;
                    const photo =
                      (listing?.listing_images?.[0] as { url?: string; image_url?: string } | undefined)?.url ||
                      listing?.listing_images?.[0]?.image_url ||
                      listing?.images?.[0];

                    const completedDate = item.end_date || item.created_at;

                    return (
                      <Card
                        key={item.id}
                        className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 sm:p-5 transition-all hover:border-border"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                                <span className="text-xs text-muted-foreground font-mono">
                                  Renter ID: {item.renter_id}
                                </span>
                              </div>

                              <Link href={`/listings/${item.listing_id}`}>
                                <h4 className="font-heading text-base sm:text-lg font-bold text-foreground mt-0.5 hover:text-primary transition-colors line-clamp-1">
                                  {listing?.title || "Rental Listing"}
                                </h4>
                              </Link>

                              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-medium text-foreground">
                                    {format(parseISO(item.start_date), "MMM dd, yyyy")} → {format(parseISO(item.end_date), "MMM dd, yyyy")}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    ({calculateInclusiveRentalDays(item.start_date, item.end_date)}{" "}
                                    {calculateInclusiveRentalDays(item.start_date, item.end_date) === 1 ? "day" : "days"})
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>
                                    Completed: {format(parseISO(completedDate), "MMM dd, yyyy")}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-border/60">
                            <div className="text-left md:text-right">
                              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                                Total Payout
                              </span>
                              <span className="text-base sm:text-lg font-extrabold text-foreground">
                                {formatCurrency(item.total_price)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {renderStatusBadge(item.status)}
                              <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/60">
                                Reusable Listing
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-12 text-center">
                  <History className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <h3 className="font-heading text-lg font-bold text-foreground">
                    No completed rentals yet. Your completed rentals will appear here.
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                    When renters conclude their reservation period and return your equipment, the history record will be tracked here.
                  </p>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* Write Lister Review Modal Dialog */}
      {reviewingBooking && (
        <WriteListerReviewModal
          bookingId={reviewingBooking.id}
          listerName={reviewingBooking.listerName}
          isOpen={true}
          onClose={() => setReviewingBooking(null)}
          onSuccess={() => {
            setRentals((prev) =>
              prev.map((item) =>
                item.id === reviewingBooking.id ? { ...item, is_reviewed: true } : item
              )
            );
            showNotification("Review submitted successfully! Thank you for your feedback.", "success");
          }}
        />
      )}
    </div>
  );
}
