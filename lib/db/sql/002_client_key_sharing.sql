CREATE TABLE IF NOT EXISTS public.user_device_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  public_key text NOT NULL,
  algorithm text NOT NULL DEFAULT 'ECDH-P256',
  created_at timestamp NOT NULL DEFAULT now(),
  revoked_at timestamp
);
CREATE INDEX IF NOT EXISTS user_device_keys_user_idx ON public.user_device_keys(user_id);
ALTER TABLE public.file_shares ADD COLUMN IF NOT EXISTS recipient_device_key_id uuid REFERENCES public.user_device_keys(id);
ALTER TABLE public.file_shares ADD COLUMN IF NOT EXISTS owner_device_key_id uuid REFERENCES public.user_device_keys(id);
ALTER TABLE public.file_shares ADD COLUMN IF NOT EXISTS wrapped_file_key text;
ALTER TABLE public.file_shares ADD COLUMN IF NOT EXISTS wrapping_iv text;
ALTER TABLE public.file_shares ADD COLUMN IF NOT EXISTS wrapping_algorithm text;
ALTER TABLE public.user_device_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_device_keys FROM anon, authenticated;
