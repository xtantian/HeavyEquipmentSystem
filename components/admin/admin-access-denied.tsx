"use client";

import Link from "next/link";
import { ShieldAlert, ArrowLeft, LogOut } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@clerk/nextjs";

interface AdminAccessDeniedProps {
  userEmail?: string | null;
  userId: string;
}

export function AdminAccessDenied({
  userEmail,
  userId,
}: AdminAccessDeniedProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-lg rounded-3xl border border-destructive/20 bg-card p-8 shadow-xl text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h2 className="font-heading text-xl font-bold text-foreground">
            Administrative Access Required
          </h2>
          <p className="text-sm text-muted-foreground">
            You are signed in as{" "}
            <span className="font-semibold text-foreground">
              {userEmail || userId}
            </span>
            , but your account is not registered with administrator privileges.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-xs text-left text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground">Why am I seeing this?</p>
          <p>
            The Rent It administration dashboard is restricted to verified operations personnel. If you are an administrator for this marketplace, an existing administrator or platform owner must provision the <code className="font-mono text-primary font-bold">admin</code> role for your account.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link href="/">
            <Button variant="outline" className="w-full sm:w-auto text-xs font-semibold">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Return to Marketplace
            </Button>
          </Link>
          <SignOutButton>
            <Button variant="ghost" className="w-full sm:w-auto text-xs font-semibold text-destructive hover:bg-destructive/10">
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Sign Out
            </Button>
          </SignOutButton>
        </div>
      </Card>
    </div>
  );
}
