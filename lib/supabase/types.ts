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
    };
    Views: { [_ in never]: never };
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

/**
 * Convenience Type Aliases for Application Code
 */
export type EquipmentCategoryRow = Database["public"]["Tables"]["equipment_categories"]["Row"];
export type EquipmentCategoryInsert = Database["public"]["Tables"]["equipment_categories"]["Insert"];
export type EquipmentCategoryUpdate = Database["public"]["Tables"]["equipment_categories"]["Update"];

export type EquipmentRow = Database["public"]["Tables"]["equipment"]["Row"];
export type EquipmentInsert = Database["public"]["Tables"]["equipment"]["Insert"];
export type EquipmentUpdate = Database["public"]["Tables"]["equipment"]["Update"];
