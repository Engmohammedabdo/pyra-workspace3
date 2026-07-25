-- 053_stripe_payment_integrity.sql
--
-- The Stripe webhook's duplicate-payment guard was a read-then-insert with
-- nothing enforcing it: two concurrent deliveries of the same event both read
-- "no row exists" and both insert, doubling amount_paid on the invoice.
-- Make the database the authority instead of the application.
--
-- Partial index: `reference` is NULL for many manually-recorded payments, and
-- NULLs must not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_invoice_reference
  ON pyra_payments (invoice_id, reference)
  WHERE reference IS NOT NULL;

-- The refund, dispute and payment-failed handlers all look up the session
-- record by payment intent on every delivery; the column was unindexed.
CREATE INDEX IF NOT EXISTS idx_stripe_payment_intent
  ON pyra_stripe_payments (stripe_payment_intent_id);
