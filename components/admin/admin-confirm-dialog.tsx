"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";

interface AdminConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmVariant?: "default" | "destructive" | "outline";
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  requireReason?: boolean;
  reasonPlaceholder?: string;
  onReasonChange?: (reason: string) => void;
  reasonValue?: string;
}

export function AdminConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  confirmVariant = "destructive",
  isLoading = false,
  onConfirm,
  requireReason = false,
  reasonPlaceholder = "Provide an administrative rationale...",
  onReasonChange,
  reasonValue = "",
}: AdminConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(val) => !isLoading && onOpenChange(val)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              confirmVariant === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            }`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle className="text-base sm:text-lg font-bold">{title}</DialogTitle>
          </div>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground pt-1.5">
            {description}
          </DialogDescription>
        </DialogHeader>

        {requireReason && (
          <div className="space-y-1.5 py-2">
            <label className="text-xs font-semibold text-foreground">
              Reason / Justification:
            </label>
            <textarea
              value={reasonValue}
              onChange={(e) => onReasonChange?.(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="sm"
            disabled={isLoading || (requireReason && !reasonValue.trim())}
            onClick={onConfirm}
            className="font-semibold cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Processing...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
