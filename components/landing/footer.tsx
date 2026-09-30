import Link from "next/link";
import { HardHat, Phone, Mail, MapPin, Shield } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card text-card-foreground">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* Brand & info */}
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <HardHat className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-heading text-base font-bold text-foreground">
                  Heavy Equipment
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Rental System
                </span>
              </div>
            </Link>

            <p className="mt-4 max-w-sm text-xs leading-relaxed text-muted-foreground">
              A modern commercial equipment rental platform providing civil contractors and project superintendents with reliable machinery discovery, verified specifications, and organized rental requests.
            </p>

            <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-4 w-4 text-primary shrink-0" />
              <span>Commercial Fleet Asset Management System</span>
            </div>
          </div>

          {/* Column 1: Fleet Categories */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Equipment Fleet
            </h4>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              <li>
                <a href="#equipment" className="hover:text-foreground transition-colors">
                  Hydraulic Excavators
                </a>
              </li>
              <li>
                <a href="#equipment" className="hover:text-foreground transition-colors">
                  Wheel Loaders
                </a>
              </li>
              <li>
                <a href="#equipment" className="hover:text-foreground transition-colors">
                  Track Bulldozers
                </a>
              </li>
              <li>
                <a href="#equipment" className="hover:text-foreground transition-colors">
                  Backhoe Loaders
                </a>
              </li>
              <li>
                <a href="#equipment" className="hover:text-foreground transition-colors">
                  Rough-Terrain Cranes
                </a>
              </li>
              <li>
                <a href="#equipment" className="hover:text-foreground transition-colors">
                  Vibratory Road Rollers
                </a>
              </li>
            </ul>
          </div>

          {/* Column 2: Platform Links */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Operations
            </h4>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              <li>
                <a href="#how-it-works" className="hover:text-foreground transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#categories" className="hover:text-foreground transition-colors">
                  Fleet Classification
                </a>
              </li>
              <li>
                <a href="#benefits" className="hover:text-foreground transition-colors">
                  Why Choose Us
                </a>
              </li>
              <li>
                <span className="text-muted-foreground/60 cursor-not-allowed">
                  Inspection Protocols (Demo)
                </span>
              </li>
              <li>
                <span className="text-muted-foreground/60 cursor-not-allowed">
                  Contractor Verification (Demo)
                </span>
              </li>
            </ul>
          </div>

          {/* Column 3: Yard & Dispatch Info Placeholder */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Dispatch & Yard
            </h4>
            <ul className="mt-3 space-y-2.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <span>Central Equipment Yard & Maintenance Facility</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-primary" />
                <span>(555) 019-2834 (Fleet Ops)</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-primary" />
                <span>dispatch@heavyequip-demo.com</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-border/60 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>
            &copy; {currentYear} Heavy Equipment Rental System. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <span className="hover:text-foreground cursor-pointer transition-colors">
              Rental Terms (Placeholder)
            </span>
            <span className="hover:text-foreground cursor-pointer transition-colors">
              Safety Compliance (Placeholder)
            </span>
            <span className="hover:text-foreground cursor-pointer transition-colors">
              Privacy Policy (Placeholder)
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
