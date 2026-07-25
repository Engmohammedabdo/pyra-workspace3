-- ROLLBACK for reconcile-2026-07-25-stripe.sql
-- Restores the exact pre-change state captured 2026-07-25 before reconciliation.
-- Only run this if the reconciliation produced a wrong result.
BEGIN;

-- Remove the payment booked by the reconciliation.
DELETE FROM pyra_payments
 WHERE invoice_id = 'inv_4_dykvTYusGzn5oX'
   AND reference = 'pi_3Tx5D13HV9MX1JIk1UCl6eEC';

-- INV-0031 back to sent / 6000 / 0 paid / 6000 due.
UPDATE pyra_invoices
   SET status = 'sent', total = 6000.00, subtotal = 6000.00,
       amount_paid = 0.00, amount_due = 6000.00, updated_at = now()
 WHERE id = 'inv_4_dykvTYusGzn5oX';

-- INV-0030 back to sent / 6000 / 0 paid / 6000 due.
UPDATE pyra_invoices
   SET status = 'sent', total = 6000.00, subtotal = 6000.00,
       amount_paid = 0.00, amount_due = 6000.00, updated_at = now()
 WHERE id = 'inv_dwCVExs8npNiOulk';

-- Contract back to billed 6000 / collected 0.
UPDATE pyra_contracts
   SET amount_billed = 6000.00, amount_collected = 0.00, updated_at = now()
 WHERE id = 'ctr_nnOT-sUX5KQtM9p9';

COMMIT;
