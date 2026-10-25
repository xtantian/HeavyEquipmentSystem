    -- ============================================================================
    -- Migration: 017_secure_storage_policies.sql
    -- Purpose: Secure 'listing-images' Supabase Storage bucket policies
    -- Architecture: Clerk Third-Party Auth with (auth.jwt() ->> 'sub') identity
    -- IMPORTANT: Do not execute against production without verifying Clerk Third-Party Auth
    -- ============================================================================

    -- 1. Drop existing overly-permissive policies that allow unrestricted anonymous uploads/updates
    DROP POLICY IF EXISTS "Anyone can upload listing images" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can update listing images" ON storage.objects;
    DROP POLICY IF EXISTS "Public listing image access" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can upload own listing images" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can update own listing images" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can delete own listing images" ON storage.objects;

    -- 2. Policy: Public Read Access (Preserved for marketplace browsing)
    -- Operation: SELECT
    -- Roles: public (unauthenticated + authenticated)
    CREATE POLICY "Public listing image access"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'listing-images');

    -- 3. Policy: Authenticated Upload (Restricted to own Clerk ID folder)
    -- Operation: INSERT
    -- Roles: authenticated
    -- Invariant: User must have valid Clerk JWT and only write into their own folder (folder name == auth.jwt()->>'sub')
    CREATE POLICY "Authenticated users can upload own listing images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'listing-images'
        AND (auth.jwt() ->> 'sub') IS NOT NULL
        AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
      );

    -- 4. Policy: Authenticated Update (Restricted to own Clerk ID folder for upsert operations)
    -- Operation: UPDATE
    -- Roles: authenticated
    CREATE POLICY "Authenticated users can update own listing images"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'listing-images'
        AND (auth.jwt() ->> 'sub') IS NOT NULL
        AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
      )
      WITH CHECK (
        bucket_id = 'listing-images'
        AND (auth.jwt() ->> 'sub') IS NOT NULL
        AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
      );

    -- 5. Policy: Authenticated Delete (Required for listing removal cleanup)
    -- Operation: DELETE
    -- Roles: authenticated
    CREATE POLICY "Authenticated users can delete own listing images"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'listing-images'
        AND (auth.jwt() ->> 'sub') IS NOT NULL
        AND (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
      );
