-- ============================================================
-- Migration: 013_dashboard_chat_fulfillment.sql
-- Purpose:   Dashboard overhaul, private post-approval messaging,
--            listing fulfillment methods, listing archiving, and
--            isolated physical custody verification workflow.
--
-- SECURITY ARCHITECTURE:
-- 1. Identity is derived strictly from Clerk via auth.jwt() ->> 'sub'.
-- 2. Privileged fields (role, status, is_verified, verified_at, verified_by)
--    are protected via BEFORE INSERT OR UPDATE triggers with no recursive
--    subqueries, avoiding infinite recursion.
-- 3. Inactive admins (status != 'active') cannot perform admin actions.
-- 4. Conversations are strictly 1-to-1 per approved booking, deriving
--    participants directly from authoritative booking and listing rows.
-- 5. Messages are immutable audit records: content and sender cannot be
--    modified, messages cannot be deleted, and read_at can only be
--    updated by the recipient.
-- 6. Verification evidence and codes are isolated in private table
--    public.listing_verifications with ON DELETE RESTRICT to preserve
--    audit history.
-- ============================================================

-- ── 1. Helper function: Active Administrator Verification ──────────────

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE clerk_user_id = (auth.jwt() ->> 'sub')
      AND role = 'admin'
      AND status = 'active'
  );
$$;

COMMENT ON FUNCTION public.is_active_admin() IS
  'Returns true only if the caller is an authenticated administrator with active account status.';

REVOKE EXECUTE ON FUNCTION public.is_active_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated, service_role;

-- Update legacy is_admin() to require active status
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_active_admin();
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ── 2. Add verification fields to profiles ─────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by text;

COMMENT ON COLUMN public.profiles.is_verified IS
  'Privileged badge flag. Can only be set by authorized active administrators.';

-- ── 3. Profile security trigger (non-recursive) ────────────────────────

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_jwt_sub text;
  v_is_adm boolean;
  v_db_role text;
BEGIN
  v_jwt_sub := auth.jwt() ->> 'sub';
  v_is_adm := public.is_active_admin();
  v_db_role := current_user;

  -- Explicit role boundary: Only trusted server roles (service_role, postgres) or active admins may access privileged paths
  IF v_db_role NOT IN ('service_role', 'postgres') AND NOT v_is_adm THEN
    -- Unauthenticated callers without valid JWT sub cannot create or alter profiles
    IF v_jwt_sub IS NULL THEN
      RAISE EXCEPTION 'Authentication required: Anonymous sessions cannot create or modify profiles.'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
      -- Identity must match authenticated Clerk session
      IF NEW.clerk_user_id IS NULL OR NEW.clerk_user_id != v_jwt_sub THEN
        RAISE EXCEPTION 'Identity mismatch: clerk_user_id must match authenticated session (%).', v_jwt_sub
          USING ERRCODE = '42501';
      END IF;

      -- Privileged fields cannot be self-asserted
      IF NEW.role IS DISTINCT FROM 'customer' THEN
        RAISE EXCEPTION 'Privilege escalation: new profiles must have role customer.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Invalid status: new profiles must have status active.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.is_verified IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'Privilege escalation: new profiles cannot self-assert verified status.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.verified_at IS NOT NULL OR NEW.verified_by IS NOT NULL THEN
        RAISE EXCEPTION 'Privilege escalation: verification metadata must be null for new profiles.'
          USING ERRCODE = '42501';
      END IF;

    ELSIF TG_OP = 'UPDATE' THEN
      -- Identity is strictly immutable
      IF NEW.clerk_user_id IS DISTINCT FROM OLD.clerk_user_id THEN
        RAISE EXCEPTION 'Immutable field: clerk_user_id cannot be changed.'
          USING ERRCODE = '42501';
      END IF;

      -- Privileged fields cannot be changed by non-admin
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Unauthorized: Normal users cannot modify role.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Unauthorized: Normal users cannot modify status.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
        RAISE EXCEPTION 'Unauthorized: Normal users cannot modify is_verified.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
        RAISE EXCEPTION 'Unauthorized: Normal users cannot modify verified_at.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
        RAISE EXCEPTION 'Unauthorized: Normal users cannot modify verified_by.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    -- For admins or service-role: clerk_user_id is still immutable once set
    IF TG_OP = 'UPDATE' AND (NEW.clerk_user_id IS DISTINCT FROM OLD.clerk_user_id) THEN
      RAISE EXCEPTION 'Immutable field: clerk_user_id cannot be changed.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_roles ON public.profiles;
DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;

CREATE TRIGGER trg_protect_profile_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_fields();

