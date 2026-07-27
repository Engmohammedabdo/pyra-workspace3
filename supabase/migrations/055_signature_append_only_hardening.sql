-- ────────────────────────────────────────────────────────────────────────────
-- Migration 055 — Harden the quote signature append-only guard
--
-- Phase:        Public quote signing (054 review follow-up)
-- Author:       abdou
-- Date:         2026-07-27
-- Reversible:   NO (forward-only; hardening only)
-- Touches data: NO (DDL only)
-- Risk tier:    1 (deterministic; no existing row is read or rewritten —
--                  the two new CHECKs were verified against live data first:
--                  3 quotes, 0 non-NULL signed_snapshot, 0 negative sizes)
--
-- Purpose:
--   Code review of 054 found the append-only trigger guards only the FOUR
--   legacy signature columns while 054 itself added twelve new ones. An
--   authenticated user can PATCH an already-signed quote and rewrite the
--   entire offline-attestation record — signature_source, signed_link_id,
--   signed_user_agent, signed_offline_by, signed_offline_at,
--   signed_evidence_path/_mime/_size, signed_snapshot — without touching a
--   guarded column, so the trigger never fires and nothing is logged. That is
--   exactly the evidence this feature exists to produce. This migration
--   extends the predicate to all nine of them (I-1), drops the needless
--   SECURITY DEFINER on a validation-only function (M-2), revokes the
--   PUBLIC/authenticated EXECUTE the function was born with (M-1), and adds
--   the two shape CHECKs the columns shipped without (M-3).
--
--   The delivery_* columns are deliberately NOT guarded — they are re-computed
--   on every send and must stay mutable.
--
-- Idempotency contract:
--   CREATE OR REPLACE FUNCTION / DROP TRIGGER IF EXISTS + CREATE TRIGGER /
--   REVOKE (no-op when already revoked). ADD CONSTRAINT has no IF NOT EXISTS,
--   so each CHECK is wrapped in a DO block that probes pg_constraint first.
--   Re-apply is safe on (a) a fresh bootstrap database and (b) live prod.
--   No data backfill — nothing to make idempotent.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] `pnpm db:check-drift` before writing this file — baseline is exactly
--       one MISSING (036_push_subscriptions), pre-existing and unrelated
--   [x] `pnpm db:backup pre-055` not run — still blocked by the known missing
--       SUPABASE_DB_URL (Coolify secret). Proceeded because this migration
--       drops nothing and rewrites no row.
--   [x] IF NOT EXISTS / OR REPLACE / pg_constraint guards on every statement
--   [x] No data backfill
--   [x] Manual verification queries ready (see the block at the bottom)
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

