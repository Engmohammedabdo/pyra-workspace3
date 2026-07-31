# Quick Payment Link — Implementation Plan

**Goal:** One dialog — name + amount → a payable link. Client, invoice, line item and
public link are created behind the scenes, the card surcharge is applied, and the payer
gets a public receipt page with no login.

**Why:** Three times the owner has raised a link in the Stripe Dashboard instead, because
the in-system path is five screens. Each time the money landed in Stripe but NOT in Pyra
and had to be reconciled by hand (2,500 Apr · 5,175 Jul-25 · 728 Jul-31). The fix is not
faster reconciliation — it is making the in-system path the fastest path.

**Owner decisions (2026-07-31):** surcharge = a settings default, overridable per link ·
email optional with a server-minted placeholder · a public thank-you page with no login.

---

## Research-driven design changes (do NOT revert these)

1. **Create the invoice directly as `SENT`, not draft.** `PATCH /api/invoices/[id]` cannot
   do draft→sent (`VALID_TRANSITIONS` at `app/api/invoices/[id]/route.ts:241-245`); the
   only path is the `/send` route. Creating as SENT removes a whole failure step, and is
   already precedented at `lib/finance/recurring-generation.ts:220`.
2. **Do direct inserts — do not call `POST /api/invoices` internally.** Five existing
   sites already do direct inserts (`from-quote`, both `generate-invoice` routes,
   `external/invoices`, `recurring-generation`). Auth is cookie-based, so an internal
   fetch would have to forward cookies.
3. **Reuse `pyra_document_links` + `/d/[token]`** for the public page. Verified: its CHECK
   already permits `entity_type='invoice'`. The walk-in gets ONE url for view → pay →
   receipt. No new public-route security surface to design from scratch.
4. **Surcharge maths is ADDITIVE, never multiplicative.**
   `surcharge = round2(B * pct/100)` then `gross = round2(B + surcharge)`.
   `gross = round2(B * (1 + pct/100))` differs by 0.01 on 454 of 400,000 tested pairs.
5. **`pyra_stripe_payments.amount` stays the BASE**, matching `create-checkout:167`, so the
   reconcile cron's arithmetic stays consistent.
6. **`surcharge_amount` goes in SESSION metadata** — both readers
   (`webhook:206`, `stripe-reconcile:123`) read `session.metadata`, not intent metadata.

## Global constraints

- React Query in components (no raw fetch) · `apiSuccess`/`apiError` ·
  `requireApiPermission('finance.manage')` · `logActivity` · RTL logical properties ·
  dark-mode pairs · i18n in `messages/{ar,en}/finance.json` · `pnpm i18n:check` gates it.
- `pyra_payments` is the only money ledger. Derived counters re-summed, never incremented.
- Ids are `varchar(20)` — always `generateId(prefix)`, never hand-built strings.
- Surcharge percent is validated server-side to 0–10 with 2dp, and the per-link override is
  accepted **only** on the `finance.manage` dashboard route — never on the portal route,
  where a client-supplied percent would be trivially abusable.

---

## Task 1 — Migration 057: surcharge settings

`supabase/migrations/057_stripe_surcharge_settings.sql`

```sql
INSERT INTO pyra_settings (key, value)
VALUES ('stripe_surcharge_enabled', 'false'),
       ('stripe_surcharge_percent', '3.5')
ON CONFLICT (key) DO NOTHING;
```

Default OFF, matching the Phase 11 `is_active` lock — surcharging is a business decision
the owner must confirm with his acquirer, so code must not switch it on by itself.

## Task 2 — `lib/stripe/surcharge.ts` + `parseSettingNumber`

- `calcSurcharge(base, pct) => { surcharge, gross }` — additive, round2, pct<=0 ⇒ 0.
- `getSurchargePercent(supabase)` — reads both keys via `lib/settings/parse.ts`; returns 0
  unless enabled **and** finite **and** `0 < pct <= MAX_SURCHARGE_PERCENT (10)`.
  **Fails to zero**: a misconfiguration makes us absorb the fee, never overcharge a client.
- `parseSettingNumber(value, fallback)` added to `lib/settings/parse.ts`.
- Unit tests pinning: 700@4→28/728 · 5000@3.5→175/5175 · 333.33@3.5→11.67/345.00 ·
  additive ≠ multiplicative on a known-divergent pair.

## Task 3 — `POST /api/finance/quick-payment-link`

Gate `finance.manage`. Body: `{ name, amount, currency?, description?, email?, phone?, surcharge_percent? }`.