-- Drop recursive update policies on profiles and establish clean, non-recursive RLS
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow update profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

CREATE POLICY "profiles_update_policy"
  ON public.profiles
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
    OR public.is_active_admin()
  )
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;

CREATE POLICY "profiles_insert_policy"
  ON public.profiles
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND clerk_user_id = (auth.jwt() ->> 'sub'))
    OR public.is_active_admin()
  );

-- ── 4. Add verification & fulfillment columns to listings ──────────────

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by text,
  ADD COLUMN IF NOT EXISTS fulfillment_options text[] NOT NULL DEFAULT '{meetup}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listings_fulfillment_options_check'
      AND conrelid = 'public.listings'::regclass
  ) THEN
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_fulfillment_options_check
      CHECK (
        array_length(fulfillment_options, 1) > 0
        AND fulfillment_options <@ ARRAY['meetup'::text, 'delivery'::text, 'other'::text]
      );
  END IF;

  -- Ensure listings status constraint permits 'archived' for safe soft-deletion
  ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
  ALTER TABLE public.listings
    ADD CONSTRAINT listings_status_check
    CHECK (status IN ('available', 'rented', 'maintenance', 'inactive', 'pending_review', 'restricted', 'deleted', 'archived'));
END $$;

-- ── 5. Add fulfillment columns to bookings ─────────────────────────────

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS fulfillment_method text NOT NULL DEFAULT 'meetup',
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS fulfillment_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookings_fulfillment_method_check'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_fulfillment_method_check
      CHECK (fulfillment_method IN ('meetup', 'delivery', 'other'));
  END IF;
END $$;

-- Booking fulfillment validation trigger
CREATE OR REPLACE FUNCTION public.validate_booking_fulfillment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing_opts text[];
BEGIN
  SELECT fulfillment_options INTO v_listing_opts
  FROM public.listings
  WHERE id = NEW.listing_id;

  IF v_listing_opts IS NULL THEN
    RAISE EXCEPTION 'Listing % not found.', NEW.listing_id USING ERRCODE = '02000';
  END IF;

  IF NOT (NEW.fulfillment_method = ANY(v_listing_opts)) THEN
    RAISE EXCEPTION 'Selected fulfillment method (%) is not supported by listing %.',
      NEW.fulfillment_method, NEW.listing_id
      USING ERRCODE = '22023';
  END IF;

  IF NEW.fulfillment_method = 'delivery' THEN
    IF NEW.delivery_address IS NULL OR length(trim(NEW.delivery_address)) = 0 THEN
      RAISE EXCEPTION 'Delivery address is required for delivery fulfillment method.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_booking_fulfillment ON public.bookings;
CREATE TRIGGER trg_validate_booking_fulfillment
  BEFORE INSERT OR UPDATE OF fulfillment_method, listing_id ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_fulfillment();

-- ── 6. Listings security trigger (badge protection & safe archiving) ───

CREATE OR REPLACE FUNCTION public.protect_listing_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_sub text;
  v_is_adm boolean;
BEGIN
  -- Allow trusted cascading triggers (e.g. from listing_verifications sync)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_jwt_sub := auth.jwt() ->> 'sub';
  v_is_adm := public.is_active_admin();

  IF TG_OP = 'INSERT' THEN
    IF v_jwt_sub IS NOT NULL AND NOT v_is_adm THEN
      NEW.owner_id := v_jwt_sub;
      NEW.is_verified := false;
      NEW.verified_at := NULL;
      NEW.verified_by := NULL;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF v_jwt_sub IS NOT NULL AND NOT v_is_adm THEN
      -- Owner cannot be transferred
      IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
        RAISE EXCEPTION 'Immutable field: owner_id cannot be changed.'
          USING ERRCODE = '42501';
      END IF;

      -- Verification badge cannot be manipulated directly by owners
      IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
        RAISE EXCEPTION 'Unauthorized: Only authorized administrators can update listing verification badge.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
        RAISE EXCEPTION 'Unauthorized: verified_at cannot be updated directly.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
        RAISE EXCEPTION 'Unauthorized: verified_by cannot be updated directly.'
          USING ERRCODE = '42501';
      END IF;

      -- Safe archiving check: Cannot archive if active/pending rentals exist
      IF NEW.status = 'archived' AND OLD.status != 'archived' THEN
        IF EXISTS (
          SELECT 1 FROM public.bookings
          WHERE listing_id = OLD.id
            AND status IN ('pending', 'accepted', 'paid', 'active', 'confirmed', 'in_progress')
        ) THEN
          RAISE EXCEPTION 'Cannot archive listing while active or pending bookings exist.'
            USING ERRCODE = '23503';
        END IF;
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF v_jwt_sub IS NOT NULL AND NOT v_is_adm THEN
      RAISE EXCEPTION 'Physical deletion is forbidden. Use status = ''archived'' to safely retire listings.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_listing_security ON public.listings;
