-- Metadata for client-encrypted file uploads. File contents are never stored
-- in Postgres; Supabase Storage receives only the ciphertext object.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_clerk_id text NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text,
  size_bytes integer,
  supabase_path text NOT NULL,
  iv text NOT NULL,
  encrypted boolean NOT NULL DEFAULT true,
  malware_scan_result text,
  malware_scan_confidence real,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS files_owner_idx ON public.files(owner_clerk_id);
CREATE INDEX IF NOT EXISTS files_created_at_idx ON public.files(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS files_supabase_path_idx ON public.files(supabase_path);

CREATE TABLE IF NOT EXISTS public.file_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  shared_with_user_id text NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  shared_by_user_id text NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'viewer',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS file_shares_unique_idx
  ON public.file_shares(file_id, shared_with_user_id);
CREATE INDEX IF NOT EXISTS file_shares_recipient_idx
  ON public.file_shares(shared_with_user_id);

-- The API uses the database owner connection; no browser or mobile client may
-- access file metadata through Supabase's public REST API.
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.files, public.file_shares FROM anon, authenticated;
