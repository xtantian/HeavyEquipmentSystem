"use client";

import * as React from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportModal } from "./report-modal";

interface ReportButtonProps {
  targetType: "listing" | "profile";
  targetId: string;
  targetTitle: string;
  variant?: "ghost" | "outline" | "secondary";
  size?: "default" | "sm" | "icon";
  className?: string;
  label?: string;
}

export function ReportButton({
  targetType,
  targetId,
  targetTitle,
  variant = "ghost",
  size = "sm",
  className,
  label = "Report",
}: ReportButtonProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => setIsOpen(true)}
        className={className || "text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"}
        aria-label={`Report ${targetTitle}`}
      >
        <Flag className="h-3.5 w-3.5 mr-1.5" />
        {label}
      </Button>

      <ReportModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        targetType={targetType}
        targetId={targetId}
        targetTitle={targetTitle}
      />
    </>
  );
}
