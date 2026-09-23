-- Additive multi-device wrapping. Private keys and raw AES keys are never stored here.
-- Do not silently choose a device row if an older deployment registered the
-- exact same public key more than once. Failing before any DDL is safer than
-- deleting or changing rows which existing wraps may reference.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_device_keys
    GROUP BY user_id, public_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add user_device_keys uniqueness: duplicate (user_id, public_key) rows must be reviewed manually.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS user_device_keys_user_public_key_unique_idx
  ON public.user_device_keys(user_id, public_key);

CREATE TABLE IF NOT EXISTS public.message_device_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  recipient_device_key_id uuid NOT NULL REFERENCES public.user_device_keys(id),
  wrapped_message_key text NOT NULL,
  wrapping_iv text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT message_device_keys_unique UNIQUE(message_id, recipient_device_key_id)
);
CREATE INDEX IF NOT EXISTS message_device_keys_recipient_idx ON public.message_device_keys(recipient_device_key_id);

CREATE TABLE IF NOT EXISTS public.file_share_device_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_share_id uuid NOT NULL REFERENCES public.file_shares(id) ON DELETE CASCADE,
  recipient_device_key_id uuid NOT NULL REFERENCES public.user_device_keys(id),
  wrapped_file_key text NOT NULL,
  wrapping_iv text NOT NULL,
  wrapping_algorithm text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT file_share_device_keys_unique UNIQUE(file_share_id, recipient_device_key_id)
);
CREATE INDEX IF NOT EXISTS file_share_device_keys_recipient_idx ON public.file_share_device_keys(recipient_device_key_id);

ALTER TABLE public.message_device_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_share_device_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_device_keys, public.file_share_device_keys FROM anon, authenticated;