CREATE TRIGGER trg_protect_listing_security
  BEFORE INSERT OR UPDATE OR DELETE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_listing_security();

-- Drop previous delete policies and enforce trigger-backed delete protection
DROP POLICY IF EXISTS "Owners can delete own listings" ON public.listings;
DROP POLICY IF EXISTS "Owners can delete listings" ON public.listings;
DROP POLICY IF EXISTS "Owners and admins can delete listings" ON public.listings;
DROP POLICY IF EXISTS "Listings delete policy" ON public.listings;

CREATE POLICY "Listings delete policy"
  ON public.listings
  FOR DELETE
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    OR public.is_active_admin()
  );

-- ── 7. Isolated Physical Custody Verification Table ───────────────────

CREATE TABLE IF NOT EXISTS public.listing_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE RESTRICT,
  owner_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  verification_code text NOT NULL,
  evidence_photo_path text,
  asset_serial_hash text,
  admin_notes text,
  rejection_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.listing_verifications IS
  'Isolated physical custody evidence and verification workflow. Never accessible to public listing queries.';

CREATE INDEX IF NOT EXISTS idx_listing_verifications_listing_id
  ON public.listing_verifications(listing_id);

CREATE INDEX IF NOT EXISTS idx_listing_verifications_owner_id
  ON public.listing_verifications(owner_id);

CREATE INDEX IF NOT EXISTS idx_listing_verifications_status
  ON public.listing_verifications(status);

ALTER TABLE public.listing_verifications ENABLE ROW LEVEL SECURITY;

-- Verification table security trigger
CREATE OR REPLACE FUNCTION public.enforce_verification_record_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_sub text;
  v_is_adm boolean;
  v_listing_owner text;
BEGIN
  v_jwt_sub := auth.jwt() ->> 'sub';
  v_is_adm := public.is_active_admin();

  -- Lookup authoritative listing owner
  SELECT owner_id INTO v_listing_owner
  FROM public.listings
  WHERE id = NEW.listing_id;

  IF v_listing_owner IS NULL THEN
    RAISE EXCEPTION 'Listing % not found.', NEW.listing_id USING ERRCODE = '02000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_jwt_sub IS NOT NULL AND NOT v_is_adm THEN
      -- Owner can ONLY submit evidence for their own listing
      IF v_jwt_sub != v_listing_owner THEN
        RAISE EXCEPTION 'Unauthorized: You can only submit verification evidence for listings you own.'
          USING ERRCODE = '42501';
      END IF;

      NEW.owner_id := v_listing_owner;
      NEW.status := 'pending';
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
      NEW.admin_notes := NULL;
      NEW.rejection_reason := NULL;

      -- Generate random 8-character custody verification code
      IF NEW.verification_code IS NULL OR length(trim(NEW.verification_code)) < 4 THEN
        NEW.verification_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF v_jwt_sub IS NOT NULL AND NOT v_is_adm THEN
      -- Non-admin owners can only edit pending verifications
      IF OLD.status != 'pending' THEN
        RAISE EXCEPTION 'Cannot modify verification record that has already been reviewed (status: %).', OLD.status
          USING ERRCODE = '42501';
      END IF;

      -- Non-admin cannot alter status or review fields
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Unauthorized: Only active administrators can change verification status.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.listing_id IS DISTINCT FROM OLD.listing_id THEN
        RAISE EXCEPTION 'Immutable field: listing_id cannot be changed.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
        RAISE EXCEPTION 'Immutable field: owner_id cannot be changed.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.verification_code IS DISTINCT FROM OLD.verification_code THEN
        RAISE EXCEPTION 'Immutable field: verification_code cannot be changed.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
        RAISE EXCEPTION 'Unauthorized: Only active administrators can set review metadata.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
        RAISE EXCEPTION 'Unauthorized: Only active administrators can modify admin notes.'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      -- Admin review timestamping
      IF NEW.status IN ('approved', 'rejected') AND OLD.status != NEW.status THEN
        NEW.reviewed_by := COALESCE(v_jwt_sub, 'admin');
        NEW.reviewed_at := now();
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_verification_record_security ON public.listing_verifications;
CREATE TRIGGER trg_enforce_verification_record_security
  BEFORE INSERT OR UPDATE ON public.listing_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_verification_record_security();

