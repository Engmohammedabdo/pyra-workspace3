-- Reconcile the 2026-07-25 Stripe payment that the (disabled) webhook never booked.
--
-- Stripe facts (read from the API, account acct_1T4fC73HV9MX1JIk):
--   charge  ch_3Tx5D13HV9MX1JIk1jYYU5Vv
--   intent  pi_3Tx5D13HV9MX1JIk1UCl6eEC
--   invoice in_1Tx5AI3HV9MX1JIkI6aspkjt  (TOVNW5JH-0001, paid)
--   gross charged 5,175.00 AED = 5,000.00 base + 175.00 card surcharge (3.5%)
--   Stripe fee 158.63  ->  5,016.37 deposited
--
-- Decisions (Abdou, 2026-07-25):
--   * Only the 5,000 BASE settles the invoice. The 175 surcharge stays OUTSIDE
--     the invoice (not a line item, not a second payment row).
--   * The invoice total stays 6,000 — the remaining 1,000 is due Mon 2026-07-27.
--     So it ends 'partially_paid', not 'paid'.
--   * INV-0031 survives (contract + milestone linked); INV-0030 is the redundant
--     manual duplicate and is cancelled.
--
-- Rollback: scripts/rollback-2026-07-25-stripe.sql
BEGIN;

-- 1. Book the base amount against INV-0031 (contract/milestone-linked invoice).
--    reference = the Stripe intent, exactly what the webhook would have written, so
--    a future replay of this event is deduped rather than double-booked.
INSERT INTO pyra_payments (id, invoice_id, amount, payment_date, method, reference, notes, recorded_by)
VALUES (
  'pay_' || substr(md5(random()::text), 1, 16),
  'inv_4_dykvTYusGzn5oX',
  5000.00,
  DATE '2026-07-25',
  'online',
  'pi_3Tx5D13HV9MX1JIk1UCl6eEC',
  'Stripe — تسوية يدوية لدفعة لم يسجلها الويبهوك (كان معطلاً). المحصل 5175 = 5000 أساسي + 175 رسوم بطاقة 3.5%. رسوم Stripe الفعلية 158.63 والصافي المودع 5016.37. باقي 1000 مستحقة الاثنين 27/07.',
  'system'
);

-- 2. Part-settle INV-0031. Total stays 6,000 with 1,000 outstanding.
UPDATE pyra_invoices
   SET amount_paid = 5000.00,
       amount_due  = 1000.00,
       status      = 'partially_paid',
       updated_at  = now()
 WHERE id = 'inv_4_dykvTYusGzn5oX'
   AND status = 'sent';

-- 3. Cancel the redundant manual invoice (no contract, no milestone).
UPDATE pyra_invoices
   SET status = 'cancelled',
       updated_at = now()
 WHERE id = 'inv_dwCVExs8npNiOulk'
   AND status = 'sent';

-- 4. Derive the contract's collected total from actual payments (was 0.00).
--    Never incremented — Finance Remediation doctrine.
UPDATE pyra_contracts c
   SET amount_collected = COALESCE((
         SELECT SUM(p.amount)
           FROM pyra_payments p
           JOIN pyra_invoices i ON i.id = p.invoice_id
          WHERE i.contract_id = c.id
            AND i.status <> 'cancelled'
       ), 0),
       updated_at = now()
 WHERE c.id = 'ctr_nnOT-sUX5KQtM9p9';

-- 5. DELIBERATELY NOT TOUCHED: the pyra_stripe_payments row for session
--    cs_live_a1kLVn5fq... stays 'pending'. That Stripe session expires
--    2026-07-26 10:43 UTC and will emit checkout.session.expired; if the row
--    flips to 'cancelled' on its own, the webhook path is proven working
--    end-to-end. Setting it here would destroy that signal.

COMMIT;
