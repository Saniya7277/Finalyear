-- Additive secure-chat tables. They store ciphertext and wrapped message keys,
-- never message plaintext or private device keys.
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_one_id text NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  participant_two_id text NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT conversations_distinct_participants CHECK (participant_one_id <> participant_two_id),
  CONSTRAINT conversations_canonical_participants CHECK (participant_one_id < participant_two_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_participants_unique_idx ON public.conversations(participant_one_id, participant_two_id);
CREATE INDEX IF NOT EXISTS conversations_participant_one_idx ON public.conversations(participant_one_id);
CREATE INDEX IF NOT EXISTS conversations_participant_two_idx ON public.conversations(participant_two_id);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  recipient_id text NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  encryption_algorithm text NOT NULL DEFAULT 'AES-256-GCM',
  sender_wrapped_message_key text NOT NULL,
  sender_wrapping_iv text NOT NULL,
  recipient_wrapped_message_key text NOT NULL,
  recipient_wrapping_iv text NOT NULL,
  wrapping_algorithm text NOT NULL,
  sender_device_key_id uuid NOT NULL REFERENCES public.user_device_keys(id),
  recipient_device_key_id uuid NOT NULL REFERENCES public.user_device_keys(id),
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT messages_distinct_participants CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages(conversation_id, created_at);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversations, public.messages FROM anon, authenticated;