-- Trigger to sync approved verification back to listings.is_verified
CREATE OR REPLACE FUNCTION public.sync_listing_verification_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.listings
    SET is_verified = true,
        verified_at = NEW.reviewed_at,
        verified_by = NEW.reviewed_by
    WHERE id = NEW.listing_id;
  ELSIF NEW.status = 'rejected' AND OLD.status = 'approved' THEN
    UPDATE public.listings
    SET is_verified = false,
        verified_at = NULL,
        verified_by = NULL
    WHERE id = NEW.listing_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_listing_verification_status ON public.listing_verifications;
CREATE TRIGGER trg_sync_listing_verification_status
  AFTER UPDATE OF status ON public.listing_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_listing_verification_status();

-- Verification RLS policies
DROP POLICY IF EXISTS "listing_verifications_select_policy" ON public.listing_verifications;
CREATE POLICY "listing_verifications_select_policy"
  ON public.listing_verifications
  FOR SELECT
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "listing_verifications_insert_policy" ON public.listing_verifications;
CREATE POLICY "listing_verifications_insert_policy"
  ON public.listing_verifications
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "listing_verifications_update_policy" ON public.listing_verifications;
CREATE POLICY "listing_verifications_update_policy"
  ON public.listing_verifications
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    OR public.is_active_admin()
  )
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND owner_id = (auth.jwt() ->> 'sub'))
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "listing_verifications_delete_policy" ON public.listing_verifications;
CREATE POLICY "listing_verifications_delete_policy"
  ON public.listing_verifications
  FOR DELETE
  USING (
    public.is_active_admin()
  );

-- Grants on listing_verifications table
GRANT ALL ON TABLE public.listing_verifications TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_verifications TO authenticated;

