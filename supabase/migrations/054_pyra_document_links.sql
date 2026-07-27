-- ────────────────────────────────────────────────────────────────────────────
-- Migration 054 — Public document links + quote signature evidence
--
-- Phase:        Public quote signing
-- Author:       abdou
-- Date:         2026-07-27
-- Reversible:   NO (forward-only; additive)
-- Touches data: NO (DDL only)
-- Risk tier:    1 (deterministic, no existing data touched)
--
-- Purpose:
--   Public document links + offline signature evidence + honest delivery
--   status. Adds the opaque-link table behind the no-login quote signing page,
--   the columns that record HOW a signature was obtained (portal / public link
--   / offline counter-signed PDF), and the columns that record whether the
--   quote email actually left — the send route already computes delivery
--   truth and throws it away, so the list has been showing "sent" for mail
--   that never sent.
--
-- Idempotency contract:
--   All DDL uses IF NOT EXISTS / OR REPLACE so re-apply is safe on:
--     (a) an empty database during fresh bootstrap, AND
--     (b) the live production database after the migration has already run.
--   No data backfill — nothing to make idempotent.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] `pnpm db:check-drift` before writing this file — baseline is exactly
--       one MISSING (036_push_subscriptions), pre-existing and unrelated
--   [x] `pnpm db:backup pre-054` attempted — blocked by the known missing
--       SUPABASE_DB_URL (Coolify secret). Proceeded because this migration is
--       additive only and drops nothing.
--   [x] IF NOT EXISTS / OR REPLACE guards on every DDL statement
--   [x] No data backfill
--   [x] Manual verification query ready (see §6 of runbook)
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pyra_document_links (
  id             text PRIMARY KEY,
  entity_type    text        NOT NULL CHECK (entity_type IN ('quote','invoice','contract')),
  entity_id      text        NOT NULL,
  token          varchar(64) NOT NULL,
  content_hash   text        NULL,
  expires_at     timestamptz NULL,
  revoked_at     timestamptz NULL,
  revoked_by     text        NULL,
  view_count     integer     NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  last_viewed_at timestamptz NULL,
  created_by     text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pyra_document_links IS
  'Opaque public links for customer-facing documents. Service-role only; tokens must never be selected into a list response.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_links_token
  ON public.pyra_document_links (token);
CREATE INDEX IF NOT EXISTS idx_document_links_entity
  ON public.pyra_document_links (entity_type, entity_id);
-- At most one live link per document, so "the link" is unambiguous for sales
-- and revoke-on-edit is trivially correct.
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_links_one_live
  ON public.pyra_document_links (entity_type, entity_id) WHERE revoked_at IS NULL;

ALTER TABLE public.pyra_document_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pyra_document_links FROM anon, authenticated;
GRANT ALL  ON TABLE public.pyra_document_links TO service_role;

-- Atomic counter. A read-modify-write from JS would lose concurrent views and
-- would also require granting UPDATE somewhere it does not belong.
CREATE OR REPLACE FUNCTION public.pyra_increment_document_link_view(link_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.pyra_document_links
     SET view_count = view_count + 1,
         last_viewed_at = now()
   WHERE id = link_id;
$$;

-- 038_function_execute_acl.sql revoked default EXECUTE, so a new function is
-- not born executable and the counter would silently fail without this grant.
REVOKE ALL ON FUNCTION public.pyra_increment_document_link_view(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_increment_document_link_view(text) TO service_role;

ALTER TABLE public.pyra_quotes
  ADD COLUMN IF NOT EXISTS delivery_status      text NULL
      CHECK (delivery_status IS NULL OR delivery_status IN ('delivered','no_email','not_delivered')),
  ADD COLUMN IF NOT EXISTS delivery_detail      text NULL,
  ADD COLUMN IF NOT EXISTS delivery_checked_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS signature_source     text NULL
      CHECK (signature_source IS NULL OR signature_source IN ('portal','public_link','offline')),
  ADD COLUMN IF NOT EXISTS signed_link_id       text NULL,
  ADD COLUMN IF NOT EXISTS signed_user_agent    text NULL,
  ADD COLUMN IF NOT EXISTS signed_offline_by    text NULL,
  ADD COLUMN IF NOT EXISTS signed_offline_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS signed_evidence_path text NULL,
  ADD COLUMN IF NOT EXISTS signed_evidence_mime text NULL,
  ADD COLUMN IF NOT EXISTS signed_evidence_size integer NULL,
  ADD COLUMN IF NOT EXISTS signed_snapshot      jsonb NULL;

-- Owner decision D-2: pyra_quotes has RLS off and grants `authenticated` UPDATE,
-- so a direct PostgREST PATCH can forge a signature. A full revoke needs its own
-- read-path audit (Gap #3) and must never precede the code change. This trigger
-- is the partial mitigation: signature columns are append-only once written.
CREATE OR REPLACE FUNCTION public.pyra_quotes_signature_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pyra_quotes_signature_append_only ON public.pyra_quotes;
CREATE TRIGGER trg_pyra_quotes_signature_append_only
  BEFORE UPDATE ON public.pyra_quotes
  FOR EACH ROW EXECUTE FUNCTION public.pyra_quotes_signature_append_only();


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Forward-only. To revert, write 055_*.sql reversing the DDL below:
--
-- -- DROP TRIGGER IF EXISTS trg_pyra_quotes_signature_append_only ON public.pyra_quotes;
-- -- DROP FUNCTION IF EXISTS public.pyra_quotes_signature_append_only();
-- -- ALTER TABLE public.pyra_quotes DROP COLUMN IF EXISTS signed_snapshot;  -- (…and the other 11)
-- -- DROP FUNCTION IF EXISTS public.pyra_increment_document_link_view(text);
-- -- DROP TABLE IF EXISTS public.pyra_document_links;
