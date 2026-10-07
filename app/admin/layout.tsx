import * as React from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { AdminNav } from "@/components/admin/admin-nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Dashboard | Rent It Marketplace",
  description: "Secure administrative management console for Rent It Marketplace",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Strict Server-Side Role-Based Access Control (RBAC)
  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/admin");
  }

  let isAdmin = user.publicMetadata?.role === "admin";

  if (!isAdmin) {
    // Check Supabase profiles role as mirror fallback
    try {
      const supabase = await createSupabaseServerClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("clerk_user_id", user.id)
        .maybeSingle();

      if (profile?.role === "admin") {
        isAdmin = true;
      }
    } catch (err) {
      console.warn("[AdminLayout] Error verifying profile role:", err);
    }
  }

  // Reject non-admin access immediately at server level
  if (!isAdmin) {
    redirect("/");
  }

  // 2. Fetch active reports count for navigation badge
  let pendingReportsCount = 0;
  try {
    const supabase = await createSupabaseServerClient();
    const { count } = await supabase
      .from("listing_reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if (count !== null && count !== undefined) {
      pendingReportsCount = count;
    }
  } catch {}

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <Navbar />
      <AdminNav pendingReportsCount={pendingReportsCount} />

      <main className="flex-1 bg-muted/20 py-8 sm:py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}