-- Authoritative admin approval RPC
CREATE OR REPLACE FUNCTION public.approve_listing_verification(
  p_verification_id uuid,
  p_admin_notes text DEFAULT NULL
)
RETURNS public.listing_verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.listing_verifications%ROWTYPE;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only active administrators can approve verifications.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.listing_verifications
  SET status = 'approved',
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      reviewed_by = auth.jwt() ->> 'sub',
      reviewed_at = now()
  WHERE id = p_verification_id
  RETURNING * INTO v_res;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification record % not found.', p_verification_id USING ERRCODE = '02000';
  END IF;

  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_listing_verification(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_listing_verification(uuid, text) TO authenticated, service_role;

-- Authoritative admin rejection RPC
CREATE OR REPLACE FUNCTION public.reject_listing_verification(
  p_verification_id uuid,
  p_rejection_reason text,
  p_admin_notes text DEFAULT NULL
)
RETURNS public.listing_verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.listing_verifications%ROWTYPE;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only active administrators can reject verifications.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.listing_verifications
  SET status = 'rejected',
      rejection_reason = p_rejection_reason,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      reviewed_by = auth.jwt() ->> 'sub',
      reviewed_at = now()
  WHERE id = p_verification_id
  RETURNING * INTO v_res;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification record % not found.', p_verification_id USING ERRCODE = '02000';
  END IF;

  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_listing_verification(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_listing_verification(uuid, text, text) TO authenticated, service_role;

-- ── 8. Conversations & Messaging Tables ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  renter_id text NOT NULL,
  owner_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_booking_id_key UNIQUE (booking_id)
);

COMMENT ON TABLE public.conversations IS
  'Private communication channel tied strictly 1-to-1 to an accepted booking.';

CREATE INDEX IF NOT EXISTS idx_conversations_booking_id
  ON public.conversations(booking_id);

CREATE INDEX IF NOT EXISTS idx_conversations_renter_id
  ON public.conversations(renter_id);

CREATE INDEX IF NOT EXISTS idx_conversations_owner_id
  ON public.conversations(owner_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE RESTRICT,
  sender_id text NOT NULL,
  content text NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 5000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.messages IS
  'Immutable messages between booking participants. Retained for audit and dispute evidence.';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON public.messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id
  ON public.messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON public.messages(created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Message immutability trigger
CREATE OR REPLACE FUNCTION public.enforce_message_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller text;
  v_renter_id text;
  v_owner_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Messages cannot be deleted. History must be preserved for dispute resolution.'
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Freeze all message metadata
    NEW.id := OLD.id;
    NEW.conversation_id := OLD.conversation_id;
    NEW.sender_id := OLD.sender_id;
    NEW.content := OLD.content;
    NEW.created_at := OLD.created_at;

    -- Only read_at can be updated, and only by the recipient
    IF NEW.read_at IS DISTINCT FROM OLD.read_at THEN
      v_caller := auth.jwt() ->> 'sub';

      SELECT renter_id, owner_id INTO v_renter_id, v_owner_id
      FROM public.conversations
      WHERE id = OLD.conversation_id;

      IF v_caller IS NULL OR (v_caller != v_renter_id AND v_caller != v_owner_id AND NOT public.is_active_admin()) THEN
        RAISE EXCEPTION 'Unauthorized to update message read receipt.' USING ERRCODE = '42501';
      END IF;

      IF v_caller = OLD.sender_id THEN
        RAISE EXCEPTION 'Senders cannot mark their own messages as read.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_message_immutability ON public.messages;
CREATE TRIGGER trg_enforce_message_immutability
  BEFORE UPDATE OR DELETE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_immutability();

-- ── 9. Authoritative Conversation Creation Function ───────────────────

CREATE OR REPLACE FUNCTION public.get_or_create_booking_conversation(p_booking_id uuid)
RETURNS public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller text;
  v_renter_id text;
  v_owner_id text;
  v_status text;
  v_conv public.conversations%ROWTYPE;
BEGIN
  v_caller := auth.jwt() ->> 'sub';
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- Derive authoritative participants from booking & listing
  SELECT b.renter_id, l.owner_id, b.status
  INTO v_renter_id, v_owner_id, v_status
  FROM public.bookings b
  JOIN public.listings l ON b.listing_id = l.id
  WHERE b.id = p_booking_id;

  IF v_renter_id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found.', p_booking_id USING ERRCODE = '02000';
  END IF;

  -- Verify caller is participant or active admin
  IF v_caller != v_renter_id AND v_caller != v_owner_id AND NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not a participant in booking %.', p_booking_id
      USING ERRCODE = '42501';
  END IF;

  -- Verify booking is accepted or in active lifecycle
  IF v_status NOT IN ('accepted', 'paid', 'confirmed', 'active', 'completed', 'returned', 'in_progress') AND NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Messaging is only unlocked for accepted rental transactions (current status: %).', v_status
      USING ERRCODE = '42501';
  END IF;

  -- Check if conversation already exists
  SELECT * INTO v_conv FROM public.conversations WHERE booking_id = p_booking_id;
  IF FOUND THEN
    RETURN v_conv;
  END IF;

  -- Create authoritative conversation
  INSERT INTO public.conversations (booking_id, renter_id, owner_id)
  VALUES (p_booking_id, v_renter_id, v_owner_id)
  RETURNING * INTO v_conv;

  RETURN v_conv;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_booking_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_booking_conversation(uuid) TO authenticated, service_role;

-- ── 10. Conversation & Messaging RLS Policies ──────────────────────────

DROP POLICY IF EXISTS "conversations_select_policy" ON public.conversations;
CREATE POLICY "conversations_select_policy"
  ON public.conversations
  FOR SELECT
  USING (
    (auth.jwt() ->> 'sub' IS NOT NULL AND ((auth.jwt() ->> 'sub') = renter_id OR (auth.jwt() ->> 'sub') = owner_id))
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "conversations_insert_policy" ON public.conversations;
CREATE POLICY "conversations_insert_policy"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND ((auth.jwt() ->> 'sub') = renter_id OR (auth.jwt() ->> 'sub') = owner_id))
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;
CREATE POLICY "messages_select_policy"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.renter_id = (auth.jwt() ->> 'sub') OR c.owner_id = (auth.jwt() ->> 'sub'))
    )
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "messages_insert_policy" ON public.messages;
CREATE POLICY "messages_insert_policy"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub' IS NOT NULL AND sender_id = (auth.jwt() ->> 'sub'))
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.renter_id = (auth.jwt() ->> 'sub') OR c.owner_id = (auth.jwt() ->> 'sub'))
    )
  );

DROP POLICY IF EXISTS "messages_update_policy" ON public.messages;
CREATE POLICY "messages_update_policy"
  ON public.messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.renter_id = (auth.jwt() ->> 'sub') OR c.owner_id = (auth.jwt() ->> 'sub'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.renter_id = (auth.jwt() ->> 'sub') OR c.owner_id = (auth.jwt() ->> 'sub'))
    )
  );

DROP POLICY IF EXISTS "messages_delete_policy" ON public.messages;
CREATE POLICY "messages_delete_policy"
  ON public.messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.renter_id = (auth.jwt() ->> 'sub') OR c.owner_id = (auth.jwt() ->> 'sub'))
    )
    OR public.is_active_admin()
  );

-- Explicit table grants for postgREST roles
GRANT ALL ON TABLE public.conversations TO postgres, service_role;
GRANT SELECT, INSERT ON public.conversations TO authenticated;

GRANT ALL ON TABLE public.messages TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

NOTIFY pgrst, 'reload schema';