Sequence, with compensation at every step (there is no DB transaction wrapper —
the codebase uses backup-rollback; `POST /api/invoices:329-334` is the precedent):

1. Resolve client: if `email` given → reuse an existing client with that lowercased email,
   else create. If no email → mint `qp-<nanoid>@placeholder.invalid`, which is unique by
   construction (the existing `{slug}@placeholder.invalid` convention **collides** on the
   second walk-in of the same name). `password_hash: 'no_portal_access'`,
   `portal_active: false`.
2. Create invoice as `SENT`, total = base, `amount_due` = base. Surcharge is NOT on the
   invoice (owner's locked decision).
3. Create the line item.
4. Mint a `pyra_document_links` row. Note `idx_document_links_one_live` is UNIQUE on
   `(entity_type, entity_id) WHERE revoked_at IS NULL` — use revoke-then-insert, the same
   pattern as the quote link route.
5. Create the Stripe session: line 1 = base, line 2 = surcharge (only if > 0, so the payer
   sees it before committing); `metadata.surcharge_amount` = the surcharge in major units;
   `metadata.invoice_id` / `client_id`; `success_url` = `/d/<token>?paid=1&session_id=…`;
   `cancel_url` = `/d/<token>`.
6. Insert `pyra_stripe_payments` with `amount` = **base**, and record the applied percent in
   its `metadata` so "which rate did we charge" is recoverable per payment.

On failure at any step, delete what this request created (invoice delete cascades its
items; there is **no** FK from `pyra_invoices.client_id`, so an orphaned invoice would be
silent — clean up explicitly).

Returns `{ public_url, checkout_url, invoice_number, base, surcharge, gross }`.

## Task 4 — Public invoice view at `/d/[token]`

- `lib/invoices/public-payload.ts` — `PUBLIC_INVOICE_FIELDS` **allowlist** mirroring
  `lib/quotes/public-payload.ts`, with a unit test pinning the key set so a future
  `select('*')` fails CI. **`bank_details` deliberately excluded** (same D-1 reasoning as
  quotes: an IBAN on a forwardable link is an invoice-fraud kit). Also excluded: internal
  notes, client contact details, ids.
- `app/d/[token]/page.tsx` branches on `entity_type`; a quote token must never render an
  invoice payload or vice versa. Keep all five security properties of the quote path.
- **Handle the webhook race honestly.** Stripe redirects in well under a second, often
  before `settleInvoicePayment` runs. On `?paid=1`, look up `pyra_stripe_payments` by
  `stripe_session_id`; if still `pending`, render «تم استلام دفعتك — جاري التأكيد».
  **Never** treat `?paid=1` as proof of payment — it is attacker-controlled.

## Task 5 — `QuickPaymentDialog` + hook + toolbar button

- `components/finance/QuickPaymentDialog.tsx`, two-phase (form → result, does not close on
  success). Form half follows `ManualDeductionDialog.tsx`; result half follows
  `PublicLinkDialog.tsx:115-130` (readonly `dir="ltr" font-mono` input + copy button).
- Visible: name, amount, currency, editable surcharge % with live base/surcharge/total.
  Description/email/phone behind a «تفاصيل إضافية» toggle.
- `useQuickPaymentLink()` in `hooks/useInvoices.ts`; invalidates `['invoices']` + `['clients']`.
- Trigger in the invoices toolbar beside «فاتورة جديدة», gated on `finance.manage`.
- Share actions: Copy · Open · WhatsApp. `whatsAppHref` returns null without a phone
  (`lib/utils/whatsapp.ts:26-28`) — add a no-recipient branch or the button silently dies.
- i18n under `finance.invoices.quickPay`, AR first then EN.

## Task 6 — Refund over-booking guard

A full refund books `charge.amount_refunded` (the **gross**, 728) as a negative payment
against a ledger that only received the **base** (700), leaving the ledger 28 short.
Cap the negative payment at the sum already booked for that payment intent.

---

## Deliberately out of scope for v1

- Command-palette / dashboard-home entry points — both use a `?action=` convention that
  **no page reads**; copying it would ship dead code.
- Emailing the link automatically — the client-facing-automation lock stands. A manual
  share button the owner clicks is a different thing and is in scope.
- Dunning interaction: `dunning_enabled` does not exist as a key, so reminders are inert
  today — but overdue-marking runs regardless, so quick-link invoices WILL become overdue
  and would enter the mailing set if dunning is ever switched on. Placeholder `.invalid`
  addresses would then hard-bounce and damage SMTP reputation. Revisit before enabling it.
