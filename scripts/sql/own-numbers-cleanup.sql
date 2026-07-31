-- Remove the owner's own two lines from the sales data.
--
-- 0567249440 (owner mobile) and 0565799505 (company WhatsApp) were saved as
-- LEADS ("mohamed abdou", "boss"), so every internal call between the owner
-- and his team was filed as customer contact: 24 calls + 13 timeline rows.
--
-- Order matters: activities and calls reference the leads.
-- A snapshot of every row deleted here lives in
-- backups/own-numbers-{leads,activities,calls}-20260731.json

WITH deleted_activities AS (
  DELETE FROM pyra_lead_activities
  WHERE lead_id IN ('sl_1SwzmCXI5NjOeIlP', 'sl_OkAYeHVsO02mF_wB')
  RETURNING 1
), deleted_calls AS (
  DELETE FROM pyra_agent_calls
  WHERE phone_normalized IN ('567249440', '565799505')
  RETURNING 1
), deleted_leads AS (
  DELETE FROM pyra_sales_leads
  WHERE id IN ('sl_1SwzmCXI5NjOeIlP', 'sl_OkAYeHVsO02mF_wB')
  RETURNING 1
)
SELECT
  (SELECT count(*) FROM deleted_activities) AS activities_deleted,
  (SELECT count(*) FROM deleted_calls)      AS calls_deleted,
  (SELECT count(*) FROM deleted_leads)      AS leads_deleted;
