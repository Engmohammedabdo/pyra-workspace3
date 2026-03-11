-- ============================================
-- 004: Contract Items / Scope of Work
-- ============================================
-- Structured deliverables list for contracts.
-- Items are descriptive (no pricing) — the contract's
-- retainer_amount or total_value is the single price.

CREATE TABLE IF NOT EXISTS pyra_contract_items (
  id            varchar PRIMARY KEY,
  contract_id   varchar NOT NULL REFERENCES pyra_contracts(id) ON DELETE CASCADE,
  parent_id     varchar REFERENCES pyra_contract_items(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_items_contract ON pyra_contract_items(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_items_parent ON pyra_contract_items(parent_id);
