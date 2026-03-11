-- ============================================
-- 003: Retainer Contract Enhancements
-- ============================================
-- Adds retainer-specific columns to pyra_contracts
-- and contract_id linking to pyra_invoices.

-- 1. Retainer fields on contracts
ALTER TABLE pyra_contracts
  ADD COLUMN IF NOT EXISTS retainer_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retainer_cycle varchar DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS billing_day integer DEFAULT 1;

-- 2. Link invoices to contracts (for billing history)
ALTER TABLE pyra_invoices
  ADD COLUMN IF NOT EXISTS contract_id varchar REFERENCES pyra_contracts(id) ON DELETE SET NULL;
