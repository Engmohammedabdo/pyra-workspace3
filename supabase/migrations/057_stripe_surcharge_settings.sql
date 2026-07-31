-- 057_stripe_surcharge_settings.sql
--
-- Card-fee surcharge passed through to the payer on Stripe links.
--
-- Default OFF on purpose. Surcharging is restricted by some card-scheme rules, so
-- this is a business decision the owner must confirm with his acquirer — code
-- must never switch it on by itself. Same doctrine as the CRM Phase 11
-- Refinement `is_active` lock.
--
-- Both values are plain TEXT (pyra_settings.value is a text column) and must be
-- read through lib/settings/parse.ts, never as `setting.value.something`.
INSERT INTO pyra_settings (key, value)
VALUES ('stripe_surcharge_enabled', 'false'),
       ('stripe_surcharge_percent', '3.5')
ON CONFLICT (key) DO NOTHING;
