import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number; // 0 to 5
  maxStars?: number;
  size?: "xs" | "sm" | "md" | "lg";
  interactive?: boolean;
  onRatingChange?: (rating: number) => void;
  className?: string;
}

export function StarRating({
  rating,
  maxStars = 5,
  size = "sm",
  interactive = false,
  onRatingChange,
  className,
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = React.useState<number | null>(null);

  const starSizes = {
    xs: "h-3 w-3",
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const currentDisplayRating = hoverRating !== null ? hoverRating : rating;

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      onMouseLeave={() => interactive && setHoverRating(null)}
      role={interactive ? "radiogroup" : "img"}
      aria-label={interactive ? "Rate from 1 to 5 stars" : `Rating: ${rating} out of ${maxStars} stars`}
    >
      {Array.from({ length: maxStars }).map((_, index) => {
        const starValue = index + 1;
        const isFilled = currentDisplayRating >= starValue;
        const isHalf = !isFilled && currentDisplayRating >= starValue - 0.5;

        return (
          <button
            key={index}
            type="button"
            disabled={!interactive}
            onClick={() => {
              if (interactive && onRatingChange) {
                onRatingChange(starValue);
              }
            }}
            onMouseEnter={() => interactive && setHoverRating(starValue)}
            className={cn(
              "transition-all duration-150",
              interactive ? "cursor-pointer p-0.5 hover:scale-110 focus:outline-none" : "cursor-default"
            )}
            tabIndex={interactive ? 0 : -1}
            aria-label={`${starValue} star`}
          >
            <Star
              className={cn(
                starSizes[size],
                isFilled
                  ? "fill-amber-400 text-amber-400 drop-shadow-sm"
                  : isHalf
                  ? "fill-amber-400/50 text-amber-400"
                  : "fill-muted/30 text-muted-foreground/40"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
