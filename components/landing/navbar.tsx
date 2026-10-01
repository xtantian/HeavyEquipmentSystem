"use client";

import * as React from "react";
import Link from "next/link";
import { UserButton, useAuth } from "@clerk/nextjs";
import { HardHat, Menu, X, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { name: "Equipment", href: "#equipment" },
  { name: "Categories", href: "#categories" },
  { name: "How It Works", href: "#how-it-works" },
  { name: "Why Choose Us", href: "#benefits" },
  { name: "Rental Inquiry", href: "/inquiry" },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const { isSignedIn } = useAuth();

  // Close mobile menu on escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/95 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand identity */}
        <Link
          href="/"
          className="group flex items-center gap-3 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
          aria-label="Heavy Equipment Rental System Home"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
            <HardHat className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <span className="font-heading text-base font-bold tracking-tight text-foreground sm:text-lg">
              Heavy Equipment
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Rental System
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav
          className="hidden md:flex items-center gap-1 lg:gap-2"
          aria-label="Main Navigation"
        >
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.name}
            </a>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-3">
          {isSignedIn ? (
            <div className="flex items-center gap-3">
              <a href="#equipment">
                <Button variant="outline" size="sm" className="font-medium">
                  Browse Fleet
                </Button>
              </a>
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "h-8 w-8 ring-2 ring-primary/20",
                  },
                }}
              />
            </div>
          ) : (
            <>
              <Link href="/sign-in">
                <Button variant="ghost" size="sm" className="font-medium text-foreground">
                  Sign In
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button size="sm" className="font-medium shadow-sm">
                  Get Started
                  <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center gap-2">
          {isSignedIn && <UserButton />}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            className="text-foreground"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-background px-4 pt-2 pb-6 md:hidden animate-in slide-in-from-top-2 duration-150">
          <nav className="flex flex-col space-y-2 py-2" aria-label="Mobile Navigation">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted"
              >
                {link.name}
              </a>
            ))}
          </nav>

          <div className="mt-4 border-t border-border pt-4">
            {isSignedIn ? (
              <a
                href="#equipment"
                onClick={() => setMobileMenuOpen(false)}
                className="block"
              >
                <Button className="w-full justify-center">
                  Browse Equipment Fleet
                </Button>
              </a>
            ) : (
              <div className="flex flex-col gap-2.5">
                <Link href="/sign-in" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full justify-center">
                    Sign In
                  </Button>
                </Link>
                <Link href="/sign-up" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full justify-center">
                    Get Started
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                  </Button>
                </Link>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>Commercial-grade civil fleet verification enabled.</span>
          </div>
        </div>
      )}
    </header>
  );
}
