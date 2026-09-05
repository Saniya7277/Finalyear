-- ===========================================================================
-- Lock the public tables away from the anon REST API
--
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- WHY
-- Supabase publishes every table in the `public` schema over PostgREST at
-- https://<project-ref>.supabase.co/rest/v1/<table>. Access is controlled by
-- Row Level Security. Right now RLS is OFF on all four tables and the `anon`
-- role holds full grants, so anyone with the project's anon key can read every
-- user's email, every filename, the whole teammate graph, and - worst -
-- `invitations.token`, which is enough to accept an invitation as someone else.
-- They can also UPDATE, DELETE and TRUNCATE those tables.
--
-- The anon key is designed to be public (it normally ships inside client apps),
-- so "nobody has it yet" is not a control.
--
-- WHY THIS IS SAFE FOR THE APP
-- The API server connects as the table owner, and owners bypass RLS. Enabling
-- RLS with no policies therefore means: PostgREST/anon sees nothing, the API
-- keeps working unchanged. This was verified on `file_shares`, which was
-- created with RLS already enabled - the API reads it fine.
--
-- The mobile app never talks to Supabase directly; it goes through the API,
-- which is where Clerk auth and decryption happen.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- STEP 1 (required): enable RLS. No policies = deny all to anon/authenticated.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teammates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- file_shares already has RLS enabled; this is a no-op that keeps the set complete.
ALTER TABLE public.file_shares ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- STEP 2 (optional, belt and braces): also drop the grants.
--
-- With RLS on, these grants are already inert. Revoking them means a future
-- mistake - someone adding a permissive policy, or disabling RLS to debug -
-- still would not expose the tables.
--
-- Only skip this if you plan to add a Supabase client to the app later and
-- write real per-user policies. Nothing in the project needs these grants today.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.users       FROM anon, authenticated;
REVOKE ALL ON public.files       FROM anon, authenticated;
REVOKE ALL ON public.teammates   FROM anon, authenticated;
REVOKE ALL ON public.invitations FROM anon, authenticated;
REVOKE ALL ON public.file_shares FROM anon, authenticated;

-- Stop future tables in this schema from being granted to anon automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- STEP 3: verify. Expect rls_enabled = true and policies = 0 for every row,
-- and the grants query to return no rows if you ran STEP 2.
-- ---------------------------------------------------------------------------
SELECT c.relname               AS table_name,
       c.relrowsecurity        AS rls_enabled,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee;


-- ===========================================================================
-- ROLLBACK, if something unexpected breaks
--
-- ALTER TABLE public.users       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.files       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.teammates   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invitations DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.file_shares DISABLE ROW LEVEL SECURITY;
--
-- GRANT ALL ON public.users, public.files, public.teammates,
--              public.invitations, public.file_shares
--   TO anon, authenticated;
-- ===========================================================================
