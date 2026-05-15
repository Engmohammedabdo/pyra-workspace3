-- ────────────────────────────────────────────────────────────────────────────
-- 017_pyra_schema_migrations.sql
--
-- Phase:        14.2 Commit 2
-- Author:       abdou
-- Date:         2026-05-15
-- Reversible:   NO (forward-only — establishes the canonical version-tracking
--               table that all future migrations rely on)
-- Touches data: YES (idempotent backfill of historical migrations 001-016
--               via INSERT ... ON CONFLICT DO NOTHING — re-applying does NOT
--               duplicate or overwrite)
-- Risk tier:    1 (pure additive — no existing tables modified)
--
-- Purpose:
--   Introduces `pyra_schema_migrations` — the canonical record of every
--   migration that has been applied to this database. Drift detection
--   (`pnpm db:check-drift`) compares row checksums against the LF-normalized
--   SHA-256 of the on-disk file to catch out-of-band file edits.
--
-- Backfill semantic:
--   Inserts one row per pre-existing migration (001 through 016) with
--   `applied_by='bootstrap'` and `applied_at=NOW()` because the original
--   apply timestamps are unrecoverable (the table didn't exist yet).
--   Checksums are LF-normalized SHA-256 captured at the moment of writing
--   this migration. From this point forward, drift detection has a
--   meaningful baseline.
--
-- Self-recording:
--   This migration does NOT self-record. After applying, run:
--     pnpm db:record 017_pyra_schema_migrations --by=bootstrap
--   to add the row for 017 itself. This keeps the migration SQL focused
--   on schema and exercises the canonical tooling we're building.
--
-- Idempotency contract:
--   - Table + index creation guarded by IF NOT EXISTS
--   - All backfill INSERTs use ON CONFLICT (version) DO NOTHING so re-apply
--     never duplicates rows or stomps post-hoc edits to applied_at / notes
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pyra_schema_migrations (
  version       varchar PRIMARY KEY,
  applied_at    timestamptz NOT NULL DEFAULT NOW(),
  applied_by    text,
  checksum      text,
  notes         text
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
  ON pyra_schema_migrations (applied_at DESC);


-- ─── Column documentation ──────────────────────────────────────────────────

COMMENT ON TABLE pyra_schema_migrations IS
  'Schema migration history (Phase 14.2). One row per applied migration. Drift detection (pnpm db:check-drift) compares stored `checksum` vs the LF-normalized SHA-256 of the on-disk migration file at supabase/migrations/{version}.sql.';

COMMENT ON COLUMN pyra_schema_migrations.version IS
  'Migration file basename without .sql extension — e.g. "017_pyra_schema_migrations". Stable identifier; PK.';

COMMENT ON COLUMN pyra_schema_migrations.applied_by IS
  'pyra_users.username (or "bootstrap" / "system" for non-user runs). Set via the --by flag of pnpm db:record OR the ABDOU_USERNAME env var. Defaults to "system".';

COMMENT ON COLUMN pyra_schema_migrations.checksum IS
  'LF-normalized SHA-256 of the migration file content at apply time. Computed via content.replace(/\r\n/g, "\n") to avoid CRLF/LF drift false positives on Windows. Bytes are hex-encoded (64 chars).';

COMMENT ON COLUMN pyra_schema_migrations.notes IS
  'Optional human-readable annotation (e.g. "retroactively recorded", "rollback of 016 attempt 2"). Passed via --notes flag of pnpm db:record.';


-- ─── DATA BACKFILL ─────────────────────────────────────────────────────────
-- Records migrations 001-016 retroactively. Checksums are LF-normalized
-- SHA-256 captured at the moment this migration was written
-- (scripts/_compute-checksums.mjs). Past drift (if any) is unknowable —
-- the baseline starts here.

INSERT INTO pyra_schema_migrations (version, applied_by, checksum, notes) VALUES
  ('001_employee_system_bootstrap',
   'bootstrap',
   '3fd2864dd31b5db35d3c71082661cb8fe687de65050de4455b4490992b29b67e',
   'retroactively recorded — original apply timestamp unknown; file content includes the Phase 14.2 Commit 2 bootstrap header'),
  ('002_erp_features',
   'bootstrap',
   '0ac28907c728307f438c5c60c9c6999b42916ba50bffb3c000b56473904bdc96',
   'retroactively recorded — original apply timestamp unknown'),
  ('003_retainer_contracts',
   'bootstrap',
   'b0b7e8c2388961295f024143c4194601de539d312a1ed70b5b4e5903c8214443',
   'retroactively recorded — original apply timestamp unknown'),
  ('004_contract_items',
   'bootstrap',
   '37ba227f6b4d3957d8dd9d3703fdfd7827d6d4150bdd45144fafcce0d75d89f5',
   'retroactively recorded — original apply timestamp unknown'),
  ('005_sales_crm',
   'bootstrap',
   '3e3e9bdd805f3efab65d479170c93ccb2d2aa8c3568a0afcc14f9c3cce15026b',
   'retroactively recorded — original apply timestamp unknown'),
  ('006_crm_extend_sales_leads',
   'bootstrap',
   '95e1b883af86fe95596813376f7a8a283491206180d81bb09d3248316dbbf979',
   'retroactively recorded — original apply timestamp unknown'),
  ('007_crm_pipeline_stages',
   'bootstrap',
   '6bf7cf094f85476c4b01b3ba41bd5be7dccd36589c375f69e2df719c42f55d79',
   'retroactively recorded — original apply timestamp unknown'),
  ('008_crm_link_contracts_to_leads',
   'bootstrap',
   '41e0b0119d7207b2906271de4128bab890d14ff6fa351955453c5e39f2a52c5e',
   'retroactively recorded — original apply timestamp unknown'),
  ('009_crm_lead_activities_index',
   'bootstrap',
   'c109fb1f3e6fd3d0a40241182a26245e14a5a1d0d071cb7bd28db2ac13194406',
   'retroactively recorded — original apply timestamp unknown'),
  ('010_crm_remap_leads',
   'bootstrap',
   'dab37dde49b7cc25a9a8bde089c10eba4a47bc0ed1c52e37c7b85ff8fd0af0de',
   'retroactively recorded — original apply timestamp unknown'),
  ('011_crm_catchup_remap',
   'bootstrap',
   '70b4756589a35a81c4b99d3faa7fbf68c69810269cd59509b567ddea8665e881',
   'retroactively recorded — original apply timestamp unknown'),
  ('012_crm_clients_portal_active',
   'bootstrap',
   '68a857dc4a820fbe6e5bd3a5c967cc224e1c2d1f8894cb04586b7b1f30f8eded',
   'retroactively recorded — original apply timestamp unknown'),
  ('013_crm_follow_ups_reminder_columns',
   'bootstrap',
   'cac2028b97199faeb18952ef74c024df5b43f3825f9648fa36e2cf3993104426',
   'retroactively recorded — original apply timestamp unknown'),
  ('014_crm_agent_whatsapp_settings',
   'bootstrap',
   '0253483c8fb1bab1a49f5d749ac297d3e5ba470aa54e3efed931722f999a4104',
   'retroactively recorded — original apply timestamp unknown'),
  ('015_pyra_error_logs',
   'bootstrap',
   '2bf1473ca5113cc43827431fbc6cc7e57fc02d8f7c51441306994166b7ae542b',
   'retroactively recorded — original apply timestamp unknown'),
  ('016_pyra_lead_attachments',
   'bootstrap',
   'a346c8438abe4eb1511c8edd6cfd83f66463c485408d471346648b9fc8def779',
   'retroactively recorded — original apply timestamp unknown')
ON CONFLICT (version) DO NOTHING;


-- ─── DOWN (informational — NOT executed) ───────────────────────────────────
-- Reverting this migration would destroy the version-tracking history.
-- Don't. If you absolutely need to roll back, restore from backup:
--   gunzip -c backups/<pre-017>.sql.gz | psql "$SUPABASE_DB_URL"
--
-- -- DROP INDEX IF EXISTS idx_schema_migrations_applied_at;
-- -- DROP TABLE IF EXISTS pyra_schema_migrations;
