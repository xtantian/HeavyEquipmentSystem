"use client";

// [IMPORT] React core hooks, Clerk browser auth, Lucide icons, and UI primitives.
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
import { createListingAction } from "@/app/listings/actions";
import type { CategoryRow, AttributeFieldSchema } from "@/lib/supabase/types";

// [FUNC] Helper function to initialize dynamic attributes based on category JSON schema.
function getInitialAttributes(schema: AttributeFieldSchema[]): Record<string, unknown> {
  const initialAttrs: Record<string, unknown> = {};
  schema.forEach((field) => {
    if (field.type === "boolean") {
      initialAttrs[field.key] = false;
    } else if (field.type === "select" && field.options?.length) {
      initialAttrs[field.key] = field.options[0];
    } else {
      initialAttrs[field.key] = "";
    }
  });
  return initialAttrs;
}

// [TYPE] + [PROPS] Interface specifying props passed from the server page into the new listing form.
interface NewListingFormProps {
  categories: CategoryRow[];
  userId: string;
}

// [TYPE] Interface representing an uploaded or previewed equipment image.
interface ImageUploadItem {
  id: string;
  file?: File;
  previewUrl: string;
  isPrimary: boolean;
}

// [FUNC] + [PROPS] Primary equipment creation form component.
export function NewListingForm({ categories, userId }: NewListingFormProps) {
  // [AUTH] Hook providing function to fetch fresh Clerk session tokens for Supabase.
  const { getToken } = useAuth();

  // Basic Form State
  // [STATE] Controlled input state for listing title.
  const [title, setTitle] = React.useState("");
  // [STATE] Selected equipment category ID.
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id || "");
  // [STATE] Description text state.
  const [description, setDescription] = React.useState("");
  // [STATE] Daily rental rate string state.
  const [price, setPrice] = React.useState("");
  const [priceUnit, setPriceUnit] = React.useState("per day");
  const [deposit, setDeposit] = React.useState("");
  // [STATE] Physical equipment location.
  const [location, setLocation] = React.useState("");
  // [STATE] Machinery Serial, VIN, or Unit Identifier.
  const [assetIdentifier, setAssetIdentifier] = React.useState("");

  // Dynamic Category Attribute Fields
  // [STATE] Key-value dictionary storing category-specific specifications (e.g. engine horsepower, tonnage).
  const [dynamicAttributes, setDynamicAttributes] = React.useState<Record<string, unknown>>(() => {
    const initialCat = categories[0] || null;
    const initialSchema = Array.isArray(initialCat?.attribute_schema)
      ? (initialCat.attribute_schema as unknown as AttributeFieldSchema[])
      : [];
    return getInitialAttributes(initialSchema);
  });

  // Image Uploads State
  // [STATE] Array of staged equipment images with previews.
  const [images, setImages] = React.useState<ImageUploadItem[]>([]);
  const [externalImageUrl, setExternalImageUrl] = React.useState("");

  // Submission State
  // [STATE] Loading state during upload and database submission.
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  // [STATE] Form error message display.
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [duplicateListingId, setDuplicateListingId] = React.useState<string | null>(null);
  // [STATE] Stores newly created listing UUID on success to display confirmation view.
  const [createdListingId, setCreatedListingId] = React.useState<string | null>(null);

  // Active Category Object & Schema
  // [METHOD] Memoize active category object so attribute form fields update when category changes.
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

  const { assetIdLabel, assetIdPlaceholder } = React.useMemo(() => {
    const slug = activeCategory?.slug || "";
    if (slug === "cars" || slug === "motorbikes") {
      return {
        assetIdLabel: "VIN, Chassis, or Plate Number",
        assetIdPlaceholder: "e.g. 1HGCR2F83HA000123 or ABC-1234",
      };
    }
    if (slug === "special-vehicles") {
      return {
        assetIdLabel: "Chassis, Hull ID, or License Plate",
        assetIdPlaceholder: "e.g. HIN-US-123456 or Plate ABC-987",
      };
    }
    if (slug === "industrial") {
      return {
        assetIdLabel: "Machine PIN / Serial Number",
        assetIdPlaceholder: "e.g. CAT0320GCK82910 or SN-90218",
      };
    }
    if (slug === "mobile-phones-gadgets" || slug === "computers-tech") {
      return {
        assetIdLabel: "IMEI or Device Serial Number",
        assetIdPlaceholder: "e.g. 352093081928312 or C02G8192MD6R",
      };
    }
    if (slug === "property") {
      return {
        assetIdLabel: "Property Title / Unit Reference",
        assetIdPlaceholder: "e.g. Unit 14-B or TCT-129482",
      };
    }
    return {
      assetIdLabel: "Asset Identifier or Serial / Tag Number",
      assetIdPlaceholder: "e.g. TAG-2024-001 or SN-10928",
    };
  }, [activeCategory]);

  const handleCategoryChange = (newCatId: string) => {
    setCategoryId(newCatId);
    const selectedCat = categories.find((c) => c.id === newCatId);
    const schema = Array.isArray(selectedCat?.attribute_schema)
      ? (selectedCat.attribute_schema as unknown as AttributeFieldSchema[])
      : [];
    setDynamicAttributes(getInitialAttributes(schema));
  };

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

      // Verify user account status
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("status")
        .eq("clerk_user_id", userId)
        .maybeSingle();

      if (userProfile?.status === "restricted") {
        setSubmitError("Your account is currently restricted from creating new listings. Please contact administration.");
        setIsSubmitting(false);
        return;
      }
      if (userProfile?.status === "banned" || userProfile?.status === "deleted") {
        setSubmitError("Your account is suspended and cannot post listings.");
        setIsSubmitting(false);
        return;
      }

      // 1. Upload files to Supabase Storage bucket 'listing-images'
      const uploadedImageUrls: string[] = [];

      for (const item of images) {
        if (item.file) {
          try {
            const fileExt = item.file.name.split(".").pop() || "jpg";
            const filePath = `${userId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

            let fileUploadSucceeded = false;
            let filePublicUrl = "";

            // Attempt 1: Upload with primary client
            let { data: uploadData, error: uploadError } = await supabase.storage
              .from("listing-images")
              .upload(filePath, item.file, {
                contentType: item.file.type || "image/jpeg",
                upsert: true,
              });

            // If JWT/Auth rejected, retry with public anon client
            const errObj = uploadError as unknown as { statusCode?: string | number; status?: number };
            if (
              uploadError &&
              (uploadError.message?.toLowerCase().includes("jwt") ||
                uploadError.message?.toLowerCase().includes("auth") ||
                errObj.status === 401 ||
                errObj.statusCode === 401 ||
                errObj.statusCode === "401")
            ) {
              const publicClient = createSupabaseBrowserClient(null);
              const retryUpload = await publicClient.storage
                .from("listing-images")
                .upload(filePath, item.file, {
                  contentType: item.file.type || "image/jpeg",
                  upsert: true,
                });
              uploadData = retryUpload.data;
              uploadError = retryUpload.error;
            }

            if (!uploadError && uploadData) {
              const { data: publicUrlData } = supabase.storage
                .from("listing-images")
                .getPublicUrl(filePath);

              if (publicUrlData?.publicUrl) {
                filePublicUrl = publicUrlData.publicUrl;
                fileUploadSucceeded = true;
              }
            } else if (uploadError) {
              console.warn("[storage] Image upload failed:", uploadError.message);
            }

            if (fileUploadSucceeded && filePublicUrl) {
              uploadedImageUrls.push(filePublicUrl);
            } else {
              const failureMsg = uploadError?.message || "Storage service error.";
              console.error("[storage] Photo upload failed for file:", item.file.name, failureMsg);
              setSubmitError(`Failed to upload photo "${item.file.name}". ${failureMsg}`);
              setIsSubmitting(false);
              return;
            }
          } catch (storageErr) {
            console.error("[storage] Direct upload exception:", storageErr);
            const failureMsg = storageErr instanceof Error ? storageErr.message : "Network error during upload.";
            setSubmitError(`Failed to upload photo "${item.file.name}". ${failureMsg}`);
            setIsSubmitting(false);
            return;
          }
        } else if (item.previewUrl && !item.previewUrl.startsWith("blob:")) {
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

      // 2. Publish listing through authoritative server action with duplicate physical item prevention
      const result = await createListingAction({
        title,
        description,
        categoryId,
        pricePerDay: Number(price),
        location,
        images: uploadedImageUrls,
        attributes: finalAttributes,
        assetIdentifier: assetIdentifier.trim() || undefined,
      });

      if (!result.success) {
        setSubmitError(result.error || "Failed to publish listing.");
        if (result.duplicate && result.existingListingId) {
          setDuplicateListingId(result.existingListingId);
        }
        setIsSubmitting(false);
        return;
      }

      const insertedId = result.listingId || `lst_${Date.now()}`;
      setCreatedListingId(insertedId);

      // 3. Best-effort mirror into listing_images table for gallery relational indexing
      if (uploadedImageUrls.length > 0 && result.listingId) {
        try {
          const imageRows = uploadedImageUrls.map((url, idx) => ({
            listing_id: result.listingId!,
            image_url: url,
            is_primary: idx === 0,
            sort_order: idx,
          }));
          await supabase.from("listing_images").insert(imageRows);
        } catch (imgErr) {
          console.warn("[listing_images] Relational mirror warning:", imgErr);
        }
      }
    } catch (err: unknown) {
      console.error("[supabase] Uncaught exception during listing creation:", err);
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
              onChange={(e) => handleCategoryChange(e.target.value)}
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

          {/* Persistent Physical Asset Identifier (Private) */}
          <div className="sm:col-span-2 rounded-xl border border-border/80 bg-muted/40 p-4">
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="assetIdentifier" className="text-xs font-semibold text-foreground uppercase tracking-wider">
                {assetIdLabel} <span className="text-[11px] font-normal text-muted-foreground lowercase">(private)</span>
              </Label>
              <Badge variant="outline" className="text-[10px] uppercase font-semibold text-primary border-primary/30">
                Anti-Duplicate Protection
              </Badge>
            </div>
            <Input
              id="assetIdentifier"
              value={assetIdentifier}
              onChange={(e) => {
                setAssetIdentifier(e.target.value);
                if (duplicateListingId) {
                  setDuplicateListingId(null);
                  setSubmitError(null);
                }
              }}
              placeholder={assetIdPlaceholder}
              className="mt-1 h-11 rounded-xl bg-background"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Stored securely to prevent creating duplicate listings for the same physical unit. Never displayed publicly on the marketplace.
            </p>
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

      {/* Error / Duplicate Notice */}
      {submitError && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 text-sm font-medium text-destructive">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="leading-relaxed">{submitError}</p>
              {duplicateListingId && (
                <div className="pt-1">
                  <Link href={`/listings/${duplicateListingId}`}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 font-semibold cursor-pointer"
                    >
                      View & Manage Existing Listing
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
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
