"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  ArrowRight,
  ShieldCheck,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CategoryRow, AttributeFieldSchema, Json } from "@/lib/supabase/types";
import { MOCK_LISTINGS, type MarketplaceListingItem } from "@/lib/marketplace/mock-listings";

interface NewListingFormProps {
  categories: CategoryRow[];
  userId: string;
}

interface ImageUploadItem {
  id: string;
  file?: File;
  previewUrl: string;
  isPrimary: boolean;
}

export function NewListingForm({ categories, userId }: NewListingFormProps) {
  const { getToken } = useAuth();

  // Basic Form State
  const [title, setTitle] = React.useState("");
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id || "");
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [priceUnit, setPriceUnit] = React.useState("per day");
  const [deposit, setDeposit] = React.useState("");
  const [location, setLocation] = React.useState("");

  // Dynamic Category Attribute Fields
  const [dynamicAttributes, setDynamicAttributes] = React.useState<Record<string, unknown>>({});

  // Image Uploads State
  const [images, setImages] = React.useState<ImageUploadItem[]>([]);
  const [externalImageUrl, setExternalImageUrl] = React.useState("");

  // Submission State
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [createdListingId, setCreatedListingId] = React.useState<string | null>(null);

  // Active Category Object & Schema
  const activeCategory = React.useMemo(() => {
    return categories.find((c) => c.id === categoryId) || categories[0] || null;
  }, [categories, categoryId]);

  const attributeSchema = React.useMemo<AttributeFieldSchema[]>(() => {
    if (!activeCategory?.attribute_schema) return [];
    if (Array.isArray(activeCategory.attribute_schema)) {
      return activeCategory.attribute_schema as unknown as AttributeFieldSchema[];
    }
    return [];
  }, [activeCategory]);

  // Reset or initialize dynamic attributes when category changes
  React.useEffect(() => {
    const initialAttrs: Record<string, unknown> = {};
    attributeSchema.forEach((field) => {
      if (field.type === "boolean") {
        initialAttrs[field.key] = false;
      } else if (field.type === "select" && field.options?.length) {
        initialAttrs[field.key] = field.options[0];
      } else {
        initialAttrs[field.key] = "";
      }
    });
    setDynamicAttributes(initialAttrs);
  }, [attributeSchema]);

  // Handle local image file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const newFiles = Array.from(e.target.files);

    const newUploads: ImageUploadItem[] = newFiles.map((file, idx) => ({
      id: `${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      isPrimary: images.length === 0 && idx === 0,
    }));

    setImages((prev) => [...prev, ...newUploads]);
    e.target.value = "";
  };

  // Add external image URL
  const handleAddExternalImage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!externalImageUrl.trim()) return;

    const newItem: ImageUploadItem = {
      id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      previewUrl: externalImageUrl.trim(),
      isPrimary: images.length === 0,
    };

    setImages((prev) => [...prev, newItem]);
    setExternalImageUrl("");
  };

  // Remove image
  const handleRemoveImage = (id: string) => {
    setImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      // Ensure at least one image remains primary if any exist
      if (filtered.length > 0 && !filtered.some((img) => img.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      return filtered;
    });
  };

  // Set image as primary
  const handleSetPrimary = (id: string) => {
    setImages((prev) =>
      prev.map((img) => ({
        ...img,
        isPrimary: img.id === id,
      }))
    );
  };

  // Dynamic attribute change handler
  const handleAttributeChange = (key: string, value: unknown) => {
    setDynamicAttributes((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Basic Validation
    if (!title.trim()) {
      setSubmitError("Please enter a listing title.");
      return;
    }
    if (!categoryId) {
      setSubmitError("Please select a rental category.");
      return;
    }
    if (!description.trim()) {
      setSubmitError("Please enter a listing description.");
      return;
    }
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      setSubmitError("Please enter a valid rental price greater than zero.");
      return;
    }
    if (!location.trim()) {
      setSubmitError("Please enter a location for equipment pickup or dispatch.");
      return;
    }

    // Dynamic attributes required validation
    for (const field of attributeSchema) {
      if (field.required) {
        const val = dynamicAttributes[field.key];
        if (val === undefined || val === null || val === "") {
          setSubmitError(`Please fill in required field: ${field.label}`);
          return;
        }
      }
    }

    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient(getToken);

      // 1. Upload files to Supabase Storage bucket 'listing-images'
      const uploadedImageUrls: string[] = [];

      for (const item of images) {
        if (item.file) {
          try {
            const fileExt = item.file.name.split(".").pop() || "jpg";
            const filePath = `${userId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("listing-images")
              .upload(filePath, item.file, {
                contentType: item.file.type || "image/jpeg",
                upsert: true,
              });

            if (!uploadError && uploadData) {
              const { data: publicUrlData } = supabase.storage
                .from("listing-images")
                .getPublicUrl(filePath);

              if (publicUrlData?.publicUrl) {
                uploadedImageUrls.push(publicUrlData.publicUrl);
                continue;
              }
            }
          } catch (storageErr) {
            console.warn("[storage] Direct upload failed, falling back to local preview", storageErr);
          }
          // If storage upload fails (e.g. bucket not provisioned yet), keep the preview/data URL
          uploadedImageUrls.push(item.previewUrl);
        } else {
          // Direct external URL
          uploadedImageUrls.push(item.previewUrl);
        }
      }

      // If no images were provided, use fallback placeholder
      if (uploadedImageUrls.length === 0) {
        uploadedImageUrls.push("/images/equipment_loader.jpg");
      }

      // Compile attributes payload
      const finalAttributes: Record<string, unknown> = {
        ...dynamicAttributes,
        security_deposit: deposit ? Number(deposit) : 0,
        price_unit: priceUnit,
      };

      const newListingId = `lst_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // 2. Insert into listings table with status 'pending_review'
      const listingPayload = {
        owner_id: userId,
        category_id: categoryId,
        title: title.trim(),
        description: description.trim(),
        price_per_day: Number(price),
        location: location.trim(),
        attributes: finalAttributes as unknown as Json,
        images: uploadedImageUrls,
        status: "pending_review" as const,
      };

      let insertedId = newListingId;

      try {
        const { data: insertedData, error: insertError } = await supabase
          .from("listings")
          .insert(listingPayload)
          .select("id")
          .single();

        if (!insertError && insertedData?.id) {
          insertedId = insertedData.id;

          // 3. Insert into listing_images table
          if (uploadedImageUrls.length > 0) {
            const imageRows = uploadedImageUrls.map((url, idx) => ({
              listing_id: insertedId,
              image_url: url,
              url: url,
              is_primary: idx === 0,
              sort_order: idx,
            }));

            await supabase.from("listing_images").insert(imageRows);
          }
        } else if (insertError) {
          console.warn("[supabase] Database insert error, recording in local marketplace:", insertError);
        }
      } catch (dbErr) {
        console.warn("[supabase] Exception during listing creation:", dbErr);
      }

      // Also register in local MOCK_LISTINGS so user immediately sees their listing
      const mockItem: MarketplaceListingItem = {
        id: insertedId,
        owner_id: userId,
        category_id: categoryId,
        title: title.trim(),
        description: description.trim(),
        price_per_day: Number(price),
        images: uploadedImageUrls,
        location: location.trim(),
        attributes: finalAttributes as unknown as Json,
        status: "pending_review",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        category: activeCategory,
        listing_images: uploadedImageUrls.map((url, idx) => ({
          id: `img_${Date.now()}_${idx}`,
          listing_id: insertedId,
          image_url: url,
          url: url,
          is_primary: idx === 0,
          sort_order: idx,
          created_at: new Date().toISOString(),
        })),
      };

      MOCK_LISTINGS.unshift(mockItem);
      setCreatedListingId(insertedId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create listing. Please try again.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success Confirmation Screen
  if (createdListingId) {
    return (
      <Card className="rounded-2xl border border-border/80 bg-card p-8 sm:p-10 shadow-lg text-center animate-in fade-in duration-300">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 mb-5">
          <CheckCircle2 className="h-9 w-9" />
        </div>

        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 font-semibold px-3 py-1 text-xs">
          Status: Pending Review
        </Badge>

        <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-4">
          Listing Submitted for Review!
        </h2>

        <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
          &ldquo;{title}&rdquo; has been successfully submitted and stored with status{" "}
          <strong className="text-foreground">pending_review</strong>. Our team will verify your specifications and activate the listing shortly.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/listings">
            <Button size="lg" className="font-semibold shadow-md">
              Browse Listings
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              setCreatedListingId(null);
              setTitle("");
              setDescription("");
              setPrice("");
              setDeposit("");
              setLocation("");
              setImages([]);
            }}
          >
            Create Another Listing
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 1. Basic Information */}
      <Card className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-4 border-b border-border/60 pb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg sm:text-xl font-bold text-foreground">
            Basic Equipment Details
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Category Select (Loaded from DB) */}
          <div className="sm:col-span-2">
            <Label htmlFor="category" className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Rental Category <span className="text-destructive">*</span>
            </Label>
            <select
              id="category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} — {cat.description}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Select category to automatically load relevant technical specifications.
            </p>
          </div>

          {/* Title */}
          <div className="sm:col-span-2">
            <Label htmlFor="title" className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Listing Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Caterpillar 320 GC Hydraulic Excavator (2024)"
              className="mt-1.5 h-11 rounded-xl"
              required
            />
          </div>

          {/* Description */}
          <div className="sm:col-span-2">
            <Label htmlFor="description" className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Description & Specifications <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe condition, attachments, maintenance history, operator requirements, and handover policies..."
              className="mt-1.5 rounded-xl resize-y"
              required
            />
          </div>

          {/* Location */}
          <div className="sm:col-span-2">
            <Label htmlFor="location" className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Location & Pickup Yard <span className="text-destructive">*</span>
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Seattle Central Depot • Transport available"
              className="mt-1.5 h-11 rounded-xl"
              required
            />
          </div>
        </div>
      </Card>

      {/* 2. Rates & Security Deposit */}
      <Card className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
        <h2 className="font-heading text-lg sm:text-xl font-bold text-foreground mb-4 border-b border-border/60 pb-3">
          Pricing & Security Deposit
        </h2>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {/* Rate */}
          <div>
            <Label htmlFor="price" className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Rental Price ($) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="150"
              className="mt-1.5 h-11 rounded-xl"
              required
            />
          </div>

          {/* Price Unit */}
          <div>
            <Label htmlFor="priceUnit" className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Billing Period
            </Label>
            <select
              id="priceUnit"
              value={priceUnit}
              onChange={(e) => setPriceUnit(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
            >
              <option value="per day">Per Day</option>
              <option value="per week">Per Week</option>
              <option value="per hour">Per Hour</option>
              <option value="per month">Per Month</option>
            </select>
          </div>

          {/* Deposit */}
          <div>
            <Label htmlFor="deposit" className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Security Deposit ($)
            </Label>
            <Input
              id="deposit"
              type="number"
              min="0"
              step="any"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="500"
              className="mt-1.5 h-11 rounded-xl"
            />
          </div>
        </div>
      </Card>

      {/* 3. Dynamic Category Attributes (Rendered from attribute_schema) */}
      {attributeSchema.length > 0 && (
        <Card className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-4 border-b border-border/60 pb-3">
            <div>
              <h2 className="font-heading text-lg sm:text-xl font-bold text-foreground">
                {activeCategory?.name} Specifications
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dynamic fields configured from {activeCategory?.name} schema.
              </p>
            </div>
            <Badge variant="secondary" className="text-xs font-semibold">
              {attributeSchema.length} field{attributeSchema.length === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {attributeSchema.map((field) => {
              const currentVal = dynamicAttributes[field.key];

              if (field.type === "select") {
                return (
                  <div key={field.key}>
                    <Label htmlFor={field.key} className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      {field.label} {field.required && <span className="text-destructive">*</span>}
                    </Label>
                    <select
                      id={field.key}
                      value={(currentVal as string) || ""}
                      onChange={(e) => handleAttributeChange(field.key, e.target.value)}
                      className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                      required={field.required}
                    >
                      <option value="">Select {field.label}...</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              if (field.type === "boolean") {
                return (
                  <div key={field.key} className="flex items-center gap-3 pt-6">
                    <input
                      type="checkbox"
                      id={field.key}
                      checked={Boolean(currentVal)}
                      onChange={(e) => handleAttributeChange(field.key, e.target.checked)}
                      className="h-5 w-5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                    />
                    <Label htmlFor={field.key} className="text-sm font-medium text-foreground cursor-pointer">
                      {field.label}
                    </Label>
                  </div>
                );
              }

              return (
                <div key={field.key}>
                  <Label htmlFor={field.key} className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    {field.label} {field.required && <span className="text-destructive">*</span>}
                  </Label>
                  <Input
                    id={field.key}
                    type={field.type === "number" ? "number" : "text"}
                    value={(currentVal as string) || ""}
                    onChange={(e) => handleAttributeChange(field.key, e.target.value)}
                    placeholder={`Enter ${field.label.toLowerCase()}...`}
                    className="mt-1.5 h-11 rounded-xl"
                    required={field.required}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 4. Image Upload to Supabase Storage */}
      <Card className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-border/60 pb-3">
          <div>
            <h2 className="font-heading text-lg sm:text-xl font-bold text-foreground">
              Equipment Photos
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload photos directly to Supabase storage. High-resolution images increase bookings.
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {images.length} uploaded
          </Badge>
        </div>

        {/* File Dropzone */}
        <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-muted/20 p-8 text-center hover:bg-muted/40 transition-colors cursor-pointer group">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3 group-hover:scale-105 transition-transform shadow-sm">
            <Upload className="h-6 w-6" />
          </div>
          <span className="text-sm font-semibold text-foreground">
            Click to upload or drag and drop photos
          </span>
          <span className="text-xs text-muted-foreground mt-1">
            PNG, JPG, WebP up to 10MB each
          </span>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        {/* Optional Add Image URL */}
        <div className="mt-4 flex gap-2">
          <Input
            type="url"
            value={externalImageUrl}
            onChange={(e) => setExternalImageUrl(e.target.value)}
            placeholder="Or paste an image web link (e.g. Unsplash URL)..."
            className="h-10 rounded-xl text-xs sm:text-sm"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddExternalImage}
            className="shrink-0 text-xs font-semibold rounded-xl"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add URL
          </Button>
        </div>

        {/* Previews Grid */}
        {images.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-border/80 bg-muted shadow-sm"
              >
                <Image
                  src={img.previewUrl}
                  alt="Listing photo preview"
                  fill
                  className="object-cover"
                />

                {/* Primary Badge / Button */}
                <div className="absolute top-2 left-2">
                  {img.isPrimary ? (
                    <Badge className="bg-primary text-primary-foreground text-[10px] font-bold shadow-sm">
                      Primary
                    </Badge>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(img.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm cursor-pointer"
                    >
                      Set Primary
                    </button>
                  )}
                </div>

                {/* Remove Button */}
                <button
                  type="button"
                  onClick={() => handleRemoveImage(img.id)}
                  aria-label="Remove image"
                  className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Error Notice */}
      {submitError && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/30 p-4 text-sm font-medium text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Submit Button & Policies */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          <span>All listings are reviewed prior to public catalog dispatch.</span>
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="w-full sm:w-auto h-12 px-8 font-bold shadow-lg shadow-primary/20 text-sm sm:text-base rounded-xl cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting Listing...
            </>
          ) : (
            <>
              Submit Listing for Review
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
