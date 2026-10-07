/**
 * Shared JSON scalar type for Supabase row/column values.
 * Used in the Database generic to type JSON columns correctly.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Application-level user roles.
 *
 * - customer  – can browse equipment, submit rental requests, track rentals.
 * - staff     – can review/approve requests, record releases and returns.
 * - manager   – can manage equipment pricing and view utilisation reports.
 * - admin     – full access: user management, configuration, audit logs.
 *
 * NOTE: Roles are stored in Supabase (not in Clerk metadata) so that RLS
 * policies can evaluate them without a round-trip to the Clerk API.
 * Role upgrades must go through the service-role client (admin UI / webhook),
 * never through user-controlled RLS updates.
 */
export type UserRole = "customer" | "staff" | "manager" | "admin";

/**
 * Equipment operational availability status.
 *
 * - available   – unit is functional and ready for booking/dispatch.
 * - reserved    – unit is allocated to an upcoming approved rental schedule.
 * - maintenance – unit is offline for servicing, inspection, or repair.
 * - inactive    – unit is retired or decommissioned from active fleet.
 */
export type EquipmentStatus = "available" | "reserved" | "maintenance" | "inactive";

/**
 * Type-safe Supabase database schema.
 *
 * Source of truth for database shape; import `Database` into every Supabase
 * client to get full TypeScript inference on queries.
 */
