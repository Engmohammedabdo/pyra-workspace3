-- 039_app_releases.sql
-- App self-update infrastructure for the Pyra Calls Android app.
-- Plan: docs/superpowers/plans/2026-07-16-calls-app-v12-selfupdate-observability.md
-- Service-role-only (Gap #3 doctrine). APK binaries live in the private
-- `pyra-private` bucket; `storage_path` NEVER leaves the server (signed URLs only).
--
-- NOTE: originally planned as migration 038, but 038_function_execute_acl.sql
-- was applied to prod on 2026-07-15 (Gap #3 EXECUTE-privilege follow-up) before
-- this task ran, so this ships as 039 — the next available number.

CREATE TABLE IF NOT EXISTS pyra_app_releases (
  id            text PRIMARY KEY,
  app           text NOT NULL DEFAULT 'pyra-calls'
                CHECK (app IN ('pyra-calls', 'pyra-calls-e2e')),
  version_code  integer NOT NULL CHECK (version_code > 0),
  version_name  text NOT NULL,
  storage_path  text NOT NULL,
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes    bigint NOT NULL CHECK (size_bytes > 0),
  release_notes text NULL,
  is_active     boolean NOT NULL DEFAULT false,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pyra_app_releases_app_code_uniq UNIQUE (app, version_code)
);

-- exactly ONE active release per app (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_releases_one_active
  ON pyra_app_releases (app) WHERE is_active;

-- device fleet version visibility: stamped by requireDeviceAuth from the
-- x-app-version header the app sends on every request
ALTER TABLE pyra_api_keys ADD COLUMN IF NOT EXISTS app_version_code integer NULL;

REVOKE ALL PRIVILEGES ON TABLE pyra_app_releases FROM anon, authenticated;
