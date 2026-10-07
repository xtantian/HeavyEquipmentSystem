-- Admin policies for public.listings
-- Allows admins to UPDATE and DELETE any listing based on custom JWT claim 'user_role'

DROP POLICY IF EXISTS "Admins can update all listings" ON public.listings;
CREATE POLICY "Admins can update all listings"
  ON public.listings
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete all listings" ON public.listings;
CREATE POLICY "Admins can delete all listings"
  ON public.listings
  FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND role = 'admin')
  );

NOTIFY pgrst, 'reload schema';
