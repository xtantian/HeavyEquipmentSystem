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
 * Type-safe Supabase database schema.
 *
 * Add new tables here as the domain model grows. Keep this file the single
 * source of truth for database shape; import `Database` into every Supabase
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
        /**
         * Required by @supabase/supabase-js GenericTable constraint.
         * profiles has no foreign-key relationships yet; extend this array
         * when FK relations to other tables are added.
         */
        Relationships: [];
      };
    };
    // No views or functions defined yet.
    // Uses { [_ in never]: never } (the empty-object type) to satisfy the
    // GenericSchema constraint without mapping any keys.
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      user_role: UserRole;
    };
  };
}
