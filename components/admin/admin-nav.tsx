"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Layers,
  Flag,
  Settings,
  ShieldCheck,
} from "lucide-react";

interface AdminNavProps {
  pendingReportsCount?: number;
}

const navItems = [
  {
    name: "Overview",
    href: "/admin",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    name: "Users",
    href: "/admin/users",
    icon: Users,
    exact: false,
  },
  {
    name: "Listings",
    href: "/admin/listings",
    icon: Layers,
    exact: false,
  },
  {
    name: "Reports",
    href: "/admin/reports",
    icon: Flag,
    exact: false,
    hasBadge: true,
  },
  {
    name: "Settings",
    href: "/admin/settings",
    icon: Settings,
    exact: false,
  },
];

export function AdminNav({ pendingReportsCount = 0 }: AdminNavProps) {
  const pathname = usePathname();

  return (
    <div className="border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-lg sm:text-xl font-bold tracking-tight text-foreground">
                  Admin Control Center
                </h1>
                <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 border border-amber-500/30">
                  Role: Admin
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Heavy Equipment System governance, inventory oversight, and user compliance
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto scrollbar-none pb-px" aria-label="Admin Tabs">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex items-center gap-2 whitespace-nowrap border-b-2 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold transition-all ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                <span>{item.name}</span>
                {item.hasBadge && pendingReportsCount > 0 && (
                  <span className="ml-1 rounded-full bg-destructive/10 px-1.5 py-0.2 text-[10px] font-bold text-destructive border border-destructive/20">
                    {pendingReportsCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
