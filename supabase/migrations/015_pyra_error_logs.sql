-- ────────────────────────────────────────────────────────────────────────────
-- Migration 015 — pyra_error_logs (Phase 14.1 Observability, Commit 1)
--
-- Self-contained observability layer. Replaces external Sentry dependency
-- (no DSN management, no third-party service, no egress for error reports).
-- All server-side errors funnel through `logError()` (lib/observability/
-- log-error.ts) and land in this table.
--
-- Design:
--   - Append-mostly. Created_at is the canonical write timestamp via
--     `DEFAULT NOW()`. No `updated_at` column, no trigger — the only
--     update path is admin marking a row resolved (writes resolved_*
--     columns explicitly).
--   - VARCHAR primary key (matches `lib/utils/id-generator.ts` pattern —
--     other pyra_* tables use the same convention so writes stay consistent
--     with the existing ID flow).
--   - 3 indexes tuned for the admin viewer's three main queries:
--       1. Latest errors (descending created_at)
--       2. Filter by severity (severity + created_at composite)
--       3. Unresolved triage (partial index, only `resolved = false`)
--   - CHECK constraints enforce the two enums at write time so corrupt
--     rows can't sneak in via direct pg/query.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pyra_error_logs (
  id              varchar PRIMARY KEY,
  severity        varchar NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
  message         text NOT NULL,
  error_type      text,
  stack_trace     text,
  request_path    text,
  request_method  varchar(10),
  user_id         text,
  user_role       text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  environment     varchar NOT NULL CHECK (environment IN ('production', 'development')),
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  resolved        boolean NOT NULL DEFAULT false,
  resolved_at     timestamptz,
  resolved_by     text,
  resolved_notes  text
);

-- Latest-first list view (admin viewer default sort)
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at
  ON pyra_error_logs (created_at DESC);

-- Filter by severity + paginate (admin viewer's severity chip filters)
CREATE INDEX IF NOT EXISTS idx_error_logs_severity_created
  ON pyra_error_logs (severity, created_at DESC);

-- Unresolved triage queue (partial index — only indexes the rows that
-- need triage, keeps the index small as resolved errors accumulate)
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved
  ON pyra_error_logs (created_at DESC) WHERE resolved = false;

-- ────────────────────────────────────────────────────────────────────────────
-- Column documentation (surfaces in pg_catalog + psql \d+)
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE pyra_error_logs IS
  'Self-contained error log table (Phase 14.1 Observability). All server-side errors funnel through lib/observability/log-error.ts. Append-mostly; only updates are admin marking rows resolved.';

COMMENT ON COLUMN pyra_error_logs.severity IS
  'Severity tier: error (broken — needs fixing), warning (degraded — should investigate), info (notable — context for debugging).';

COMMENT ON COLUMN pyra_error_logs.error_type IS
  'JavaScript constructor name (e.g. "TypeError", "PostgrestError"). Captured from `err.constructor.name` at log time. Nullable when caller passes a plain string.';

COMMENT ON COLUMN pyra_error_logs.metadata IS
  'Free-form JSON context (PII-redacted by logError before insert). Caller-supplied metadata + redacted request headers + extra debugging fields.';

COMMENT ON COLUMN pyra_error_logs.environment IS
  'Origin of the error: production (Coolify deployment) or development (local pnpm dev). Read from NODE_ENV at log time.';

COMMENT ON COLUMN pyra_error_logs.resolved IS
  'Admin triage flag. Default false. Flips true when admin clicks "Resolve" in the viewer at /dashboard/admin/error-logs (Commit 3).';
