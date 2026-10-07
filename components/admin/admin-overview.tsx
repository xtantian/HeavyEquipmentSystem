"use client";

import * as React from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  Zap,
  TrendingUp,
  HardHat,
  Layers,
  Flag,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AdminOverviewStats } from "@/lib/supabase/admin";

interface AdminOverviewProps {
  stats: AdminOverviewStats;
}

export function AdminOverview({ stats }: AdminOverviewProps) {
  // Percent calculations
  const totalListings = Math.max(stats.totalEquipmentListings, 1);
  const totalRentals = Math.max(
    Object.values(stats.rentalsByStatus).reduce((a, b) => a + b, 0),
    1
  );
  const totalUsers = Math.max(stats.totalRegisteredUsers, 1);

  return (
    <div className="space-y-8">
      {/* ── Section Header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            System Overview & Metrics
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live database analytics for marketplace inventory, accounts, and active rentals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/reports">
            <Button variant={stats.totalReportedListings > 0 ? "destructive" : "outline"} size="sm" className="gap-1.5 font-semibold">
              <Flag className="h-4 w-4" />
              {stats.totalReportedListings > 0
                ? `${stats.totalReportedListings} Reported Listing${stats.totalReportedListings === 1 ? "" : "s"}`
                : "No Active Reports"}
            </Button>
          </Link>
        </div>
      </div>

      {/* ── 7 Primary Metric Cards ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Registered Users */}
        <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Users
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-foreground">
              {stats.totalRegisteredUsers}
            </span>
            <span className="text-xs text-muted-foreground">registered</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            All accounts created via Clerk and mirrored in Supabase.
          </p>
        </Card>

        {/* Card 2: Active Users */}
        <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Accounts
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-foreground">
              {stats.activeUsers}
            </span>
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 border-emerald-500/30 text-emerald-600">
              {Math.round((stats.activeUsers / totalUsers) * 100)}% in good standing
            </Badge>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Non-restricted, unbanned accounts with full platform privileges.
          </p>
        </Card>

        {/* Card 3: Currently Active / Logged-in Users */}
        <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Logins
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-foreground">
              {stats.currentlyActiveUsers}
            </span>
            <span className="text-xs text-muted-foreground">last 24 hours</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Users who authenticated or performed actions in the system today.
          </p>
        </Card>

        {/* Card 4: Total Users Used Rental System */}
        <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Rental Customers
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-foreground">
              {stats.totalUsersUsedRental}
            </span>
            <span className="text-xs text-muted-foreground">renters</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Unique users who have completed or booked equipment rentals.
          </p>
        </Card>

        {/* Card 5: Total Active Rentals */}
        <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Rentals
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HardHat className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-foreground">
              {stats.totalActiveRentals}
            </span>
            <Badge variant="secondary" className="text-[10px] font-semibold">
              In Field
            </Badge>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Heavy units and vehicles currently dispatched or paid under active contract.
          </p>
        </Card>

        {/* Card 6: Total Equipment Listings */}
        <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Listings
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-foreground">
              {stats.totalEquipmentListings}
            </span>
            <span className="text-xs text-muted-foreground">units</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Total marketplace inventory across excavators, cranes, loaders, and trucks.
          </p>
        </Card>

        {/* Card 7: Total Reported Listings */}
        <Card className={`rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${
          stats.totalReportedListings > 0
            ? "border-destructive/40 bg-destructive/5"
            : "border-border/80 bg-card"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reported Units
            </span>
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              stats.totalReportedListings > 0
                ? "bg-destructive/20 text-destructive"
                : "bg-muted text-muted-foreground"
            }`}>
              <Flag className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl sm:text-3xl font-extrabold ${
              stats.totalReportedListings > 0 ? "text-destructive" : "text-foreground"
            }`}>
              {stats.totalReportedListings}
            </span>
            {stats.totalReportedListings > 0 ? (
              <Badge variant="destructive" className="text-[10px]">
                Requires Review
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                All Clear
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Listings flagged by community members for policy or specification violations.
          </p>
        </Card>

        {/* Quick Actions Card */}
        <Card className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-5 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quick Admin Actions
            </span>
            <div className="mt-3 flex flex-col gap-2">
              <Link href="/admin/listings" className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" /> Manage Listings & Restrictions →
              </Link>
              <Link href="/admin/users" className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> Manage User Statuses & Bans →
              </Link>
              <Link href="/admin/reports" className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1">
                <Flag className="h-3.5 w-3.5" /> Review Flagged Equipment →
              </Link>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Status Breakdown Charts & Distributions ───────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart 1: Equipment Listings Status Breakdown */}
        <Card className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="font-heading text-base font-bold text-foreground">
                Listings by Operational Status
              </h3>
              <p className="text-xs text-muted-foreground">Distribution across fleet inventory</p>
            </div>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Available for Rent
                </span>
                <span className="font-semibold text-foreground">
                  {stats.listingsByStatus.available} ({Math.round((stats.listingsByStatus.available / totalListings) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${(stats.listingsByStatus.available / totalListings) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Rented / On Contract
                </span>
                <span className="font-semibold text-foreground">
                  {stats.listingsByStatus.rented} ({Math.round((stats.listingsByStatus.rented / totalListings) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${(stats.listingsByStatus.rented / totalListings) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Maintenance / Service
                </span>
                <span className="font-semibold text-foreground">
                  {stats.listingsByStatus.maintenance} ({Math.round((stats.listingsByStatus.maintenance / totalListings) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${(stats.listingsByStatus.maintenance / totalListings) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-destructive">
                  <span className="h-2 w-2 rounded-full bg-destructive" /> Restricted / Hidden
                </span>
                <span className="font-semibold text-destructive">
                  {stats.listingsByStatus.restricted} ({Math.round((stats.listingsByStatus.restricted / totalListings) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-destructive rounded-full"
                  style={{ width: `${(stats.listingsByStatus.restricted / totalListings) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-purple-500" /> Pending Verification
                </span>
                <span className="font-semibold text-foreground">
                  {stats.listingsByStatus.pending_review} ({Math.round((stats.listingsByStatus.pending_review / totalListings) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-purple-500 rounded-full"
                  style={{ width: `${(stats.listingsByStatus.pending_review / totalListings) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Chart 2: Rental Contracts & Bookings Breakdown */}
        <Card className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="font-heading text-base font-bold text-foreground">
                Rental Bookings by Lifecycle
              </h3>
              <p className="text-xs text-muted-foreground">Hire agreements across all users</p>
            </div>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Active Dispatches
                </span>
                <span className="font-semibold text-foreground">
                  {stats.rentalsByStatus.active} ({Math.round((stats.rentalsByStatus.active / totalRentals) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${(stats.rentalsByStatus.active / totalRentals) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Paid & Confirmed
                </span>
                <span className="font-semibold text-foreground">
                  {stats.rentalsByStatus.paid} ({Math.round((stats.rentalsByStatus.paid / totalRentals) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${(stats.rentalsByStatus.paid / totalRentals) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Pending Owner Review
                </span>
                <span className="font-semibold text-foreground">
                  {stats.rentalsByStatus.pending} ({Math.round((stats.rentalsByStatus.pending / totalRentals) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${(stats.rentalsByStatus.pending / totalRentals) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Completed Rentals
                </span>
                <span className="font-semibold text-foreground">
                  {stats.rentalsByStatus.completed} ({Math.round((stats.rentalsByStatus.completed / totalRentals) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-muted-foreground rounded-full"
                  style={{ width: `${(stats.rentalsByStatus.completed / totalRentals) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Chart 3: User Accounts Status Distribution */}
        <Card className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="font-heading text-base font-bold text-foreground">
                User Account Governance
              </h3>
              <p className="text-xs text-muted-foreground">Compliance & penalty distribution</p>
            </div>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Active & Trusted
                </span>
                <span className="font-semibold text-foreground">
                  {stats.usersByStatus.active} ({Math.round((stats.usersByStatus.active / totalUsers) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${(stats.usersByStatus.active / totalUsers) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Restricted Accounts
                </span>
                <span className="font-semibold text-amber-600">
                  {stats.usersByStatus.restricted} ({Math.round((stats.usersByStatus.restricted / totalUsers) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${(stats.usersByStatus.restricted / totalUsers) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="flex items-center gap-1.5 text-destructive">
                  <XCircle className="h-3.5 w-3.5 text-destructive" /> Banned from Platform
                </span>
                <span className="font-semibold text-destructive">
                  {stats.usersByStatus.banned} ({Math.round((stats.usersByStatus.banned / totalUsers) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-destructive rounded-full"
                  style={{ width: `${(stats.usersByStatus.banned / totalUsers) * 100}%` }}
                />
              </div>
            </div>

            <div className="pt-2">
              <Link href="/admin/users">
                <Button variant="outline" size="sm" className="w-full text-xs font-semibold gap-1">
                  Manage Account Permissions <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
