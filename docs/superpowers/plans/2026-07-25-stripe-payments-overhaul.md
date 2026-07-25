# Stripe Payments Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Stripe payment-link flow actually work end-to-end — money charged in Stripe always lands correctly in Pyra — then modernise it (dynamic payment methods, 3.5% fee surcharge, Stripe-native invoice support, reconciliation safety net).

**Architecture:** Keep Checkout Sessions as the payment surface (correct per Stripe's own guidance for on-session one-time payments). Harden the webhook into the single settlement authority: every money write checks its error and returns 500 so Stripe retries, backed by a DB unique constraint that makes idempotency real rather than advisory. Add a second settlement path for `invoice.payment_succeeded` so invoices raised inside the Stripe Dashboard also flow back. Add a fee-surcharge layer as an invoice line item so the books reconcile to the dirham.

**Tech Stack:** Next.js 15 App Router · Supabase (service-role) · Stripe Node SDK · Vitest · next-intl

## Global Constraints

- **Never pass `payment_method_types`** to any Stripe call (Stripe official skill guidance). Removing it enables dynamic payment methods.
- **Stripe API version target:** `2026-06-24.dahlia` (latest). Code currently pins `2025-02-24.acacia`; the live endpoint is on `2026-01-28.clover`.
- **Supabase resolves with `{ error }` — it does NOT throw.** Every `.insert()`/`.update()`/`.select()` on a money path must destructure and check `error`.
- **Webhook must return non-2xx on a failed money write** so Stripe retries. A 200 permanently discards the event.
- **`dubaiDayKey()` from `lib/utils/format.ts`** for any "today" date used in `payment_date`. Never `.toISOString().slice(0,10)`.
- **Never mutate invoice `total`/`amount_due` directly** to represent a surcharge — it must be a real line item (Finance Remediation lock).
- **`pyra_payments` is the only money ledger.** `pyra_stripe_payments` rows are session records, never ledger entries.
- **All money writes go through `logActivity()` / `notify()`** — never raw inserts into `pyra_activity_log` / `pyra_notifications`.
- **UI:** Arabic RTL (`ms-`/`me-`/`ps-`/`pe-`), dark-mode pairs, `EmptyState`/`Skeleton` primitives, React Query (no raw `fetch` in components).
- Verify before every push: `pnpm run check` && `pnpm build` && `pnpm test`.

---

## Ground Truth (measured 2026-07-25, do not re-derive)

| Fact | Value |
|---|---|
| Stripe account | `acct_1T4fC73HV9MX1JIk` · country **AE** · default currency **AED** · charges+payouts enabled |
| Webhook endpoint | `we_1T52Mp3HV9MX1JIkZ0K5XGa6` → `https://workspace.pyramedia.cloud/api/stripe/webhook` |
| Endpoint status | **`disabled`** ← root cause of zero settlements ever |
| Endpoint API version | `2026-01-28.clover` (231 events subscribed) |
| Webhook events ever processed | **0** (`pyra_activity_log` where `ip_address='stripe_webhook'` = 0 rows) |
| Today's real payment | `ch_3Tx5D13HV9MX1JIk1jYYU5Vv` · `pi_3Tx5D13HV9MX1JIk1UCl6eEC` · **5,175 AED** · 14:43:41 UTC |
| Stripe invoice | `in_1Tx5AI3HV9MX1JIkI6aspkjt` (`TOVNW5JH-0001`) · paid · `ali.fakih2@icloud.com` |
| Actual Stripe fee | **158.63 AED** (151.08 processing + 7.55 VAT) → **net deposited 5,016.37** |
| Owner's reading | base **5,000** + **175** = 3.5% surcharge collected from client |
| Pyra client | `cl_WoKoV_qVegfJQgSN` — Majed Alsaleh / ELITE TRACK CARS RENTAL L.L.C.S.P |
| Duplicate Pyra invoices | `INV-0030` (`inv_dwCVExs8npNiOulk`) and `INV-0031` (`inv_4_dykvTYusGzn5oX`) — both 6,000 AED, both `sent`, both unpaid |
| Orphan session | `cs_live_a1kLVn5fq…` — `open` / `unpaid` / 6,000 AED / expires 2026-07-26T10:43Z |
| `pyra_payments` columns | `id, invoice_id, amount, payment_date, method, reference, notes, recorded_by, created_at` |
| `pyra_payments` constraints | PK(id), FK(invoice_id), `CHECK (amount <> 0)` — **no unique on (invoice_id, reference)** |
| `pyra_stripe_payments` indexes | pkey, `idx_stripe_invoice`, `idx_stripe_session` — **no index on `stripe_payment_intent_id`** |
| Existing i18n keys | `finance.invoices.detail.toasts.paymentLinkCopied` + `.paymentLinkFailed` (AR+EN both present) |
| Next migration number | **053** |

### ⚠️ Open decision blocking Phase 0 Task 3

The two Pyra invoices are 6,000 AED; the collected base is 5,000. Two readings:

- **(A) The invoice should be 5,000** — 5,000 × 1.035 = 5,175 exactly, so this is almost certainly right. Action: correct one invoice to 5,000, mark it paid, cancel the duplicate.
- **(B) The invoice is genuinely 6,000 and 5,000 is a part payment** — leaves 1,000 outstanding.

**Do not run Phase 0 Task 3 until Abdou confirms A or B.** Everything else in this plan is independent of that choice.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/stripe.ts` | Stripe client factory + API version + `isStripeEnabled()` (wired, not dead) |
| `lib/stripe/surcharge.ts` | **new** — pure surcharge math, unit-tested |
| `lib/stripe/settle.ts` | **new** — shared settlement core used by both webhook branches |
| `app/api/stripe/webhook/route.ts` | Event routing only; delegates money work to `settle.ts` |
| `app/api/stripe/create-checkout/route.ts` | Dashboard link minting |
| `app/api/portal/invoices/[id]/pay/route.ts` | Portal self-pay |
| `app/dashboard/invoices/[id]/page.tsx` | Fix the dead response-key read |
| `app/api/settings/route.ts` | Mask secret values on read |
| `app/api/cron/stripe-reconcile/route.ts` | **new** — nightly reconciliation |
| `supabase/migrations/053_*.sql` … | Indexes, constraints, settings seeds |
| `__tests__/stripe-*.test.ts` | Unit tests for pure logic |

---

# PHASE 0 — Emergency (today)

## Task 0.1: Re-enable the Stripe webhook endpoint (manual — Abdou)

**Files:** none (Stripe Dashboard action)

This is the single change that turns settlement on. Nothing else in this plan matters until it is done.

- [ ] **Step 1: Open the endpoint**

Go to <https://dashboard.stripe.com/webhooks/we_1T52Mp3HV9MX1JIkZ0K5XGa6>

- [ ] **Step 2: Check why it was disabled**

Read the "Failure reason"/recent-deliveries panel and record it. Stripe auto-disables after sustained delivery failures — knowing the cause (TLS? 500s? timeouts?) tells us whether re-enabling alone is enough.

- [ ] **Step 3: Enable it**

Click **Enable endpoint**.

- [ ] **Step 4: Trim the subscribed events**

It currently subscribes to **all 231** events. Reduce to exactly what the handler processes (plus the Phase 2 additions):

```
checkout.session.completed
checkout.session.expired
charge.refunded
charge.dispute.created
charge.dispute.closed
payment_intent.payment_failed
invoice.payment_succeeded     ← added in Phase 2
```

- [ ] **Step 5: Confirm the signing secret matches**

Reveal the endpoint's signing secret and confirm it equals `pyra_settings.stripe_webhook_secret`. If it differs, update the DB value (Settings UI, or `pnpm db:query` with an UPDATE).

- [ ] **Step 6: Send a test event and confirm arrival**

Use "Send test webhook" → `checkout.session.completed`. Then verify the request reached us:

```bash
pnpm db:query "SELECT count(*) FROM pyra_error_logs WHERE created_at > now() - interval '10 minutes'"
```

A test event has no `invoice_id` metadata, so the handler returns 400 by design — that is still proof of delivery. (Phase 1 Task 1.6 changes that 400 to a 200-with-log so retries stop.)

---

## Task 0.2: Fix the dead payment-link button

**Files:**
- Modify: `app/dashboard/invoices/[id]/page.tsx:193`
- Test: `__tests__/invoice-payment-link-response.test.ts` (create)

**Interfaces:**
- Consumes: `POST /api/stripe/create-checkout` → `{ data: { checkout_url: string; session_id: string } }`
- Produces: nothing downstream

- [ ] **Step 1: Write the failing test**

Create `__tests__/invoice-payment-link-response.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PAGE = path.join(process.cwd(), 'app/dashboard/invoices/[id]/page.tsx');

describe('dashboard payment-link handler', () => {
  const src = readFileSync(PAGE, 'utf8');

  it('reads checkout_url, the key the API actually returns', () => {
    expect(src).toContain('json.data?.checkout_url');
  });

  it('does not read the non-existent json.data.url key', () => {
    expect(src).not.toMatch(/json\.data\?\.url\b/);
  });

  it('surfaces a failure toast when the link is missing', () => {
    expect(src).toContain('toasts.paymentLinkFailed');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm test __tests__/invoice-payment-link-response.test.ts
```

Expected: FAIL — `json.data?.checkout_url` not found.

- [ ] **Step 3: Fix the handler**

In `app/dashboard/invoices/[id]/page.tsx`, replace the block at lines 193-196:

```tsx
      if (json.data?.checkout_url) {
        try {
          await navigator.clipboard.writeText(json.data.checkout_url);
          toast.success(t('toasts.paymentLinkCopied'));
        } catch {
          // Clipboard can reject (non-secure context / denied permission).
          // The link is still valid — show it so it is never lost silently.
          toast.success(json.data.checkout_url, { duration: 30_000 });
        }
      } else {
        toast.error(t('toasts.paymentLinkFailed'));
      }
```

Both i18n keys already exist in `messages/{ar,en}/finance.json` — no message changes needed.

- [ ] **Step 4: Run the test again**

```bash
pnpm test __tests__/invoice-payment-link-response.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm run check
git add "app/dashboard/invoices/[id]/page.tsx" __tests__/invoice-payment-link-response.test.ts
git commit -m "fix(stripe): dashboard payment-link button read the wrong response key

The handler gated on json.data?.url but /api/stripe/create-checkout returns
checkout_url, so every click minted a live Checkout session and silently
discarded the URL — no success toast, no error toast. Confirmed in production:
5 orphaned sessions, and duplicate invoices created because the admin assumed
the click had failed.

Also adds the missing else-branch so a future contract drift fails loudly."
```

---

## Task 0.3: Reconcile today's 5,175 AED payment

> **BLOCKED** until Abdou confirms reading (A) or (B) above. Steps below assume **(A)**: invoice base is 5,000.

**Files:**
- Create: `scripts/reconcile-2026-07-25-stripe.sql`

- [ ] **Step 1: Re-verify current state before writing anything**

```bash
pnpm db:query "SELECT id, invoice_number, status, total, amount_paid, amount_due FROM pyra_invoices WHERE id IN ('inv_dwCVExs8npNiOulk','inv_4_dykvTYusGzn5oX')"
```

Expected: both `sent`, total 6000.00, amount_paid 0.00.

- [ ] **Step 2: Take a backup snapshot**

```bash
pnpm db:backup pre-stripe-reconcile
```

- [ ] **Step 3: Write the reconciliation SQL**

Create `scripts/reconcile-2026-07-25-stripe.sql`. It is UTF-8 (contains Arabic) so it **must** go through the file path form of `pnpm db:query`, never inline.

```sql
-- Reconcile the 2026-07-25 Stripe payment that the (disabled) webhook never booked.
-- Charge ch_3Tx5D13HV9MX1JIk1jYYU5Vv / intent pi_3Tx5D13HV9MX1JIk1UCl6eEC
-- Gross 5,175 AED = 5,000 base + 175 card surcharge (3.5%). Stripe fee 158.63.
BEGIN;

-- 1. INV-0030 is the surviving invoice; correct its total to the agreed base.
UPDATE pyra_invoices
   SET total = 5000.00,
       subtotal = 5000.00,
       amount_due = 5000.00,
       updated_at = now()
 WHERE id = 'inv_dwCVExs8npNiOulk'
   AND status = 'sent';

-- 2. Book the base amount as the ledger payment. reference = the Stripe intent,
--    which is exactly what the webhook would have written, so a future replay
--    of this event hits the idempotency check and skips.
INSERT INTO pyra_payments (id, invoice_id, amount, payment_date, method, reference, notes, recorded_by)
VALUES (
  'pay_' || substr(md5(random()::text), 1, 16),
  'inv_dwCVExs8npNiOulk',
  5000.00,
  DATE '2026-07-25',
  'online',
  'pi_3Tx5D13HV9MX1JIk1UCl6eEC',
  'Stripe — تسوية يدوية لدفعة لم يسجلها الويبهوك (كان معطلاً). الإجمالي المحصل 5175 = 5000 + 175 رسوم بطاقة 3.5%. رسوم Stripe الفعلية 158.63.'
, 'system');

-- 3. Settle the invoice.
UPDATE pyra_invoices
   SET amount_paid = 5000.00,
       amount_due = 0.00,
       status = 'paid',
       updated_at = now()
 WHERE id = 'inv_dwCVExs8npNiOulk';

-- 4. Cancel the duplicate.
UPDATE pyra_invoices
   SET status = 'cancelled',
       updated_at = now()
 WHERE id = 'inv_4_dykvTYusGzn5oX'
   AND status = 'sent';

-- 5. Mark the orphaned local session record as cancelled (its Stripe session
--    expires 2026-07-26 unpaid).
UPDATE pyra_stripe_payments
   SET status = 'cancelled', updated_at = now()
 WHERE stripe_session_id = 'cs_live_a1kLVn5fqoDdAT5wWNTh7zRTCCG0curklbdnV6QcRoAkFVqF39HMWu5PVn';

COMMIT;
```

- [ ] **Step 4: Run it**

```bash
pnpm db:query scripts/reconcile-2026-07-25-stripe.sql
```

- [ ] **Step 5: Verify — including that the Arabic note is not mojibake**

```bash
pnpm db:query "SELECT invoice_number, status, total, amount_paid, amount_due FROM pyra_invoices WHERE id IN ('inv_dwCVExs8npNiOulk','inv_4_dykvTYusGzn5oX')"
pnpm db:query "SELECT amount, method, reference, notes FROM pyra_payments WHERE reference = 'pi_3Tx5D13HV9MX1JIk1UCl6eEC'"
```

Expected: INV-0030 `paid` 5000/5000/0 · INV-0031 `cancelled` · one payment row whose `notes` renders readable Arabic (if you see `?????` or `Ø`, the write was corrupted — restore the backup and re-run via the file, never inline).

- [ ] **Step 6: Record the Stripe fee as an expense** *(optional, ask Abdou)*

158.63 AED belongs in an expense category (`ec_bank_fees` or equivalent) so the books tie to the 5,016.37 actually deposited. Confirm the category id before inserting.

- [ ] **Step 7: Commit the script**

```bash
git add scripts/reconcile-2026-07-25-stripe.sql
git commit -m "chore(finance): reconcile 2026-07-25 Stripe payment the disabled webhook missed"
```

---

# PHASE 1 — Make settlement trustworthy

## Task 1.1: Migration — real idempotency + missing index

**Files:**
- Create: `supabase/migrations/053_stripe_payment_integrity.sql`

- [ ] **Step 1: Check for pre-existing duplicates that would block the constraint**

```bash
pnpm db:query "SELECT invoice_id, reference, count(*) FROM pyra_payments WHERE reference IS NOT NULL GROUP BY invoice_id, reference HAVING count(*) > 1"
```

Expected: `[]`. If not empty, resolve the duplicates before proceeding.

- [ ] **Step 2: Write the migration**

```sql
-- 053_stripe_payment_integrity.sql
-- The webhook's duplicate-payment guard is a read-then-insert with nothing
-- enforcing it. Two concurrent deliveries of the same event both read "no row"
-- and both insert, doubling amount_paid. Make the DB the authority.

-- Partial unique: reference is NULL for many manual payments, and NULLs must
-- not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_invoice_reference
  ON pyra_payments (invoice_id, reference)
  WHERE reference IS NOT NULL;

-- The refund / dispute / payment-failed handlers all look up by this column
-- on every delivery; it was unindexed.
CREATE INDEX IF NOT EXISTS idx_stripe_payment_intent
  ON pyra_stripe_payments (stripe_payment_intent_id);
```

- [ ] **Step 3: Apply and verify**

```bash
pnpm db:query supabase/migrations/053_stripe_payment_integrity.sql
pnpm db:query "SELECT indexname FROM pg_indexes WHERE tablename IN ('pyra_payments','pyra_stripe_payments') ORDER BY indexname"
```

Expected: both `uniq_payments_invoice_reference` and `idx_stripe_payment_intent` present.

- [ ] **Step 4: Record and commit**

```bash
pnpm db:record 053_stripe_payment_integrity --by=abdou --notes="unique (invoice_id,reference) + intent index"
git add supabase/migrations/053_stripe_payment_integrity.sql
git commit -m "feat(db): enforce Stripe payment idempotency at the DB level (migration 053)"
```

---

## Task 1.2: Extract the settlement core

**Files:**
- Create: `lib/stripe/settle.ts`
- Test: `__tests__/stripe-settle.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SettleInput = {
    invoiceId: string;
    grossAmount: number;      // what Stripe actually charged, in major units
    baseAmount: number;       // what should settle the invoice (gross - surcharge)
    reference: string;        // stable idempotency key (payment_intent id)
    clientId: string | null;
    note: string;
  };
  export type SettleResult =
    | { ok: true; skipped: true; reason: 'already_recorded' }
    | { ok: true; skipped: false; amountPaid: number; amountDue: number; status: string }
    | { ok: false; error: string; retryable: boolean };
  export async function settleInvoicePayment(
    supabase: SupabaseClient, input: SettleInput,
  ): Promise<SettleResult>;
  export function deriveInvoiceState(
    total: number, paymentsSum: number,
  ): { amountPaid: number; amountDue: number; status: 'sent' | 'partially_paid' | 'paid' };
  ```

- [ ] **Step 1: Write the failing test for the pure state derivation**

Create `__tests__/stripe-settle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveInvoiceState } from '@/lib/stripe/settle';

describe('deriveInvoiceState', () => {
  it('marks fully paid when the sum covers the total', () => {
    expect(deriveInvoiceState(5000, 5000)).toEqual({
      amountPaid: 5000, amountDue: 0, status: 'paid',
    });
  });

  it('marks partially paid on a short payment', () => {
    expect(deriveInvoiceState(6000, 5000)).toEqual({
      amountPaid: 5000, amountDue: 1000, status: 'partially_paid',
    });
  });

  it('returns to sent when refunds zero the balance', () => {
    expect(deriveInvoiceState(5000, 0)).toEqual({
      amountPaid: 0, amountDue: 5000, status: 'sent',
    });
  });

  it('does NOT clamp an overpayment away — it stays visible', () => {
    expect(deriveInvoiceState(5000, 6000)).toEqual({
      amountPaid: 6000, amountDue: 0, status: 'paid',
    });
  });

  it('rounds to 2dp rather than accumulating float error', () => {
    expect(deriveInvoiceState(100, 33.333)).toEqual({
      amountPaid: 33.33, amountDue: 66.67, status: 'partially_paid',
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm test __tests__/stripe-settle.test.ts
```

Expected: FAIL — cannot resolve `@/lib/stripe/settle`.

- [ ] **Step 3: Implement `deriveInvoiceState` and `settleInvoicePayment`**

Create `lib/stripe/settle.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';
import { dubaiDayKey } from '@/lib/utils/format';
import { logError } from '@/lib/observability/log-error';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function deriveInvoiceState(total: number, paymentsSum: number) {
  const amountPaid = round2(paymentsSum);
  const amountDue = round2(Math.max(0, total - amountPaid));
  // A zero-or-negative balance paid is 'sent' (refunded back to unpaid);
  // the old code had no such arm and mislabelled unpaid invoices as
  // partially_paid whenever the payment insert had silently failed.
  const status = amountPaid <= 0 ? 'sent' : amountDue <= 0 ? 'paid' : 'partially_paid';
  return { amountPaid, amountDue, status } as const;
}

export type SettleInput = {
  invoiceId: string;
  grossAmount: number;
  baseAmount: number;
  reference: string;
  clientId: string | null;
  note: string;
};

export type SettleResult =
  | { ok: true; skipped: true; reason: 'already_recorded' }
  | { ok: true; skipped: false; amountPaid: number; amountDue: number; status: string }
  | { ok: false; error: string; retryable: boolean };

export async function settleInvoicePayment(
  supabase: SupabaseClient,
  input: SettleInput,
): Promise<SettleResult> {
  const { invoiceId, baseAmount, grossAmount, reference, note } = input;

  const { data: invoice, error: invErr } = await supabase
    .from('pyra_invoices')
    .select('id, total, invoice_number, status')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invErr) return { ok: false, error: `invoice read: ${invErr.message}`, retryable: true };
  if (!invoice) return { ok: false, error: `invoice ${invoiceId} not found`, retryable: false };

  // Insert first and let the DB unique index be the idempotency authority.
  // 23505 = unique_violation => this event was already settled.
  const { error: payErr } = await supabase.from('pyra_payments').insert({
    id: generateId('pay'),
    invoice_id: invoiceId,
    amount: baseAmount,
    payment_date: dubaiDayKey(),
    method: 'online',
    reference,
    notes: note,
    recorded_by: 'system',
  });

  if (payErr) {
    if (payErr.code === '23505') return { ok: true, skipped: true, reason: 'already_recorded' };
    return { ok: false, error: `payment insert: ${payErr.message}`, retryable: true };
  }

  const { data: allPayments, error: sumErr } = await supabase
    .from('pyra_payments')
    .select('amount')
    .eq('invoice_id', invoiceId);

  if (sumErr) {
    // The payment row IS committed. Roll it back so a retry can redo the whole
    // unit cleanly rather than leaving a payment with a stale invoice.
    await supabase.from('pyra_payments').delete().eq('invoice_id', invoiceId).eq('reference', reference);
    return { ok: false, error: `payments re-sum: ${sumErr.message}`, retryable: true };
  }

  const sum = (allPayments ?? []).reduce((s, p: { amount: number }) => s + Number(p.amount), 0);
  const next = deriveInvoiceState(Number(invoice.total), sum);

  // Never resurrect a terminal invoice. Record the money, but leave a cancelled
  // invoice cancelled and shout about it.
  const isTerminal = invoice.status === 'cancelled';
  const update: Record<string, unknown> = {
    amount_paid: next.amountPaid,
    amount_due: next.amountDue,
    updated_at: new Date().toISOString(),
  };
  if (!isTerminal) update.status = next.status;

  const { error: updErr } = await supabase.from('pyra_invoices').update(update).eq('id', invoiceId);

  if (updErr) {
    await supabase.from('pyra_payments').delete().eq('invoice_id', invoiceId).eq('reference', reference);
    return { ok: false, error: `invoice update: ${updErr.message}`, retryable: true };
  }

  if (isTerminal) {
    logError({
      severity: 'warning',
      error: new Error(`Payment received on cancelled invoice ${invoice.invoice_number}`),
      metadata: { source: 'stripe_settle', invoice_id: invoiceId, reference, grossAmount },
    });
  }

  if (round2(grossAmount) !== round2(baseAmount) && next.amountPaid > Number(invoice.total)) {
    logError({
      severity: 'warning',
      error: new Error(`Overpayment on invoice ${invoice.invoice_number}`),
      metadata: { source: 'stripe_settle', invoice_id: invoiceId, total: invoice.total, amountPaid: next.amountPaid },
    });
  }

  return { ok: true, skipped: false, ...next };
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test __tests__/stripe-settle.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
pnpm run check
git add lib/stripe/settle.ts __tests__/stripe-settle.test.ts
git commit -m "feat(stripe): extract settlement core with checked errors and DB-backed idempotency"
```

---

## Task 1.3: Route `checkout.session.completed` through the settlement core

**Files:**
- Modify: `app/api/stripe/webhook/route.ts:68-321`

- [ ] **Step 1: Replace the hand-rolled money block**

In the `checkout.session.completed` branch, replace lines 106-156 (amount calc, idempotency read, insert, re-sum, invoice update) with:

```ts
      const grossAmount = (session.amount_total || 0) / 100;
      const surcharge = Number(session.metadata?.surcharge_amount ?? 0);
      const baseAmount = surcharge > 0 ? Math.round((grossAmount - surcharge) * 100) / 100 : grossAmount;

      const settled = await settleInvoicePayment(supabase, {
        invoiceId,
        grossAmount,
        baseAmount,
        reference: paymentRef,
        clientId: clientId ?? null,
        note: surcharge > 0
          ? `Stripe online payment — ${baseAmount} + ${surcharge} card fee`
          : 'Stripe online payment',
      });

      if (!settled.ok) {
        logError({
          error: new Error(settled.error),
          request: req,
          metadata: { source: 'stripe_webhook', event: event.type, invoice_id: invoiceId, reference: paymentRef },
        });
        // Non-2xx so Stripe retries. The DB unique index makes the retry safe.
        return NextResponse.json({ error: settled.error }, { status: settled.retryable ? 500 : 400 });
      }

      if (settled.skipped) {
        console.log(`[Stripe Webhook] Already settled ref=${paymentRef}, skipping`);
        return NextResponse.json({ received: true });
      }

      const newStatus = settled.status;
```

Add the import at the top:

```ts
import { settleInvoicePayment } from '@/lib/stripe/settle';
```

- [ ] **Step 2: Check the remaining unchecked writes in the branch**

The `pyra_stripe_payments` update (line 84), the client notification, and the activity log all still discard errors. Convert the notification to `notify()` and the activity row to `logActivity()` per the Global Constraints, and check the error on the session-record update:

```ts
      const { error: sessErr } = await supabase
        .from('pyra_stripe_payments')
        .update({ stripe_payment_intent_id: paymentIntentId, status: 'completed', updated_at: new Date().toISOString() })
        .eq('stripe_session_id', session.id);
      if (sessErr) {
        logError({ severity: 'warning', error: sessErr, request: req,
          metadata: { source: 'stripe_webhook', step: 'session_record', session_id: session.id } });
      }
```

Note the ordering change: the session record is now updated **after** `settleInvoicePayment` succeeds, so a stuck `pending` row remains a truthful signal for the Phase 4 reconciler.

- [ ] **Step 3: Typecheck**

```bash
pnpm run check
```

- [ ] **Step 4: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "fix(stripe): settle payments through the checked core; retry on failure instead of ACKing 200

Every money write in the completed-session branch discarded its Supabase error
and then returned 200, so a failed insert permanently lost the payment while
Stripe considered the event delivered."
```

---

## Task 1.4: Same treatment for refunds and dispute-loss

**Files:**
- Modify: `app/api/stripe/webhook/route.ts` — `charge.refunded` (339-465), `charge.dispute.closed` (531-636)

- [ ] **Step 1: Make the no-match case loud instead of silent**

Both branches currently fall through to `{received: true}` when no `pyra_stripe_payments` row matches the intent — so a refund on a payment whose session record was never written is never booked. Add a fallback lookup by the payment reference before giving up:

```ts
        if (!stripePayment) {
          // Fall back to the ledger: the payment may have been booked without a
          // session record (manual reconciliation, or a Stripe-native invoice).
          const { data: byRef } = await supabase
            .from('pyra_payments')
            .select('invoice_id')
            .eq('reference', paymentIntentId)
            .maybeSingle();

          if (!byRef) {
            logError({
              severity: 'warning',
              error: new Error(`Refund for unknown intent ${paymentIntentId}`),
              request: req,
              metadata: { source: 'stripe_webhook', event: event.type, payment_intent: paymentIntentId },
            });
            await notifyAdmins(supabase, {
              type: 'payment_refunded',
              title: '⚠️ استرجاع لدفعة غير معروفة',
              message: `استرجاع من Stripe لعملية غير مسجلة عندنا — ${paymentIntentId}`,
              link: '/dashboard/finance',
              from: { username: 'system', displayName: 'Stripe' },
            });
            return NextResponse.json({ received: true });
          }
          // ...continue with byRef.invoice_id
        }
```

- [ ] **Step 2: Check the negative-payment insert errors**

Both branches insert a negative `pyra_payments` row and ignore the error, then notify the client that money was returned. Destructure and check:

```ts
            const { error: refundErr } = await supabase.from('pyra_payments').insert({ /* ...as before... */ });
            if (refundErr) {
              logError({ error: refundErr, request: req,
                metadata: { source: 'stripe_webhook', event: event.type, payment_intent: paymentIntentId } });
              return NextResponse.json({ error: 'refund insert failed' }, { status: 500 });
            }
```

- [ ] **Step 3: Recompute the contract's `amount_collected` after refunds too**

The contract re-sum currently runs only in the completed branch, so `amount_collected` only ever rises. Extract it into a helper and call it from all three money branches:

```ts
async function recalcContractCollected(supabase: SupabaseClient, invoiceId: string): Promise<void> {
  // ...the existing lines 190-250 logic, called after every money mutation...
}
```

- [ ] **Step 4: Typecheck and commit**

```bash
pnpm run check
git add app/api/stripe/webhook/route.ts
git commit -m "fix(stripe): refunds and dispute losses no longer vanish silently

- unknown payment_intent now logs + alerts admins instead of returning 200
- negative-payment insert errors are checked and retried
- contract amount_collected is recomputed on refund/dispute, not only on payment"
```

---

## Task 1.5: Gate link minting on payable status

**Files:**
- Modify: `lib/constants/statuses.ts`
- Modify: `app/api/stripe/create-checkout/route.ts:68`
- Modify: `app/api/portal/invoices/[id]/pay/route.ts:82`
- Test: `__tests__/invoice-payable-status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { isPayableInvoiceStatus } from '@/lib/constants/statuses';

describe('isPayableInvoiceStatus', () => {
  it('allows the outstanding states', () => {
    expect(isPayableInvoiceStatus('sent')).toBe(true);
    expect(isPayableInvoiceStatus('overdue')).toBe(true);
    expect(isPayableInvoiceStatus('partially_paid')).toBe(true);
  });

  it('blocks draft, cancelled, paid and expired', () => {
    for (const s of ['draft', 'cancelled', 'paid', 'expired']) {
      expect(isPayableInvoiceStatus(s)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm test __tests__/invoice-payable-status.test.ts
```

- [ ] **Step 3: Add the shared helper**

Append to `lib/constants/statuses.ts`:

```ts
/**
 * Single source of truth for "can a payment link be minted / redeemed?".
 * The dashboard route previously blocked only 'paid' while the portal blocked
 * four statuses — so a cancelled invoice was payable from the dashboard and the
 * webhook then flipped it to 'paid'.
 */
export function isPayableInvoiceStatus(status: string): boolean {
  return (INVOICE_OUTSTANDING_STATUSES as string[]).includes(status);
}
```

- [ ] **Step 4: Use it in both routes**

`app/api/stripe/create-checkout/route.ts`, replacing the `status === 'paid'` check:

```ts
    if (!isPayableInvoiceStatus(invoice.status)) {
      return apiError('لا يمكن إنشاء رابط دفع لهذه الفاتورة');
    }
```

`app/api/portal/invoices/[id]/pay/route.ts`, replacing the blocklist:

```ts
    if (!isPayableInvoiceStatus(invoice.status)) {
      return apiError('لا يمكن الدفع لهذه الفاتورة');
    }
```

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test __tests__/invoice-payable-status.test.ts && pnpm run check
git add lib/constants/statuses.ts app/api/stripe/create-checkout/route.ts "app/api/portal/invoices/[id]/pay/route.ts" __tests__/invoice-payable-status.test.ts
git commit -m "fix(stripe): one payable-status gate for both checkout routes"
```

---

## Task 1.6: Stop the poison-pill 400 and fix the 401/500 misdiagnosis

**Files:**
- Modify: `app/api/stripe/webhook/route.ts:78-81` and `708-732`

- [ ] **Step 1: Make a missing `invoice_id` a permanent skip, not a retry loop**

An event we can never process (Stripe test events, sessions from another integration) currently returns 400 forever — Stripe retries for days and can disable the endpoint, which is exactly how we got here.

```ts
      if (!invoiceId) {
        logError({
          severity: 'warning',
          error: new Error('Checkout session has no invoice_id metadata'),
          request: req,
          metadata: { source: 'stripe_webhook', session_id: session.id },
        });
        // 200: unprocessable but not retryable — do not let it poison the endpoint.
        return NextResponse.json({ received: true, ignored: 'no invoice_id' });
      }
```

- [ ] **Step 2: Replace the string-matched error triage with a typed check**

```ts
  } catch (error) {
    const isSignatureError =
      error instanceof Stripe.errors.StripeSignatureVerificationError;

    if (isSignatureError) {
      logError({ severity: 'warning', error, request: req,
        metadata: { source: 'webhook', provider: 'stripe', reason: 'signature_verification' } });
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    logError({ error, request: req,
      metadata: { source: 'webhook', provider: 'stripe', reason: 'processing' } });
    console.error('[Stripe Webhook] Processing error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
```

The old code matched the words "signature" or "Webhook" anywhere in the message, so a genuine processing failure mentioning either word returned 401 — and Stripe stops retrying 4xx.

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm run check
git add app/api/stripe/webhook/route.ts
git commit -m "fix(stripe): stop poison-pill retries and misclassified signature errors"
```

---

# PHASE 2 — Settle Stripe-native invoices

Today's 5,175 payment produced `invoice.payment_succeeded`, not `checkout.session.completed`. Even with the endpoint enabled, invoices raised inside the Stripe Dashboard never reach Pyra.

> **⚠️ Task ordering:** Task 2.1 consumes `getSurchargePercent()` from **Task 3.1**.
> Either run Task 3.1 before Task 2.1, or implement Task 2.1 with `const pct = 0;`
> and revisit it when Phase 3 lands. Running 3.1 first is cleaner — it has no
> dependency of its own.

## Task 2.1: Handle `invoice.payment_succeeded`

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`
- Test: `__tests__/stripe-invoice-event-mapping.test.ts`

**Interfaces:**
- Consumes: `settleInvoicePayment` + `deriveInvoiceState` from Task 1.2; `getSurchargePercent` from Task 3.1; the existing module-local `notifyAdmins` in `app/api/stripe/webhook/route.ts:15-30`
- Produces: `pickPyraInvoiceId(stripeInvoice, outstanding) => string | null` in `lib/stripe/settle.ts`

- [ ] **Step 1: Write the failing mapping test**

```ts
import { describe, it, expect } from 'vitest';
import { pickPyraInvoiceId } from '@/lib/stripe/settle';

describe('pickPyraInvoiceId', () => {
  it('prefers explicit metadata', () => {
    expect(pickPyraInvoiceId({ metadata: { pyra_invoice_id: 'inv_A' } }, [])).toBe('inv_A');
  });

  it('falls back to a single outstanding invoice for the matched client', () => {
    expect(pickPyraInvoiceId({ metadata: {} }, [{ id: 'inv_B' }])).toBe('inv_B');
  });

  it('refuses to guess when the client has several outstanding invoices', () => {
    expect(pickPyraInvoiceId({ metadata: {} }, [{ id: 'inv_B' }, { id: 'inv_C' }])).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(pickPyraInvoiceId({ metadata: {} }, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm test __tests__/stripe-invoice-event-mapping.test.ts
```

- [ ] **Step 3: Implement the resolver in `lib/stripe/settle.ts`**

```ts
export function pickPyraInvoiceId(
  stripeInvoice: { metadata?: Record<string, string> | null },
  outstanding: { id: string }[],
): string | null {
  const explicit = stripeInvoice.metadata?.pyra_invoice_id;
  if (explicit) return explicit;
  // Only auto-match when it is unambiguous. Guessing between two outstanding
  // invoices would settle the wrong one, which is worse than asking a human.
  if (outstanding.length === 1) return outstanding[0].id;
  return null;
}
```

- [ ] **Step 4: Add the webhook branch**

```ts
    // ── Handle: invoice.payment_succeeded (Stripe-native invoicing) ──
    if (event.type === 'invoice.payment_succeeded') {
      const stripeInvoice = event.data.object as Stripe.Invoice;
      const intentId = typeof stripeInvoice.payment_intent === 'string'
        ? stripeInvoice.payment_intent : null;
      const gross = (stripeInvoice.amount_paid ?? 0) / 100;
      const email = stripeInvoice.customer_email?.toLowerCase() ?? null;

      if (!intentId || gross <= 0) return NextResponse.json({ received: true });

      const { data: client } = email
        ? await supabase.from('pyra_clients').select('id').ilike('email', email).maybeSingle()
        : { data: null };

      const { data: outstanding } = client
        ? await supabase.from('pyra_invoices').select('id')
            .eq('client_id', client.id)
            .in('status', ['sent', 'overdue', 'partially_paid'])
        : { data: [] };

      const targetId = pickPyraInvoiceId(stripeInvoice, outstanding ?? []);

      if (!targetId) {
        // Money is real but we cannot safely attribute it. Alert a human.
        await notifyAdmins(supabase, {
          type: 'payment_confirmed',
          title: '💰 دفعة من Stripe تحتاج ربط يدوي',
          message: `تم استلام ${gross} ${stripeInvoice.currency?.toUpperCase()} من ${email ?? 'عميل غير معروف'} — لم نتمكن من تحديد الفاتورة تلقائياً`,
          link: '/dashboard/finance/stripe-reconcile',
          from: { username: 'system', displayName: 'Stripe' },
        });
        return NextResponse.json({ received: true, unmatched: true });
      }

      const pct = await getSurchargePercent(supabase);
      const base = pct > 0 ? Math.round((gross / (1 + pct / 100)) * 100) / 100 : gross;

      const settled = await settleInvoicePayment(supabase, {
        invoiceId: targetId,
        grossAmount: gross,
        baseAmount: base,
        reference: intentId,
        clientId: client?.id ?? null,
        note: `Stripe invoice ${stripeInvoice.number ?? stripeInvoice.id}`,
      });

      if (!settled.ok) {
        logError({ error: new Error(settled.error), request: req,
          metadata: { source: 'stripe_webhook', event: event.type, invoice_id: targetId } });
        return NextResponse.json({ error: settled.error }, { status: settled.retryable ? 500 : 400 });
      }
    }
```

- [ ] **Step 5: Subscribe the event in Stripe**

Add `invoice.payment_succeeded` to the endpoint's event list (Task 0.1 Step 4).

- [ ] **Step 6: Run tests and commit**

```bash
pnpm test __tests__/stripe-invoice-event-mapping.test.ts && pnpm run check
git add lib/stripe/settle.ts app/api/stripe/webhook/route.ts __tests__/stripe-invoice-event-mapping.test.ts
git commit -m "feat(stripe): settle Stripe-native invoice payments into Pyra

Invoices raised in the Stripe Dashboard emit invoice.payment_succeeded, which we
never handled — today's 5,175 AED payment would have been missed even with the
webhook enabled. Auto-matches by customer email when unambiguous, alerts an
admin otherwise rather than guessing."
```

---

# PHASE 3 — 3.5% card surcharge

> **Accounting decision for Abdou to confirm before implementing.**
>
> Measured today: gross 5,175 → Stripe fee 158.63 → net 5,016.37 against a 5,000 base.
> The 3.5% surcharge over-recovers by ~16 AED, so you are never out of pocket.
>
> **Recommended (option C):** the surcharge becomes a real invoice line item at
> payment time. Invoice total becomes 5,175, the webhook books 5,175, and the
> books tie exactly: revenue 5,175 − fee expense 158.63 = 5,016.37 deposited.
> This matches the Finance Remediation lock ("build it as a separate invoice line
> item — NEVER mutate invoice total") and the client sees the charge itemised.
>
> **Alternative:** keep the invoice at 5,000 and treat the 175 as fee recovery
> outside the invoice. Simpler, but the bank deposit will not reconcile against
> `pyra_payments` without a second adjusting entry.

## Task 3.1: Surcharge settings + pure math

**Files:**
- Create: `lib/stripe/surcharge.ts`
- Create: `supabase/migrations/054_stripe_surcharge_settings.sql`
- Test: `__tests__/stripe-surcharge.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function calcSurcharge(base: number, percent: number): { surcharge: number; gross: number };
  export function baseFromGross(gross: number, percent: number): number;
  export async function getSurchargePercent(supabase: SupabaseClient): Promise<number>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { calcSurcharge, baseFromGross } from '@/lib/stripe/surcharge';

describe('calcSurcharge', () => {
  it('reproduces the real 2026-07-25 transaction', () => {
    expect(calcSurcharge(5000, 3.5)).toEqual({ surcharge: 175, gross: 5175 });
  });

  it('rounds to 2dp', () => {
    expect(calcSurcharge(333.33, 3.5)).toEqual({ surcharge: 11.67, gross: 345 });
  });

  it('is a no-op at 0%', () => {
    expect(calcSurcharge(5000, 0)).toEqual({ surcharge: 0, gross: 5000 });
  });
});

describe('baseFromGross', () => {
  it('inverts calcSurcharge', () => {
    expect(baseFromGross(5175, 3.5)).toBe(5000);
  });

  it('is a no-op at 0%', () => {
    expect(baseFromGross(5000, 0)).toBe(5000);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm test __tests__/stripe-surcharge.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/stripe/surcharge.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calcSurcharge(base: number, percent: number) {
  if (!percent || percent <= 0) return { surcharge: 0, gross: round2(base) };
  const surcharge = round2(base * (percent / 100));
  return { surcharge, gross: round2(base + surcharge) };
}

export function baseFromGross(gross: number, percent: number): number {
  if (!percent || percent <= 0) return round2(gross);
  return round2(gross / (1 + percent / 100));
}

export async function getSurchargePercent(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('pyra_settings')
    .select('key, value')
    .in('key', ['stripe_surcharge_enabled', 'stripe_surcharge_percent']);

  const map = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  if (map.stripe_surcharge_enabled !== 'true') return 0;
  const pct = Number(map.stripe_surcharge_percent);
  return Number.isFinite(pct) && pct > 0 ? pct : 0;
}
```

- [ ] **Step 4: Seed the settings**

Create `supabase/migrations/054_stripe_surcharge_settings.sql`:

```sql
-- Card-fee surcharge passed through to the client. 3.5% covers the measured
-- Stripe cost (2026-07-25: 158.63 fee on a 5,175 charge = 3.07%).
INSERT INTO pyra_settings (key, value)
VALUES ('stripe_surcharge_enabled', 'false'),
       ('stripe_surcharge_percent', '3.5')
ON CONFLICT (key) DO NOTHING;
```

Defaults to `false` — safe by default, matching the Phase 11 Refinement `is_active` lock.

- [ ] **Step 5: Apply, test, commit**

```bash
pnpm db:query supabase/migrations/054_stripe_surcharge_settings.sql
pnpm db:record 054_stripe_surcharge_settings --by=abdou --notes="card surcharge settings"
pnpm test __tests__/stripe-surcharge.test.ts && pnpm run check
git add lib/stripe/surcharge.ts supabase/migrations/054_stripe_surcharge_settings.sql __tests__/stripe-surcharge.test.ts
git commit -m "feat(stripe): card-fee surcharge settings and pure math"
```

---

## Task 3.2: Apply the surcharge when minting a link

**Files:**
- Modify: `app/api/stripe/create-checkout/route.ts`
- Modify: `app/api/portal/invoices/[id]/pay/route.ts`

- [ ] **Step 1: Compute the gross in both routes**

Replace the `unitAmount` calculation in each:

```ts
    const pct = await getSurchargePercent(supabase);
    const { surcharge, gross } = calcSurcharge(amountDue, pct);
    const unitAmount = Math.round(gross * 100);
```

- [ ] **Step 2: Show the surcharge as its own Checkout line**

Replace the single `line_items` entry with:

```ts
        line_items: [
          {
            price_data: {
              currency: invoice.currency.toLowerCase(),
              product_data: { name: `Invoice ${invoice.invoice_number}` },
              unit_amount: Math.round(amountDue * 100),
            },
            quantity: 1,
          },
          ...(surcharge > 0
            ? [{
                price_data: {
                  currency: invoice.currency.toLowerCase(),
                  product_data: { name: `رسوم الدفع الإلكتروني (${pct}%)` },
                  unit_amount: Math.round(surcharge * 100),
                },
                quantity: 1,
              }]
            : []),
        ],
```

- [ ] **Step 3: Carry the split in metadata so the webhook can split it back**

```ts
        metadata: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          client_id: invoice.client_id || '',
          contract_id: contractId,
          base_amount: String(amountDue),
          surcharge_amount: String(surcharge),
        },
```

Mirror the same two keys into `payment_intent_data.metadata`.

- [ ] **Step 4: Typecheck and commit**

```bash
pnpm run check
git add app/api/stripe/create-checkout/route.ts "app/api/portal/invoices/[id]/pay/route.ts"
git commit -m "feat(stripe): add the card-fee surcharge as its own checkout line item"
```

---

# PHASE 4 — Modernisation and safety net

## Task 4.1: Enable dynamic payment methods and update the API version

**Files:**
- Modify: `lib/stripe.ts:36`
- Modify: `app/api/stripe/create-checkout/route.ts:116`
- Modify: `app/api/portal/invoices/[id]/pay/route.ts:113`
- Test: `__tests__/stripe-payment-methods.test.ts`

- [ ] **Step 1: Write the guard test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROUTES = [
  'app/api/stripe/create-checkout/route.ts',
  'app/api/portal/invoices/[id]/pay/route.ts',
];

describe('dynamic payment methods', () => {
  it.each(ROUTES)('%s never pins payment_method_types', (rel) => {
    const src = readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(src).not.toContain('payment_method_types');
  });
});
```

Stripe's official guidance: never pass `payment_method_types` (the sole exception is Terminal `card_present`, which we do not use). Pinning it to `['card']` blocks Apple Pay, Google Pay and Link and costs conversion, especially on mobile.

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm test __tests__/stripe-payment-methods.test.ts
```

- [ ] **Step 3: Delete the line from both routes**

Remove `payment_method_types: ['card'],` from each `checkout.sessions.create` call.

- [ ] **Step 4: Bump the pinned API version**

In `lib/stripe.ts`:

```ts
    _stripe = new Stripe(key, {
      typescript: true,
      apiVersion: '2026-06-24.dahlia',
    });
```

- [ ] **Step 5: Update the SDK if the version is not in its types**

```bash
pnpm add stripe@latest
pnpm run check
```

If `pnpm run check` rejects the version literal, the installed SDK predates it — the upgrade above resolves it.

- [ ] **Step 6: Align the endpoint's API version**

In the Stripe Dashboard, set the endpoint `we_1T52Mp3HV9MX1JIkZ0K5XGa6` to the same version so delivered payloads match the SDK types.

- [ ] **Step 7: Enable the methods in the Dashboard**

<https://dashboard.stripe.com/settings/payment_methods> — enable Apple Pay, Google Pay and Link for the AE account.

- [ ] **Step 8: Test, build, commit**

```bash
pnpm test __tests__/stripe-payment-methods.test.ts && pnpm run check && pnpm build
git add lib/stripe.ts app/api/stripe/create-checkout/route.ts "app/api/portal/invoices/[id]/pay/route.ts" __tests__/stripe-payment-methods.test.ts package.json pnpm-lock.yaml
git commit -m "feat(stripe): enable dynamic payment methods and update to API 2026-06-24.dahlia"
```

---

## Task 4.2: Mask secret values in the settings API

**Files:**
- Modify: `app/api/settings/route.ts`
- Test: `__tests__/settings-secret-masking.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { maskSecretSettings, SECRET_SETTING_KEYS } from '@/app/api/settings/mask';

describe('maskSecretSettings', () => {
  it('never returns a live Stripe secret', () => {
    const out = maskSecretSettings({ stripe_secret_key: 'sk_live_ABCDEFGHIJKLMNOP' });
    expect(out.stripe_secret_key).not.toContain('sk_live_ABCDEF');
    expect(out.stripe_secret_key).toBe('••••••••MNOP');
  });

  it('masks every declared secret key', () => {
    for (const k of SECRET_SETTING_KEYS) {
      expect(maskSecretSettings({ [k]: 'supersecretvalue' })[k]).toMatch(/^••••••••/);
    }
  });

  it('passes non-secret settings through untouched', () => {
    expect(maskSecretSettings({ company_name: 'Pyramedia' }).company_name).toBe('Pyramedia');
  });

  it('leaves an empty value empty so the UI can show "not set"', () => {
    expect(maskSecretSettings({ stripe_secret_key: '' }).stripe_secret_key).toBe('');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm test __tests__/settings-secret-masking.test.ts
```

- [ ] **Step 3: Implement**

Create `app/api/settings/mask.ts`:

```ts
export const SECRET_SETTING_KEYS = [
  'stripe_secret_key',
  'stripe_webhook_secret',
  'smtp_pass',
  'whatsapp_ai_api_key',
] as const;

export const MASK_SENTINEL = '••••••••';

/** Replace secret values with a sentinel + last-4 so the UI can show they are set. */
export function maskSecretSettings(map: Record<string, string>): Record<string, string> {
  const out = { ...map };
  for (const key of SECRET_SETTING_KEYS) {
    const v = out[key];
    if (typeof v === 'string' && v.length > 0) out[key] = MASK_SENTINEL + v.slice(-4);
  }
  return out;
}

/** True when a submitted value is the mask coming back unchanged. */
export function isMaskedValue(value: string): boolean {
  return typeof value === 'string' && value.startsWith(MASK_SENTINEL);
}
```

- [ ] **Step 4: Wire it into GET and guard PATCH**

In `app/api/settings/route.ts` GET, after building `settingsMap`:

```ts
    return apiSuccess(maskSecretSettings(settingsMap));
```

In PATCH, skip any secret whose submitted value is still the mask — otherwise saving the settings form would overwrite the real key with `••••••••abcd`:

```ts
      if (isMaskedValue(String(value))) continue;
```

- [ ] **Step 5: Verify the UI still works**

Open `/dashboard/settings` and confirm the Stripe fields show the mask, and that saving an unrelated setting does not blank them:

```bash
pnpm db:query "SELECT key, CASE WHEN value LIKE 'sk_live%' THEN 'still-live-key' ELSE 'CHANGED' END FROM pyra_settings WHERE key='stripe_secret_key'"
```

Expected: `still-live-key`.

- [ ] **Step 6: Commit**

```bash
pnpm test __tests__/settings-secret-masking.test.ts && pnpm run check
git add app/api/settings/mask.ts app/api/settings/route.ts __tests__/settings-secret-masking.test.ts
git commit -m "fix(security): stop returning live Stripe/SMTP secrets to the browser

GET /api/settings selected key,value with no masking, so the live sk_live_ key
reached the network tab, the React Query cache, and any browser extension on the
origin. Values are now masked on read, and PATCH ignores the mask on the way back."
```

---

## Task 4.3: Nightly reconciliation cron

**Files:**
- Create: `app/api/cron/stripe-reconcile/route.ts`
- Modify: `app/api/stripe/webhook/route.ts` (export `notifyAdmins`) **or** create `lib/stripe/notify-admins.ts`

**Interfaces:**
- Consumes: `settleInvoicePayment` (Task 1.2), `getStripeClient` (`lib/stripe.ts`), `getExternalAuth` (`lib/api/auth.ts`)
- Note: `notifyAdmins` is currently a module-local function inside the webhook route. Extract it to `lib/stripe/notify-admins.ts` first so both the webhook and this cron import the same implementation — do not copy-paste it.

- [ ] **Step 0: Extract `notifyAdmins` into `lib/stripe/notify-admins.ts`**

Move the function from `app/api/stripe/webhook/route.ts:15-30` verbatim into the new module, export it, and import it back into the webhook route. No behaviour change — this is purely so the cron can reuse it.

```bash
pnpm run check
git add lib/stripe/notify-admins.ts app/api/stripe/webhook/route.ts
git commit -m "refactor(stripe): extract notifyAdmins so the reconcile cron can reuse it"
```

- [ ] **Step 1: Implement the endpoint following the Phase D §7 cron pattern**

```ts
export async function POST(request: NextRequest) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.stripe-reconcile') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.stripe-reconcile', 403);
    }

    const supabase = createServiceRoleClient();
    const stripe = await getStripeClient();

    // Any session still 'pending' after its 24h lifetime is either genuinely
    // abandoned or a settlement we missed. Ask Stripe which.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: stale } = await supabase
      .from('pyra_stripe_payments')
      .select('id, invoice_id, stripe_session_id, client_id')
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .limit(100);

    let settled = 0, expired = 0;
    for (const row of stale ?? []) {
      const s = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
      if (s.payment_status === 'paid') {
        const gross = (s.amount_total ?? 0) / 100;
        const surcharge = Number(s.metadata?.surcharge_amount ?? 0);
        const res = await settleInvoicePayment(supabase, {
          invoiceId: row.invoice_id,
          grossAmount: gross,
          baseAmount: surcharge > 0 ? Math.round((gross - surcharge) * 100) / 100 : gross,
          reference: (s.payment_intent as string) || `session_${s.id}`,
          clientId: row.client_id,
          note: 'Stripe — settled by reconciliation cron (webhook missed)',
        });
        if (res.ok) {
          settled++;
          await supabase.from('pyra_stripe_payments')
            .update({ status: 'completed', stripe_payment_intent_id: s.payment_intent as string })
            .eq('id', row.id);
        }
      } else if (s.status === 'expired') {
        expired++;
        await supabase.from('pyra_stripe_payments').update({ status: 'cancelled' }).eq('id', row.id);
      }
    }

    if (settled > 0) {
      await notifyAdmins(supabase, {
        type: 'payment_confirmed',
        title: '🔄 دفعات تم إنقاذها بالمصالحة',
        message: `سجّلت المصالحة الليلية ${settled} دفعة لم يسجلها الويبهوك`,
        link: '/dashboard/finance',
        from: { username: 'system', displayName: 'Stripe' },
      });
    }

    return apiSuccess({ checked: stale?.length ?? 0, settled, expired });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'stripe-reconcile' } });
    return apiServerError();
  }
}
```

- [ ] **Step 2: Wire it in n8n**

Add an HTTP Request node to the existing **PyraFinance_Cron** workflow (`tWRE4tlQCX5xRzNK`), daily ~09:00 Dubai, POSTing to `/api/cron/stripe-reconcile` with the scoped cron API key. Grant that key `cron.stripe-reconcile`.

- [ ] **Step 3: Verify manually before scheduling**

```bash
curl -X POST https://workspace.pyramedia.cloud/api/cron/stripe-reconcile -H "x-api-key: <cron key>"
```

Expected: `{"data":{"checked":N,"settled":0,"expired":N}}`.

- [ ] **Step 4: Commit**

```bash
pnpm run check && pnpm build
git add app/api/cron/stripe-reconcile/route.ts
git commit -m "feat(stripe): nightly reconciliation cron so a missed webhook is self-healing"
```

---

## Task 4.4: Wire the dead `stripe_enabled` switch

**Files:**
- Modify: `lib/stripe.ts:53`
- Modify: both checkout routes

- [ ] **Step 1: Make the flag authoritative**

```ts
export async function isStripeEnabled(): Promise<boolean> {
  const key = await getSettingValue('stripe_secret_key', 'STRIPE_SECRET_KEY');
  if (!key) return false;
  const flag = await getSettingValue('stripe_enabled', 'STRIPE_ENABLED');
  // Absent flag = enabled, preserving today's behaviour for existing installs.
  return flag !== 'false';
}
```

- [ ] **Step 2: Gate both routes**

```ts
    if (!(await isStripeEnabled())) {
      return apiError('الدفع الإلكتروني غير مفعّل حالياً', 503);
    }
```

- [ ] **Step 3: Hide the portal pay button when disabled**

Expose the flag on the portal invoice GET response and gate the `canPay` computation in `app/portal/(main)/invoices/[id]/page.tsx` on it.

- [ ] **Step 4: Commit**

```bash
pnpm run check
git add lib/stripe.ts app/api/stripe/create-checkout/route.ts "app/api/portal/invoices/[id]/pay/route.ts" "app/portal/(main)/invoices/[id]/page.tsx"
git commit -m "fix(stripe): make the stripe_enabled setting actually disable payments"
```

---

## Task 4.5: Verify the whole flow end to end

- [ ] **Step 1: Full verification suite**

```bash
pnpm run check && pnpm lint && pnpm test && pnpm build
```

All four must pass with zero errors before pushing.

- [ ] **Step 2: Live smoke test with a small real amount**

Create a 10 AED test invoice for an internal client, mint a link from the dashboard, pay it with a real card, then confirm:

```bash
pnpm db:query "SELECT invoice_number, status, amount_paid, amount_due FROM pyra_invoices WHERE invoice_number = '<the test invoice>'"
pnpm db:query "SELECT count(*) FROM pyra_activity_log WHERE ip_address = 'stripe_webhook'"
```

Expected: invoice `paid`, and the activity count is finally **greater than zero** — the first webhook-settled payment in the system's history.

- [ ] **Step 3: Refund the smoke test and confirm the reversal books**

Refund it in the Stripe Dashboard, then:

```bash
pnpm db:query "SELECT amount, method, reference FROM pyra_payments WHERE invoice_id = '<id>' ORDER BY created_at"
```

Expected: a positive row and a negative `refund` row; invoice back to `sent`.

- [ ] **Step 4: Push**

```bash
git fetch origin && git status
git push
```

> ⚠️ `integrate-pending-fixes` tracks `origin/main` — a bare `git push` deploys to production via Coolify. Confirm with Abdou before pushing.

---

## Deferred to v1.1 (documented, not in scope)

- Migrate `sk_live_` to a **restricted key (`rk_`)** with least-privilege scopes (Abdou chose masking only for now).
- Rotate the current `sk_live_` key (it was DB-readable during the Gap #3 window and browser-readable until Task 4.2).
- Deliver the payment link to the client automatically (email/WhatsApp) — currently the link is copied to clipboard and nothing sends it.
- Verify the Stripe session server-side on `/pay/success` instead of asserting success unconditionally.
- Handle `charge.dispute.funds_reinstated` and `refund.failed` (a failed refund after we booked the negative payment leaves the ledger permanently wrong).
- Book the actual Stripe fee as an expense automatically from the balance transaction.
- Admin reconciliation screen at `/dashboard/finance/stripe-reconcile` (the cron alert currently deep-links to a route that does not exist yet).
- Fix the commission auto-calculate block: it writes four columns that do not exist on `pyra_employee_payments` (`display_name`, `type`, `notes`, `created_by`; the real column is `description`). Currently dormant because `commission_auto_calculate` is unset.
