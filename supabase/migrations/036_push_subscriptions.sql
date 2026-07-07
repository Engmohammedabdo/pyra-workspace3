-- Web Push subscriptions for internal dashboard users.
-- Client portal push remains out of scope for this migration.

CREATE TABLE IF NOT EXISTS public.pyra_push_subscriptions (
  id varchar(20) PRIMARY KEY,
  username varchar NOT NULL REFERENCES public.pyra_users(username) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  expiration_time timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pyra_push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pyra_push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.pyra_push_subscriptions TO service_role;

CREATE INDEX IF NOT EXISTS idx_pyra_push_subscriptions_user_active
  ON public.pyra_push_subscriptions(username)
  WHERE disabled_at IS NULL;

CREATE OR REPLACE FUNCTION public.pyra_push_subscriptions_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.pyra_push_subscriptions_set_updated_at() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_push_subscriptions_set_updated_at() TO service_role;

DROP TRIGGER IF EXISTS pyra_push_subscriptions_updated_at_trigger
  ON public.pyra_push_subscriptions;

CREATE TRIGGER pyra_push_subscriptions_updated_at_trigger
  BEFORE UPDATE ON public.pyra_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.pyra_push_subscriptions_set_updated_at();