-- I-1 + M-2. Same append-only doctrine as 054 (owner decision D-2: pyra_quotes
-- has RLS off and grants `authenticated` UPDATE, so a direct PostgREST PATCH
-- can forge a signature; a full revoke needs its own read-path audit under
-- Gap #3 and must never precede the code change). Two changes:
--
--   * every signature/evidence column added by 054 is now guarded, using the
--     identical `OLD.x IS NOT NULL AND NEW.x IS DISTINCT FROM OLD.x` shape so a
--     legitimate FIRST write (NULL → value) still passes and only a rewrite of
--     an already-recorded value raises;
--   * SECURITY INVOKER instead of SECURITY DEFINER. The function reads no
--     table, writes nothing and builds no dynamic SQL — it only compares OLD to
--     NEW — so running it with the superuser owner's rights bought nothing and
--     kept a definer-owned surface alive for no reason.
CREATE OR REPLACE FUNCTION public.pyra_quotes_signature_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Legacy signature columns (guarded since 054 — behaviour unchanged).
  IF OLD.signature_data IS NOT NULL AND NEW.signature_data IS DISTINCT FROM OLD.signature_data THEN
    RAISE EXCEPTION 'signature_data is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_at IS NOT NULL AND NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
    RAISE EXCEPTION 'signed_at is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_by IS NOT NULL AND NEW.signed_by IS DISTINCT FROM OLD.signed_by THEN
    RAISE EXCEPTION 'signed_by is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_ip IS NOT NULL AND NEW.signed_ip IS DISTINCT FROM OLD.signed_ip THEN
    RAISE EXCEPTION 'signed_ip is append-only once set (quote %)', OLD.id;
  END IF;

  -- Signature provenance added by 054 — how the signature was obtained.
  IF OLD.signature_source IS NOT NULL AND NEW.signature_source IS DISTINCT FROM OLD.signature_source THEN
    RAISE EXCEPTION 'signature_source is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_link_id IS NOT NULL AND NEW.signed_link_id IS DISTINCT FROM OLD.signed_link_id THEN
    RAISE EXCEPTION 'signed_link_id is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_user_agent IS NOT NULL AND NEW.signed_user_agent IS DISTINCT FROM OLD.signed_user_agent THEN
    RAISE EXCEPTION 'signed_user_agent is append-only once set (quote %)', OLD.id;
  END IF;

  -- Offline attestation — who counter-signed on paper, and when.
  IF OLD.signed_offline_by IS NOT NULL AND NEW.signed_offline_by IS DISTINCT FROM OLD.signed_offline_by THEN
    RAISE EXCEPTION 'signed_offline_by is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_offline_at IS NOT NULL AND NEW.signed_offline_at IS DISTINCT FROM OLD.signed_offline_at THEN
    RAISE EXCEPTION 'signed_offline_at is append-only once set (quote %)', OLD.id;
  END IF;

  -- Stored evidence pointer + the frozen document snapshot. Rewriting any of
  -- these silently re-points the audit trail at a different file/document.
  IF OLD.signed_evidence_path IS NOT NULL AND NEW.signed_evidence_path IS DISTINCT FROM OLD.signed_evidence_path THEN
    RAISE EXCEPTION 'signed_evidence_path is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_evidence_mime IS NOT NULL AND NEW.signed_evidence_mime IS DISTINCT FROM OLD.signed_evidence_mime THEN
    RAISE EXCEPTION 'signed_evidence_mime is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_evidence_size IS NOT NULL AND NEW.signed_evidence_size IS DISTINCT FROM OLD.signed_evidence_size THEN
    RAISE EXCEPTION 'signed_evidence_size is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_snapshot IS NOT NULL AND NEW.signed_snapshot IS DISTINCT FROM OLD.signed_snapshot THEN
    RAISE EXCEPTION 'signed_snapshot is append-only once set (quote %)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-attached so a fresh-bootstrap run of 055 alone still wires the trigger.
-- (On the live database the trigger already exists and CREATE OR REPLACE above
-- has already swapped the body underneath it — this is belt and braces.)
DROP TRIGGER IF EXISTS trg_pyra_quotes_signature_append_only ON public.pyra_quotes;
CREATE TRIGGER trg_pyra_quotes_signature_append_only
  BEFORE UPDATE ON public.pyra_quotes
  FOR EACH ROW EXECUTE FUNCTION public.pyra_quotes_signature_append_only();

-- M-1. The function was born with `=X` (PUBLIC) and `authenticated=X`: 038's
-- ALTER DEFAULT PRIVILEGES revoked the default EXECUTE from PUBLIC and anon but
-- not from `authenticated`, and PUBLIC came back through the creating role's
-- own defaults. Not exploitable — calling a trigger function directly raises
-- 0A000 ("trigger functions can only be called as triggers") — but a
-- superuser-owned, world-executable entry point is exactly the shape 038 set
-- out to stop, so it goes. Runtime trigger dispatch does NOT re-check EXECUTE
-- (the check happens at CREATE TRIGGER time, above, as superuser), and this is
-- proven by verification scenario 4, which updates a quote as `authenticated`
-- AFTER these revokes. service_role's grant is left alone — harmless, and it
-- keeps a margin for every server write path that already runs as service_role.
REVOKE ALL ON FUNCTION public.pyra_quotes_signature_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_quotes_signature_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.pyra_quotes_signature_append_only() FROM authenticated;

-- M-3. `signed_snapshot` shipped as bare jsonb, so the database happily accepts
-- `[1,2]` or `"str"` while TypeScript types it as an object — every consumer
-- that reads `snapshot.total` would get undefined instead of an error. Pin the
-- shape at the only layer that cannot be bypassed by a direct PATCH.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.pyra_quotes'::regclass
       AND conname  = 'pyra_quotes_signed_snapshot_object_check'
  ) THEN
    ALTER TABLE public.pyra_quotes
      ADD CONSTRAINT pyra_quotes_signed_snapshot_object_check
      CHECK (signed_snapshot IS NULL OR jsonb_typeof(signed_snapshot) = 'object');
  END IF;
END;
$$;

-- Same spirit: a byte count is never negative.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public.pyra_quotes'::regclass
       AND conname  = 'pyra_quotes_signed_evidence_size_check'
  ) THEN
    ALTER TABLE public.pyra_quotes
      ADD CONSTRAINT pyra_quotes_signed_evidence_size_check
      CHECK (signed_evidence_size IS NULL OR signed_evidence_size >= 0);
  END IF;
END;
$$;


-- ─── VERIFICATION (run after applying — see docs/MIGRATIONS.md §6) ──────────

--   SELECT p.prosecdef, p.proconfig, array_to_string(p.proacl, ' | ') AS acl
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname = 'pyra_quotes_signature_append_only';
--   -- expect: prosecdef = false, proconfig = {search_path=},
--   --         acl has no `=X` (PUBLIC), no anon=X, no authenticated=X
--
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.pyra_quotes'::regclass
--      AND conname LIKE 'pyra_quotes_signed_%';
--   -- expect: pyra_quotes_signed_snapshot_object_check
--   --         pyra_quotes_signed_evidence_size_check
--
--   -- Behavioural (throwaway rows, deleted in the same DO block):
--   --   1. forged rewrite of each newly-guarded column  -> REJECTED
--   --   2. legitimate FIRST write (NULL -> value)       -> ACCEPTED
--   --   3. the four 054 columns behave as before        -> unchanged
--   --   4. ordinary edit to an UNSIGNED quote           -> ACCEPTED
--   --   5. signed -> invoiced status transition         -> ACCEPTED
--   --   6. non-object signed_snapshot                   -> REJECTED


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Forward-only. To revert, write 056_*.sql reversing the DDL below:
--
-- -- ALTER TABLE public.pyra_quotes DROP CONSTRAINT IF EXISTS pyra_quotes_signed_evidence_size_check;
-- -- ALTER TABLE public.pyra_quotes DROP CONSTRAINT IF EXISTS pyra_quotes_signed_snapshot_object_check;
-- -- GRANT EXECUTE ON FUNCTION public.pyra_quotes_signature_append_only() TO authenticated;
-- -- (and re-create the function from 054 to restore the 4-column / DEFINER form)
