-- Fleet-wide ignore rows for the company's own lines.
--
-- agent_username = '*' is the wildcard the sync route reads alongside the
-- calling agent's own rows (`.in('agent_username', [agentUsername, '*'])`),
-- so a newly provisioned agent inherits these on day one instead of waiting
-- for someone to remember to add per-agent rows.
--
-- 567249440 = owner mobile (0567249440)
-- 565799505 = company WhatsApp (0565799505)
-- Both are the last 9 digits, matching phoneMatchKey() in lib/utils/phone.ts.

INSERT INTO pyra_ignored_numbers (id, agent_username, phone_normalized, created_at)
VALUES
  ('ign_all_owner_mobile', '*', '567249440', now()),
  ('ign_all_company_wa',   '*', '565799505', now())
ON CONFLICT (id) DO NOTHING;

SELECT agent_username, phone_normalized FROM pyra_ignored_numbers ORDER BY agent_username, phone_normalized;
