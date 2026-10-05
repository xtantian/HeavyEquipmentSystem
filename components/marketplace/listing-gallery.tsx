"use client";

import * as React from "react";
import Image from "next/image";

interface ListingGalleryProps {
  images: string[];
  title: string;
}

export function ListingGallery({ images, title }: ListingGalleryProps) {
  const displayImages = images.length > 0 ? images : ["/images/equipment_loader.jpg"];
  const [selectedImage, setSelectedImage] = React.useState(displayImages[0]);

  return (
    <div className="space-y-3">
      {/* Main Display */}
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border/80 bg-muted shadow-sm">
        <Image
          src={selectedImage}
          alt={title}
          fill
          priority
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 65vw"
        />
      </div>

      {/* Thumbnails */}
      {displayImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {displayImages.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedImage(img)}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                selectedImage === img
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border/60 opacity-70 hover:opacity-100"
              }`}
            >
              <Image
                src={img}
                alt={`${title} photo ${idx + 1}`}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
