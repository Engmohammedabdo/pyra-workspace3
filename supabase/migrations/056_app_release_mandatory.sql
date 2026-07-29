-- ────────────────────────────────────────────────────────────────────────────
-- Migration 056 — Per-release "must update" switch
--
-- Phase:        CA-C (call-attempts + update-enforcement plan)
-- Author:       abdou
-- Date:         2026-07-29
-- Reversible:   YES (rollback hint inline below)
-- Touches data: NO (DDL only — DEFAULT false backfills every existing row
--               metadata-only, no per-row rewrite needed for this column type)
-- Risk tier:    1 (deterministic, no existing data touched)
--
-- Purpose:
--   Owner decision 2026-07-29: mandatory updates are per-release, decided by
--   the publisher at publish time — never a blanket policy. This adds the
--   switch itself (Task CA-C1). The blocking UI that reacts to it is a later
--   task (CA-C2); this migration only carries the flag.
--   Plan: docs/superpowers/plans/2026-07-29-call-attempts-and-update-enforcement.md
--
-- Idempotency contract:
--   ADD COLUMN IF NOT EXISTS is safe to re-apply on:
--     (a) an empty database during fresh bootstrap, AND
--     (b) the live production database after the migration has already run.
--   No data backfill — DEFAULT false covers every existing row at write time.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] `pnpm db:check-drift` before writing this file — baseline is exactly
--       one pre-existing MISSING (036_push_subscriptions), unrelated to this
--   [x] `pnpm db:backup pre-056` — blocked by the known missing
--       SUPABASE_DB_URL (Coolify secret), same standing gap as every prior
--       migration in this repo. Proceeded because this migration is additive
--       only (one boolean column, DEFAULT false) and drops nothing.
--   [x] IF NOT EXISTS guard on the DDL statement
--   [x] No data backfill needed — DEFAULT false is retroactively correct
--   [x] Manual verification query ready (see below)
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

ALTER TABLE pyra_app_releases
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT false;

-- pyra_app_releases already carries "REVOKE ALL ... FROM anon, authenticated"
-- from migration 039 (Gap #3 doctrine) — a new column on an existing
-- service-role-only table inherits that grant state automatically, no
-- additional REVOKE needed here.


-- ─── VERIFICATION (run manually after apply) ───────────────────────────────

-- 1. Column exists, correct type/default/nullability:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'pyra_app_releases' AND column_name = 'is_mandatory';
--
-- 2. Nothing became retroactively mandatory:
--   SELECT id, app, version_code, is_active, is_mandatory
--   FROM pyra_app_releases
--   WHERE is_active = true;
--   -- expect is_mandatory = false for the currently active release(s)


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Forward-only. To revert, write a new migration reversing the DDL below:
--
-- -- ALTER TABLE pyra_app_releases DROP COLUMN IF EXISTS is_mandatory;
