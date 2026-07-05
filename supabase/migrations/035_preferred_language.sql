-- Migration: 035_preferred_language
-- Date: 2026-07-05
-- Risk tier: 1 (additive, no data touched)
-- Spec: docs/superpowers/specs/2026-07-05-bilingual-i18n-design.md §4.3
--
-- Adds per-user / per-client UI language preference. DB is the source of
-- truth; the pyra_locale cookie is a cache (healed by LocaleSync).

ALTER TABLE pyra_users
  ADD COLUMN IF NOT EXISTS preferred_language varchar(2) NOT NULL DEFAULT 'ar';

ALTER TABLE pyra_users
  DROP CONSTRAINT IF EXISTS pyra_users_preferred_language_check;
ALTER TABLE pyra_users
  ADD CONSTRAINT pyra_users_preferred_language_check
  CHECK (preferred_language IN ('ar', 'en'));

ALTER TABLE pyra_clients
  ADD COLUMN IF NOT EXISTS preferred_language varchar(2) NOT NULL DEFAULT 'ar';

ALTER TABLE pyra_clients
  DROP CONSTRAINT IF EXISTS pyra_clients_preferred_language_check;
ALTER TABLE pyra_clients
  ADD CONSTRAINT pyra_clients_preferred_language_check
  CHECK (preferred_language IN ('ar', 'en'));

-- DOWN (informational only -- forward-only migration system):
-- -- ALTER TABLE pyra_users DROP COLUMN preferred_language;
-- -- ALTER TABLE pyra_clients DROP COLUMN preferred_language;
