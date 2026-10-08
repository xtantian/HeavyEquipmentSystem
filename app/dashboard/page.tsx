import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { getUserRentals, getUserListingsAndIncoming } from "@/lib/supabase/marketplace";

export const metadata = {
  title: "Rental & Listings Dashboard | Rent It Marketplace",
  description: "Manage your active equipment rentals, review reservation dates, and oversee incoming hire requests.",
};

export default async function DashboardPage() {
  // 1. Require login
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/dashboard");
  }

  // 2. Fetch user's rentals, listings, incoming booking requests, and rental history
  const [rentals, { listings, incomingBookings, rentalHistory }] = await Promise.all([
    getUserRentals(userId),
    getUserListingsAndIncoming(userId),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />

      <main className="flex-1 py-8 sm:py-12 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground">
              Marketplace Dashboard
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Manage your personal rental reservations and monitor booking requests for your listed units.
            </p>
          </div>

          {/* 2-Tab Interactive Dashboard */}
          <DashboardTabs
            initialRentals={rentals}
            initialListings={listings}
            initialIncomingBookings={incomingBookings}
            initialRentalHistory={rentalHistory}
            userId={userId}
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
