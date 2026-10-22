"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ListingGalleryProps {
  images: string[];
  title: string;
}

export function ListingGallery({ images, title }: ListingGalleryProps) {
  const displayImages = images.length > 0 ? images : ["/images/equipment_loader.jpg"];
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

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

  // Keyboard navigation support for both inline gallery and fullscreen viewer
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      if (e.key === "Escape") {
        setIsFullscreen(false);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isFullscreen, handlePrev, handleNext]);

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (isFullscreen) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handlePrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleNext();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsFullscreen(true);
    }
  };

  return (
    <>
      <div
        className="space-y-3 focus:outline-none"
        onKeyDown={handleInlineKeyDown}
        tabIndex={hasMultipleImages ? 0 : undefined}
        aria-label={`${title} image gallery`}
        role="region"
      >
        {/* Main Display with Navigation Controls & Fullscreen Trigger */}
        <div className="group relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border/80 bg-muted shadow-sm">
          <Image
            src={activeImage}
            alt={`${title} - Image ${activeIndex + 1} of ${totalImages}`}
            fill
            priority
            onClick={() => setIsFullscreen(true)}
            className="object-cover transition-opacity duration-200 cursor-zoom-in"
            sizes="(max-width: 1024px) 100vw, 65vw"
          />

          {/* Fullscreen Expand Button */}
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            aria-label="Open fullscreen viewer"
            className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-xl bg-background/80 text-foreground backdrop-blur-md shadow-sm transition-all hover:bg-background hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary opacity-90 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
          >
            <Maximize2 className="h-4 w-4" />
          </button>

          {/* Next / Previous Overlay Buttons (Hidden if single image) */}
          {hasMultipleImages && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                aria-label="Previous image"
                className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur-md shadow-md transition-all hover:bg-background hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary opacity-90 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                aria-label="Next image"
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur-md shadow-md transition-all hover:bg-background hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary opacity-90 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
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
                  className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer ${
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

      {/* Full-Screen Lightbox Modal */}
      {isFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} Fullscreen Gallery`}
          className="fixed inset-0 z-50 flex flex-col justify-between bg-black/95 p-4 sm:p-6 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsFullscreen(false)}
        >
          {/* Top Bar: Title, Count, Close */}
          <div
            className="flex items-center justify-between text-white z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="border-white/30 text-white bg-white/10 text-xs">
                {activeIndex + 1} of {totalImages}
              </Badge>
              <h3 className="font-heading text-sm sm:text-base font-semibold line-clamp-1 max-w-md">
                {title}
              </h3>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(false)}
              aria-label="Close fullscreen view (Esc)"
              className="h-10 w-10 rounded-full text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="h-6 w-6" />
            </Button>
          </div>

          {/* Center Image Viewport */}
          <div
            className="relative flex-1 my-4 flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-full w-full max-w-5xl">
              <Image
                src={activeImage}
                alt={`${title} - Fullscreen View ${activeIndex + 1}`}
                fill
                priority
                className="object-contain"
                sizes="100vw"
              />
            </div>

            {/* Previous Button */}
            {hasMultipleImages && (
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous image"
                className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md shadow-lg transition-all hover:bg-black/80 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* Next Button */}
            {hasMultipleImages && (
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next image"
                className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md shadow-lg transition-all hover:bg-black/80 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* Bottom Thumbnails Carousel */}
          {hasMultipleImages && (
            <div
              className="flex justify-center overflow-x-auto gap-2 py-2 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-2 p-1 rounded-2xl bg-black/50 backdrop-blur-md max-w-full overflow-x-auto scrollbar-none">
                {displayImages.map((img, idx) => {
                  const isSelected = activeIndex === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      aria-label={`Jump to photo ${idx + 1}`}
                      onClick={() => setCurrentIndex(idx)}
                      className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary scale-105 opacity-100 shadow-md"
                          : "border-white/20 opacity-50 hover:opacity-90"
                      }`}
                    >
                      <Image
                        src={img}
                        alt={`${title} thumbnail ${idx + 1}`}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

