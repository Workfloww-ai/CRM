-- =========================================================================
-- 018_enable_rls_spatial_ref_sys.sql
-- Enables Row Level Security (RLS) on PostGIS system table spatial_ref_sys
-- Resolves Supabase Security Linter warning: "RLS Disabled in Public on spatial_ref_sys"
-- =========================================================================

-- 1. Enable RLS on spatial_ref_sys
ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

-- 2. Allow read-only SELECT access (required by PostGIS functions for coordinate lookups)
DROP POLICY IF EXISTS "Allow read access on spatial_ref_sys" ON public.spatial_ref_sys;
CREATE POLICY "Allow read access on spatial_ref_sys"
ON public.spatial_ref_sys
FOR SELECT
USING (true);

-- 3. Ensure read permissions for anon and authenticated clients
GRANT SELECT ON public.spatial_ref_sys TO anon, authenticated;

