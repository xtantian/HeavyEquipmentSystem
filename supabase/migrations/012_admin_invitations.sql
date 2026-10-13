-- Migration: 012_admin_invitations.sql
-- Description: Tracks administrator invitations sent via Clerk with audit trail and RLS security.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_invitation_id text UNIQUE,
  email text NOT NULL,
  invited_by text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_invitations_email ON public.admin_invitations(lower(trim(email)));
CREATE INDEX IF NOT EXISTS idx_admin_invitations_status ON public.admin_invitations(status);

ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin invitations viewable only by admins" ON public.admin_invitations;
CREATE POLICY "Admin invitations viewable only by admins"
  ON public.admin_invitations
  FOR SELECT
  USING (
    (auth.jwt() ->> 'user_role') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')
        AND role = 'admin'
    )
  );

COMMIT;