export interface Database {
  public: {
    Tables: {
      /**
       * profiles
       * Mirrors Clerk user identity in Supabase.
       *
       * Created/updated/anonymised by the Clerk webhook handler at
       * /api/webhooks/clerk. Never written directly by the browser.
       */
      profiles: {
        Row: {
          id: string;
          /** Stable Clerk user identifier (e.g. "user_xxxxxxxxxxxx"). */
          clerk_user_id: string;
          email: string | null;
          first_name: string | null;
          last_name: string | null;
          avatar_url: string | null;
          role: UserRole;
          status: UserAccountStatus;
          phone?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          status?: UserAccountStatus;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clerk_user_id?: string;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          status?: UserAccountStatus;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      /**
       * equipment_categories
       * High-level classification for heavy machinery units.
       */
      equipment_categories: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          description: string | null;
          icon_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug?: string | null;
          description?: string | null;
          icon_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string | null;
          description?: string | null;
          icon_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      /**
       * equipment
       * Heavy machinery fleet inventory available for rental operations.
       */
      equipment: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          model: string;
          description: string | null;
          image_url: string | null;
          daily_rate: number;
          weekly_rate: number;
          status: EquipmentStatus;
          power_source: string | null;
          operating_weight: string | null;
          specs: Json;
          suitable_projects: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          name: string;
          model: string;
          description?: string | null;
          image_url?: string | null;
          daily_rate: number;
          weekly_rate: number;
          status?: EquipmentStatus;
          power_source?: string | null;
          operating_weight?: string | null;
          specs?: Json;
          suitable_projects?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          name?: string;
          model?: string;
          description?: string | null;
          image_url?: string | null;
          daily_rate?: number;
          weekly_rate?: number;
          status?: EquipmentStatus;
          power_source?: string | null;
          operating_weight?: string | null;
          specs?: Json;
          suitable_projects?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "equipment_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "equipment_categories";
            referencedColumns: ["id"];
          }
        ];
      };

      /**
       * rental_requests
       * Captures rental quote requests submitted from equipment detail pages.
       */
      rental_requests: {
        Row: {
          id: string;
          equipment_id: string;
          equipment_name: string;
          user_id: string | null;
          customer_name: string | null;
          customer_email: string | null;
          customer_phone: string | null;
          rental_duration_days: number;
          daily_rate: number;
          estimated_total: number;
          project_location: string | null;
          notes: string | null;
          status: "pending" | "approved" | "rejected" | "completed" | "cancelled";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          equipment_id: string;
          equipment_name: string;
          user_id?: string | null;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
          rental_duration_days?: number;
          daily_rate?: number;
          estimated_total?: number;
          project_location?: string | null;
          notes?: string | null;
          status?: "pending" | "approved" | "rejected" | "completed" | "cancelled";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          equipment_id?: string;
          equipment_name?: string;
          user_id?: string | null;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
          rental_duration_days?: number;
          daily_rate?: number;
          estimated_total?: number;
          project_location?: string | null;
          notes?: string | null;
          status?: "pending" | "approved" | "rejected" | "completed" | "cancelled";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      /**
       * rental_inquiries
       * Captures heavy equipment rental inquiries from query parameters and inquiry forms.
       */
      rental_inquiries: {
        Row: {
          id: string;
          equipment_name: string;
          full_name: string;
          email: string;
          phone: string;
          project_location: string | null;
          start_date: string | null;
          end_date: string | null;
          message: string | null;
          rental_city: string | null;
          status: "pending" | "contacted" | "quoted" | "approved" | "rejected" | "completed";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          equipment_name: string;
          full_name: string;
          email: string;
          phone: string;
          project_location?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          message?: string | null;
          rental_city?: string | null;
          status?: "pending" | "contacted" | "quoted" | "approved" | "rejected" | "completed";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          equipment_name?: string;
          full_name?: string;
          email?: string;
          phone?: string;
          project_location?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          message?: string | null;
          rental_city?: string | null;
          status?: "pending" | "contacted" | "quoted" | "approved" | "rejected" | "completed";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      /**
       * categories
       * Multi-category marketplace taxonomy (heavy equipment, cars, boats, etc.)
       */
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          icon: string | null;
          description: string | null;
          attribute_schema: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          icon?: string | null;
          description?: string | null;
          attribute_schema?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          icon?: string | null;
          description?: string | null;
          attribute_schema?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      /**
       * listings
       * Multi-category rental marketplace inventory items
       */
      listings: {
        Row: {
          id: string;
          owner_id: string;
          category_id: string;
          title: string;
          description: string;
          price_per_day: number;
          images: string[];
          location: string;
          attributes: Json;
          status: ListingStatus;
          is_reported?: boolean;
          report_reason?: string | null;
          deleted_at?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          category_id: string;
          title: string;
          description: string;
          price_per_day: number;
          images?: string[];
          location: string;
          attributes?: Json;
          status?: ListingStatus;
          is_reported?: boolean;
          report_reason?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          category_id?: string;
          title?: string;
          description?: string;
          price_per_day?: number;
          images?: string[];
          location?: string;
          attributes?: Json;
          status?: ListingStatus;
          is_reported?: boolean;
          report_reason?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };

      /**
       * bookings
       * Bookings with no-overlap constraint across rental duration
       */
      bookings: {
        Row: {
          id: string;
          listing_id: string;
          renter_id: string;
          start_date: string;
          end_date: string;
          total_price: number;
          status: BookingStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          renter_id: string;
          start_date: string;
          end_date: string;
          total_price: number;
          status?: BookingStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          renter_id?: string;
          start_date?: string;
          end_date?: string;
          total_price?: number;
          status?: BookingStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          }
        ];
      };

      /**
       * reviews
       * Reviews and ratings left for listings/bookings
       */
      reviews: {
        Row: {
          id: string;
          listing_id: string;
          booking_id: string | null;
          reviewer_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          booking_id?: string | null;
          reviewer_id: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          booking_id?: string | null;
          reviewer_id?: string;
          rating?: number;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          }
        ];
      };

      /**
       * listing_images
       * Gallery images for marketplace listings
       */
      listing_images: {
        Row: {
          id: string;
          listing_id: string;
          image_url: string;
          url?: string;
          is_primary: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          image_url: string;
          url?: string;
          is_primary?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          image_url?: string;
          url?: string;
          is_primary?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          }
        ];
      };
      listing_reports: {
        Row: {
          id: string;
          listing_id: string;
          reporter_id: string | null;
          reporter_email: string | null;
          reason: string;
          details: string | null;
          status: "pending" | "reviewed" | "dismissed" | "action_taken";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          reporter_id?: string | null;
          reporter_email?: string | null;
          reason: string;
          details?: string | null;
          status?: "pending" | "reviewed" | "dismissed" | "action_taken";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          reporter_id?: string | null;
          reporter_email?: string | null;
          reason?: string;
          details?: string | null;
          status?: "pending" | "reviewed" | "dismissed" | "action_taken";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_reports_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          }
        ];
      };
      admin_audit_logs: {
        Row: {
          id: string;
          admin_id: string;
          admin_email: string | null;
          action: string;
          target_type: string;
          target_id: string;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          admin_email?: string | null;
          action: string;
          target_type: string;
          target_id: string;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          admin_email?: string | null;
          action?: string;
          target_type?: string;
          target_id?: string;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      quotes: {
        Row: Database["public"]["Tables"]["rental_requests"]["Row"];
        Relationships: [];
      };
    };
    Functions: {
      is_staff_or_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      equipment_status: EquipmentStatus;
    };
  };
}

export type BookingStatus =
  | "pending"
  | "accepted"
  | "paid"
  | "active"
  | "returned"
  | "completed"
  | "cancelled";

export type ListingStatus =
  | "available"
  | "rented"
  | "maintenance"
  | "inactive"
  | "pending_review"
  | "restricted"
  | "deleted";

export type UserAccountStatus = "active" | "restricted" | "banned" | "deleted";

export interface AttributeFieldSchema {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  options?: string[];
  required?: boolean;
}

/**
 * Convenience Type Aliases for Application Code
 */
export type EquipmentCategoryRow = Database["public"]["Tables"]["equipment_categories"]["Row"];
export type EquipmentCategoryInsert = Database["public"]["Tables"]["equipment_categories"]["Insert"];
export type EquipmentCategoryUpdate = Database["public"]["Tables"]["equipment_categories"]["Update"];

export type EquipmentRow = Database["public"]["Tables"]["equipment"]["Row"];
export type EquipmentInsert = Database["public"]["Tables"]["equipment"]["Insert"];
export type EquipmentUpdate = Database["public"]["Tables"]["equipment"]["Update"];

export type RentalRequestRow = Database["public"]["Tables"]["rental_requests"]["Row"];
export type RentalRequestInsert = Database["public"]["Tables"]["rental_requests"]["Insert"];
export type RentalRequestUpdate = Database["public"]["Tables"]["rental_requests"]["Update"];

export type RentalInquiryRow = Database["public"]["Tables"]["rental_inquiries"]["Row"];
export type RentalInquiryInsert = Database["public"]["Tables"]["rental_inquiries"]["Insert"];
export type RentalInquiryUpdate = Database["public"]["Tables"]["rental_inquiries"]["Update"];

export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
export type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];
export type CategoryUpdate = Database["public"]["Tables"]["categories"]["Update"];

export type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
export type ListingInsert = Database["public"]["Tables"]["listings"]["Insert"];
export type ListingUpdate = Database["public"]["Tables"]["listings"]["Update"];

export type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
export type BookingInsert = Database["public"]["Tables"]["bookings"]["Insert"];
export type BookingUpdate = Database["public"]["Tables"]["bookings"]["Update"];

export type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];
export type ReviewInsert = Database["public"]["Tables"]["reviews"]["Insert"];
export type ReviewUpdate = Database["public"]["Tables"]["reviews"]["Update"];

export type ListingImageRow = Database["public"]["Tables"]["listing_images"]["Row"];
export type ListingImageInsert = Database["public"]["Tables"]["listing_images"]["Insert"];
export type ListingImageUpdate = Database["public"]["Tables"]["listing_images"]["Update"];
