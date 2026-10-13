"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ListingGalleryProps {
  images: string[];
  title: string;
}

export function ListingGallery({ images, title }: ListingGalleryProps) {
  const displayImages = images.length > 0 ? images : ["/images/equipment_loader.jpg"];
  const [currentIndex, setCurrentIndex] = React.useState(0);

  const totalImages = displayImages.length;
  const hasMultipleImages = totalImages > 1;

  // Safe bounds check if images array changes
  const activeIndex = Math.min(Math.max(0, currentIndex), totalImages - 1);
  const activeImage = displayImages[activeIndex] || displayImages[0];

  const handlePrev = React.useCallback(() => {
    if (!hasMultipleImages) return;
    setCurrentIndex((prev) => (prev === 0 ? totalImages - 1 : prev - 1));
  }, [hasMultipleImages, totalImages]);

  const handleNext = React.useCallback(() => {
    if (!hasMultipleImages) return;
    setCurrentIndex((prev) => (prev === totalImages - 1 ? 0 : prev + 1));
  }, [hasMultipleImages, totalImages]);

  // Keyboard navigation support
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!hasMultipleImages) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    },
    [handlePrev, handleNext, hasMultipleImages]
  );

  return (
    <div
      className="space-y-3 focus:outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={hasMultipleImages ? 0 : undefined}
      aria-label={`${title} image gallery`}
      role="region"
    >
      {/* Main Display with Navigation Controls */}
      <div className="group relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border/80 bg-muted shadow-sm">
        <Image
          src={activeImage}
          alt={`${title} - Image ${activeIndex + 1} of ${totalImages}`}
          fill
          priority
          className="object-cover transition-opacity duration-200"
          sizes="(max-width: 1024px) 100vw, 65vw"
        />

        {/* Next / Previous Overlay Buttons (Hidden if single image) */}
        {hasMultipleImages && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur-md shadow-md transition-all hover:bg-background hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur-md shadow-md transition-all hover:bg-background hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>

            {/* Photo Counter Badge */}
            <div className="absolute bottom-3 right-3 pointer-events-none">
              <Badge
                variant="secondary"
                className="bg-black/70 text-white border-0 font-medium text-xs px-2.5 py-0.5 backdrop-blur-md shadow-sm"
              >
                {activeIndex + 1} / {totalImages}
              </Badge>
            </div>
          </>
        )}
      </div>

      {/* Thumbnails Strip */}
      {hasMultipleImages && (
        <div
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
          role="tablist"
          aria-label="Image thumbnails"
        >
          {displayImages.map((img, idx) => {
            const isSelected = activeIndex === idx;
            return (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={`Select photo ${idx + 1}`}
                onClick={() => setCurrentIndex(idx)}
                className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSelected
                    ? "border-primary ring-2 ring-primary/30 opacity-100 scale-[1.02] shadow-sm"
                    : "border-border/60 opacity-60 hover:opacity-90"
                }`}
              >
                <Image
                  src={img}
                  alt={`${title} thumbnail ${idx + 1}`}
                  fill
                  className="object-cover"
                  sizes="96px"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
