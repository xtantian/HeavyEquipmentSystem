"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { toggleSaveListingAction } from "@/app/actions/saved-listings";

interface SaveHeartButtonProps {
  listingId: string;
  initialSaved?: boolean;
  /** Callback so parent list can optimistically sync its saved-set */
  onToggle?: (listingId: string, newSavedState: boolean) => void;
}

/**
 * Heart button placed in the upper-right corner of a listing card image.
 *
 * - Shows a filled heart when saved, outlined when not.
 * - Propagation is stopped so clicking the heart never opens the listing.
 * - Unauthenticated users are redirected to sign-in.
 * - Provides immediate optimistic feedback and a disabled loading state.
 */
export function SaveHeartButton({
  listingId,
  initialSaved = false,
  onToggle,
}: SaveHeartButtonProps) {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [isSaved, setIsSaved] = React.useState(initialSaved);
  const [isPending, setIsPending] = React.useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // Prevent the surrounding <Link> / card click handler from triggering
    e.preventDefault();
    e.stopPropagation();

    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    if (isPending) return;

    // Optimistic update
    const optimisticSaved = !isSaved;
    setIsSaved(optimisticSaved);
    setIsPending(true);

    try {
      const result = await toggleSaveListingAction(listingId);

      if (!result.success) {
        // Roll back optimistic update on failure
        setIsSaved(isSaved);
        console.warn("[SaveHeartButton] Toggle failed:", result.error);
      } else {
        setIsSaved(result.saved);
        onToggle?.(listingId, result.saved);
      }
    } catch (err) {
      // Roll back on unexpected error
      setIsSaved(isSaved);
      console.error("[SaveHeartButton] Unexpected error:", err);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      type="button"
      aria-label={isSaved ? "Remove saved listing" : "Save listing"}
      aria-pressed={isSaved}
      disabled={isPending}
      onClick={handleClick}
      className={`
        flex h-8 w-8 items-center justify-center rounded-full
        bg-background/85 backdrop-blur-md shadow-md
        transition-all duration-150
        hover:scale-110 active:scale-95
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
        disabled:cursor-not-allowed disabled:opacity-60
        ${isSaved ? "text-rose-500" : "text-muted-foreground hover:text-rose-400"}
      `}
    >
      <Heart
        className="h-4 w-4 transition-transform duration-150"
        fill={isSaved ? "currentColor" : "none"}
        strokeWidth={isSaved ? 0 : 2}
        aria-hidden="true"
      />
    </button>
  );
}

