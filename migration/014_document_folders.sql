-- =========================================================================
-- Migration: Create public.document_folders and seed all present folders
-- =========================================================================

-- 1. Create document_folders table
CREATE TABLE IF NOT EXISTS public.document_folders (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL DEFAULT ''::TEXT,
  parent_id TEXT NULL,
  is_custom BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE NULL,
  CONSTRAINT document_folders_pkey PRIMARY KEY (id),
  CONSTRAINT document_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles (id)
) TABLESPACE pg_default;

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;

-- 3. Setup RLS Policies
DROP POLICY IF EXISTS "authenticated users can view document_folders" ON public.document_folders;
CREATE POLICY "authenticated users can view document_folders"
ON public.document_folders FOR SELECT
USING (auth.role() = 'authenticated' AND deleted_at IS NULL);

DROP POLICY IF EXISTS "authenticated users can insert document_folders" ON public.document_folders;
CREATE POLICY "authenticated users can insert document_folders"
ON public.document_folders FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated users can update document_folders" ON public.document_folders;
CREATE POLICY "authenticated users can update document_folders"
ON public.document_folders FOR UPDATE
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated users can delete document_folders" ON public.document_folders;
CREATE POLICY "authenticated users can delete document_folders"
ON public.document_folders FOR DELETE
USING (auth.role() = 'authenticated');

-- 4. Seed all system default folders
INSERT INTO public.document_folders (id, name, description, parent_id, is_custom)
VALUES
  ('leads', 'Leads', 'Documents related to leads', NULL, false),
  ('leads/ceo', 'CEO', 'CEO documents', 'leads', false),
  ('leads/chro', 'CHRO', 'CHRO documents', 'leads', false),
  ('leads/hr', 'HR', 'HR documents', 'leads', false),
  ('leads/sales_head', 'Sales Head', 'Sales Head documents', 'leads', false),
  ('fractional_leaders', 'Fractional Leaders', 'Documents for fractional leaders', NULL, false),
  ('training_partners', 'Training Partners', 'Partner training materials', NULL, false),
  ('investors', 'Investors', 'Investor relations documents', NULL, false),
  ('competitors', 'Competitors', 'Competitor analysis and files', NULL, false),
  ('client_presentations', 'Client Presentations', 'Client Presentations documents', NULL, false),
  ('ai_capability', 'AI Capability', 'AI Capability documents', NULL, false),
  ('commercial_proposal', 'Commercial Proposal', 'Commercial Proposal documents', NULL, false),
  ('sales_reports', 'Sales Reports', 'Sales Reports and Analysis', NULL, false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  parent_id = EXCLUDED.parent_id,
  is_custom = EXCLUDED.is_custom;

-- 5. Backfill any existing folders that have files stored in public.documents
INSERT INTO public.document_folders (id, name, description, parent_id, is_custom, created_by, created_at)
SELECT DISTINCT ON (d.folder)
  d.folder AS id,
  initcap(replace(split_part(d.folder, '/', array_length(string_to_array(d.folder, '/'), 1)), '_', ' ')) AS name,
  'Folder populated from existing documents' AS description,
  CASE 
    WHEN position('/' in d.folder) > 0 THEN 
      left(d.folder, length(d.folder) - length(split_part(d.folder, '/', array_length(string_to_array(d.folder, '/'), 1))) - 1)
    ELSE NULL 
  END AS parent_id,
  true AS is_custom,
  d.uploaded_by AS created_by,
  d.created_at
FROM public.documents d
WHERE d.folder IS NOT NULL AND trim(d.folder) <> ''
ON CONFLICT (id) DO NOTHING;
