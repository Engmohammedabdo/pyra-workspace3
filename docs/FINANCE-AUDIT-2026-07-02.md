# Finance Module Audit — 2026-07-02

**Method:** 6 parallel domain auditors (invoices/payments/Stripe · contracts/recurring/subscriptions · expenses/CN/PO/reports · dashboard UI/hooks · portal/external · docs sweep) + live-DB integrity forensics (20 SQL checks) + n8n cron inventory + **12-finding adversarial verification pass** (all 12 CONFIRMED; severities refined).
**Scope:** everything reachable from `/dashboard/finance`, `/dashboard/invoices`, `/dashboard/quotes`, portal finance surfaces, `/api/finance/**`, `/api/invoices/**`, `/api/quotes/**`, `/api/dashboard/{credit-notes,purchase-orders,suppliers}/**`, `/api/stripe/**`, `/api/portal/**` (finance), `/api/external/**` (finance).
**Status column:** ✅ = adversarially verified or verified against live DB; ◐ = single-auditor finding (code-cited, not re-verified).

> Follow-up remediation tracking should layer an **Implementation Status** delta table at the top of this doc (security-audit precedent). Findings below are a point-in-time record — do not edit them.

---

## 0. Executive summary

The **transactional core is healthy**: invoice⇄payment math balances 100% in production (paid+due=total, payment sums match, credit-note negative-payment pattern intact), auth gates + gate-then-service-role hold everywhere, `.or()` injection hygiene is clean, and cash-basis revenue (payments-based) is respected across all reports.

The damage concentrates in four bands:

1. **Contract billing lifecycle** — `amount_billed` only ever increments; deletes/edits never adjust it. Production proof: retainer contract shows 143,000 billed vs 46,000 real (forensically reconstructed to the dirham: 39k+39k+39k+13k+13k with 2 deletions and 1 edit never subtracted). No duplicate-period guard on retainer generation.
2. **Automation is fiction** — 6 finance "cron" endpoints exist (recurring generate, subscription renewals, overdue check, payment reminders, contract alerts, quote expiry) but **zero are wired to any scheduler**, and 3 of them are session-gated so n8n *cannot* call them. Production proof: 4 active subscriptions stuck with renewal dates from Feb/Apr; recurring-invoices table empty despite an active retainer contract.
3. **Refund/credit correctness** — Stripe refund handler books the *cumulative* refunded amount per event with no idempotency; VAT report `Math.abs()`es negative payments (refunds *increase* reported VAT); credit-note status machine allows applied→draft→re-apply (double refund); portal statement double-counts every Stripe payment.
4. **Client-facing silent breakage** — portal recurring page dead (queries non-existent columns), portal dashboard financial summary always zeros (non-existent column), quote-sign in-app notification silently fails every time (non-existent column), invoices list pagination dead (>20 unreachable), finance-home renewal approve/reject buttons are `console.log` stubs.

Counts: **1 latent-P0, ~18 P1, ~30 P2, ~25 P3** + 8 operational/data-repair items + 9 documentation drifts.

---

## 1. Live production data findings (DB forensics, 2026-07-02)

| # | Finding | Evidence | Action needed |
|---|---|---|---|
| D1 ✅ | **`ctr_KTynoYtwhjkMYatq` (Etmam SMM retainer): `amount_billed`=143,000 vs 46,000 real invoices** | Activity log reconstructs exactly: INV-0005 gen @39k (later edited to 20k, −19k never applied) + INV-0013 gen @39k ×2 (both deleted, −78k never applied) + INV-0013 @13k + INV-0017 @13k | Data repair: set `amount_billed`=46,000 after code fix (recompute-from-invoices) |
| D2 ✅ | **`ctr_bP3VR8hWEbkPhHuL` (Etmam Brand Identity): billed/collected=4,000 with ZERO linked invoices** | No invoice has this `contract_id`; INV-0002/0004 (4,000 paid each) exist unlinked for same client | Decide: link the right invoice (`contract_id`) or accept manual figures |
| D3 ✅ | **4 active subscriptions with `next_renewal_date` in the past** (Google Cloud 2026-02-28, Freedom Live 2026-02-28, ElevenLabs 2026-04-26, Claude Max 2026-04-30) | `check-renewals` has no caller (see §2) | Wire cron + data repair renewal dates + backfill missed expense rows if desired |
| D4 ✅ | **`pyra_recurring_invoices` is EMPTY** despite active retainer contract | Retainer sync creates recurring row only on PATCH-activate path, contract predates it; invoices generated manually | Create the recurring row (or via contract edit) once cron exists |
| D5 ✅ | **QT-0002 signed (5,250 AED, 2026-02-15) never converted to invoice** | signed quote, no `pyra_invoices.quote_id` match | Operational follow-up |
| D6 ✅ | **`vat_rate` setting = `0`** (UAE VAT is 5%) | `pyra_settings.vat_rate='0'`; all 3 contracts `vat_rate=0`; all invoices `tax_amount` reflect whatever was set per-invoice | User decision: is 0 intentional (below registration threshold?) |
| D7 ✅ | **`smtp_allow_insecure` still `true`** | documented temporary compromise (cert expired 2026-06-03) | Renew cert → flip false (existing backlog) |
| D8 ✅ | **Dead tables:** `pyra_revenue_targets` 0 rows, `pyra_cards` 0 rows, `pyra_purchase_orders` 0 rows | full pages + APIs exist for each | User decision: activate or remove surfaces |
| D9 ✅ | **Real multi-currency exists in expenses (AED+USD) and subscriptions (AED+USD)** — invoices/quotes/contracts all-AED today | overview counts | Makes §5 currency findings *live* for expenses, *latent* for revenue |
| D10 ✅ | Payments ledger internally consistent: 20 payments = 82,815.75 = paid invoices (69,815.75) + partial (13,000); zero orphans, zero drift, credit note correctly mirrored | integrity checks 1–7 all clean | — |

Reference figures (2026-07-02): invoices 23 (16 paid / 6 draft / 1 overdue), quotes 26, expenses 43 (all `approved`), contracts 3, credit notes 1 (applied), suppliers 12, business entities 2, payroll-bridge expenses 2 (3,000).

---

## 2. Automation gap — finance crons (✅ verified in n8n)

The ONLY scheduled workflow is **PyraCRM_Cron** (`Z54Xnd2z6QpT0oIJ`): follow-up-reminders (5-min) + lead-idle-check (daily). **No finance endpoint is called by anything.**

| Endpoint | Purpose | Auth today | n8n-callable? | Caller today |
|---|---|---|---|---|
| `POST /api/finance/recurring-invoices/generate` | Retainer/recurring invoice emission | `finance.manage` session | ❌ (session+CSRF) | Manual button on `/dashboard/finance/recurring` only |
| `POST /api/finance/subscriptions/check-renewals` | Renewal approvals/expiry/reminders | `finance.manage` session | ❌ | **None** (unreachable in practice) |
| `POST /api/invoices/check-overdue` | Flip sent/partial → overdue | `invoices.edit` session | ❌ | Dashboard UI trigger only |
| `POST /api/finance/invoices/send-reminders` | Payment reminders + late penalties | `finance.manage` session | ❌ | **None** (orphan; ⚠ see F-REM) |
| `POST /api/finance/contracts/check-alerts` | Contract expiry/overdue alerts | `finance.manage` session | ❌ | **None** (orphan) |
| `POST /api/quotes/check-expired` | Expire stale quotes | (check) | ❌ | **None found** |

Contract PATCH code comments assume "the cron would keep emitting invoices" — the cron does not exist. **Remediation shape (locked Phase D §7 pattern):** add `getExternalAuth` + `cron.<name>` permission paths to these routes, then a `PyraFinance_Cron` n8n workflow (separate from PyraCRM_Cron, same Integration API key).

---

## 3. Verified critical bugs (adversarial pass — all CONFIRMED)

| ID | Sev | Defect (corrected statement) | Where |
|---|---|---|---|
| F-REM ✅ | **P1 latent-P0** | send-reminders: all dedup-guard writes are inert `void supabase` lazy-thenables → guards always empty → **re-emails every overdue client every run; with `late_penalty_rate>0` re-applies penalty compounding `total`/`amount_due` each invocation** + wholesale-overwrites invoice `notes`. Orphan route today; becomes P0 the moment it's wired to cron/UI. | `app/api/finance/invoices/send-reminders/route.ts:83-166,225` |
| F-STRIPE-REF ✅ | P1 | `charge.refunded` books **cumulative** `amount_refunded` as a fresh negative payment per event, no idempotency (reference not refund-keyed); partial refunds double-count, replays duplicate. `charge.dispute.closed` same replay hole. | `app/api/stripe/webhook/route.ts:314,334-343,511-520` |
| F-INV-MASS ✅ | P1 | Invoice PATCH mass-assignment: body keys spread straight into UPDATE — `amount_paid`, `amount_due`, `total`, `currency`, **`client_id` (out-of-scope reassignment)**, `invoice_number`, `created_by` all writable with `invoices.edit`. Only `status` validated. | `app/api/invoices/[id]/route.ts:193-199,285-290` |
| F-BILLED ✅ | P1 | `amount_billed` increments on generate (retainer/milestone/manual link) but **no code path ever decrements** on invoice delete or total edit; retainer generate has **no duplicate-period guard** and read-modify-write races. Systemic across 3 routes. Production drift D1 is this bug. | `contracts/[id]/generate-invoice`, `app/api/invoices/route.ts:333-345`, `invoices/[id]/route.ts` DELETE/PATCH |
| F-CN-GUARD ✅ | P1 | Credit-note PATCH validates target status only, never current: applied→draft→re-apply = **double refund**; applied→draft→DELETE = orphaned negative payment. | `app/api/dashboard/credit-notes/[id]/route.ts:61-70,113` + `apply/route.ts:31-33` |
| F-VAT-ABS ✅ | P1 | VAT report `Math.abs(amount)` — refunds/credit notes **increase** reported VAT-collected (FTA over-reporting). Reachable via Stripe refunds and partial CNs. | `app/api/finance/reports/vat/route.ts:92` |
| F-STMT-DBL ✅ | P1 | Portal statement dedupes stripe rows on `method==='stripe'` but webhook writes `method:'online'` (no code writes 'stripe') → **every Stripe payment appears twice**, running balance double-credits; `pyra_stripe_payments` ignores from/to filters. | `app/api/portal/statement/route.ts:60-65,118-123` vs `webhook/route.ts:99` |
| F-PAGINATION ✅ | P1 | Invoices list: `setTotal` never called → `totalPages=0` → pagination never renders while API caps 20/page — **invoices beyond newest 20 unreachable** from list. | `app/dashboard/invoices/invoices-client.tsx:108,178,453` |
| F-CASHFLOW ✅ | P1 | Cashflow report selects non-existent `pyra_expenses.category` → **500 on every request** (verified live: column is `category_id`). | `app/api/finance/reports/cashflow/route.ts:74-80,144-148` |
| F-PORTAL-REC ✅ | P1 | Portal recurring endpoint selects non-existent `start_date,end_date,total` → 42703 → **client page silently empty forever** (hook defaults `[]`). | `app/api/portal/recurring-invoices/route.ts:20` |
| F-PORTAL-DASH ✅ | P1 | Portal dashboard financial summary selects non-existent `total_amount` (real: `total`), error unchecked → **always zeros**; also checks invalid status `'pending'`. | `app/api/portal/dashboard/route.ts:128-148` |
| F-SIGN-NOTIF ✅ | P1 | Quote-sign inserts notification with non-existent `link` column (real: `target_path`), error unswallowed-unchecked → **sales agent never gets the signed-quote bell**, every time. Direct-insert violation of `notify()` rule. | `app/api/portal/quotes/[id]/sign/route.ts:110-117` |
| F-ADMIN-GHOST ✅ | P1 | Stripe webhook dispute/failure alerts + check-renewals notifications hardcode `recipient_username:'admin'` — **no user named `admin` exists** (verified) → chargebacks/dispute deadlines invisible. (check-renewals inserts additionally never execute — see F-SUBS-VOID.) | `webhook/route.ts:442-452,552-563,621-632`; `check-renewals/route.ts:53,86,124` |
| F-SUBS-VOID ✅ | P1 | check-renewals: all 3 notification inserts are inert `void` builders (never execute) + counters lie; approve-renewal: expense insert + date-advance errors unchecked (failure = period silently skipped, success claimed); reject-renewal: notification+audit inert AND **no UI caller** (unreachable). | `subscriptions/check-renewals`, `[id]/approve-renewal/route.ts:63-87`, `[id]/reject-renewal/route.ts:44,56` |
| F-SCOPE-NAN ✅ | P2 (P1 when non-admin finance role lands) | Contract scope checks do `clientIds.includes(Number('cl_…'))` = `includes(NaN)` → deny-all for non-admin on detail/PATCH/DELETE/billing-history/items (NULL-client contracts bypass entirely). Root cause is the documented `c_`/`cl_` namespace mismatch — fixing `Number()` alone won't restore access. | 6 sites: `contracts/[id]/route.ts:49,107,318`, `contracts/route.ts:114`, `billing-history:33`, `items:42` |
| F-REV-SUM ✅ | P2 | revenue-summary: payments unscoped for non-admins (invoices ARE scoped), summed across currencies, UTC month. Latent (finance.view admin-only today, all-AED). | `app/api/invoices/revenue-summary/route.ts:35-48` |
| F-REC-VAT ✅ | P2 | Recurring generator uses global `vat_rate` only, never contract's — manual path honors contract (incl. explicit 0) → same contract, two totals. Latent (both 0 today). `\|\| '5'` fallback does NOT misfire on '0' (refuted sub-claim). | `recurring-invoices/generate/route.ts:92,202` vs `contracts/[id]/generate-invoice/route.ts:89` |
| F-PI-META ✅ | P2 | Neither checkout route sets `payment_intent_data.metadata` → payment_failed handler reads undefined → client failure notifications dead, admin loses deep-link, `stripe_payments` failed-status update no-op. 1-line fix per route. | `create-checkout/route.ts:131-136`, `portal/invoices/[id]/pay/route.ts:106-110`, `webhook:586-618` |

---

## 4. Additional findings by area (single-auditor, code-cited)

### 4.1 Invoices / payments / Stripe (`app/api/invoices/**`, `app/api/stripe/**`)

- ◐ P1 **Payment insert succeeds but invoice recompute failure swallowed** — 201 returned with numbers never persisted; no rollback/logError (self-heals on next payment only). `invoices/[id]/payments/route.ts:111-121,270-274`
- ◐ P2 PATCH items delete-then-insert without backup-rollback → item-less invoice with stale totals on insert failure. `[id]/route.ts:234-251`
- ◐ P2 Editing overdue partially-paid invoice can drive `amount_due` negative (no clamp) and never recomputes status. `[id]/route.ts:188,269-279`
- ◐ P2 Overpayment gate race: two concurrent payments both pass `amount <= amount_due` check; clamp hides overage. `payments/route.ts:64-70`
- ◐ P2 from-quote conversion drops `entity_id`, `license_no`, `display_client_name`, resolved `project_id`; quote-status flip failure only console-logged. `from-quote/[quoteId]/route.ts:83-115`
- ◐ P2 No `logError` in ANY `app/api/invoices/**` catch (7 files, money-mutation class). Hardcoded statuses (webhook, from-quote, editable-list). UTC-day for `payment_date` defaults + check-overdue + issue/due derivation.
- ◐ P3 POST stores unrounded floats; PATCH ignores discount-field-only changes; commission logic duplicated ×2, hardcodes AED, never reversed on refund; `'SAR'` fallback in webhook client notification; checkout stale-session overpayment window; unbounded in-memory rate-limit Map; activity inserts direct + non-constant action_types; invoice-number generation O(n) + unique-collision not retried.
- Note: **payments are append-only** (no update/delete endpoint) — corrections only via credit note / refund. Intentional? confirm.

### 4.2 Contracts / recurring / subscriptions (`app/api/finance/**`)

- ◐ P2 Retainer sync clobbers multi-item recurring templates to a single item on retainer-field edit. `contracts/[id]/route.ts:260-268`
- ◐ P2 `maybeSingle()` on recurring-by-contract breaks with ≥2 rows (POST allows duplicates) → sync skips AND activation creates ANOTHER template → parallel generators. `contracts/[id]/route.ts:157-161,243-247`
- ◐ P2 Contract currency edits never sync to recurring template. `contracts/[id]/route.ts:133-136,254-274`
- ◐ P2 Recurring generate: items-insert error ignored (no rollback), `next_generation_date` advance unchecked (fail = duplicate next run), no concurrency guard. `generate/route.ts:231,249-256`
- ◐ P2 Milestone generate: item-failure → item-less invoice, milestone-update failure → re-click double invoice; no active-contract check. `milestones/[milestoneId]/generate-invoice/route.ts:185-227`
- ◐ P2 Raw-body `.update(body)` mass assignment on recurring PATCH + subscriptions PATCH. `recurring-invoices/[id]/route.ts:72-80`, `subscriptions/[id]/route.ts:43-51`
- ◐ P2 check-alerts: no dedup, alerts only to caller, direct notification inserts, counts drafts as overdue. Contract DELETE ignores children (recurring/milestones) → FK 500 or orphaned active generator.
- ◐ P2 Milestone PATCH bypasses POST invariants (%≤100, amount recompute, editable-after-invoiced, status hand-settable to 'invoiced'). `milestones/[milestoneId]/route.ts:46-51`
- ◐ P2 Subscriptions `monthly_total` computed from current page only. `subscriptions/route.ts:56-62`
- ◐ P3 Dubai-day violations throughout; day-of-month drift (31→28 forever); `'paused'` status not in constants (wrong domain); milestone statuses have NO constants; `auto_send` marks SENT without sending; NaN percentage passes validation; 0-amount milestone invoice allowed.

### 4.3 Expenses / credit notes / POs / reports

- ◐ P1 **Expense `status` never filtered in ANY aggregate** — pending/rejected expenses count in P&L, VAT input, cashflow, dashboard, profitability, budget alerts, supplier totals. Latent-ish (all 43 approved today) but create-path writes `pending` when approval setting on. 8 sites listed in agent report.
- ◐ P2 Expenses list summary ignores the `status` filter the list applies (`route.ts:118-127`). Approved expenses editable (amount/vat) without re-approval (`[id]/route.ts:135-158`).
- ◐ P2 Category PATCH allowlists phantom `name_en` (real: `name_ar`) → Arabic label uneditable, 42703→404. `categories/[id]/route.ts:9` (✅ column verified)
- ◐ P2 Mass assignment `update(body)` on cards + revenue-targets PATCH. CN/PO number generation race (no unique-constraint retry). CN currency hardcoded 'AED' + apply never checks invoice currency. Client statement (dashboard) counts DRAFTS as outstanding/overdue + no per-client scope restriction. External expense creation bypasses approval workflow (DB default 'approved'). PO create accepts dangling supplier_id.
- ◐ P2 Currency: dashboard revenue/outstanding, cashflow inflows, profitability revenue, revenue-targets actuals, statement summaries — all raw sums (only P&L does invoice→currency→`toAED` correctly — use as reference impl). Supplier expense "total" = latest-50-rows mixed-currency sum.
- ◐ P3 finance/alerts logs an activity row per READ; wrong HTTP codes (404-for-422, 500-for-business-rule); `logError` absent module-wide; draft CN applicable directly (skips issued); PO/supplier audit-trail inserts inert (`void` — 6 sites, verified pattern).

### 4.4 Dashboard UI / hooks

- ✅ P1 Invoices pagination dead (F-PAGINATION). ◐ P1 finance-home renewal approve/reject = `console.log` stubs (`app/dashboard/finance/page.tsx:45`). ◐ P1 invoice edit success-toast on failed save (`invoices/[id]/page.tsx:110-126`). ◐ P1 contract milestone/invoice actions fail silently — no res.ok check, no toasts (`finance/contracts/[id]/page.tsx:151-195`). ◐ P1 stale-cache-after-write: RQ reads + raw-fetch writes with no invalidation (expenses/[id], subscriptions/[id], all 7 new/ pages).
- ◐ P2 Raw fetch + useState-as-cache across ~20 finance pages (full list in agent report) while a **complete unused hook layer exists** (`useContracts`, `useCreditNotes`, `usePurchaseOrders`, `useSuppliers`, most of `useExpenses`/`useSubscriptions`/`useInvoices` mutations — all written, zero consumers). Dead `useQuotes`/`useQuote`/`useCreateQuote` point at non-existent `/api/dashboard/quotes` (✅ verified 404).
- ◐ P2 Server `requirePermission` missing on 28/33 finance pages; `usePermission` action-gating: **zero** occurrences in `app/dashboard/finance/**` (invoices/quotes lists do it right).
- ◐ P2 Inline status maps duplicating `lib/constants/statuses.ts` (contracts, CNs, POs, quote-analytics). Page-size offenders: QuoteBuilder 899 lines, invoices-client 501, invoice detail 413, quotes-client 387, expenses-client 382, contracts-client 304.
- ◐ P2 `/dashboard/finance/expenses/categories` has NO sidebar/in-app link (guide-only orphan).
- ◐ P3 Dark-mode pairs missing (6 sites); chart tooltips hardcode "AED"; RTL chevrons pre-compensated instead of `rtl:rotate-180` (3 sites); misc dead code.
- ✅ Clean: RTL logical-properties sweep, EmptyState/Skeleton coverage, sidebar+module-guide coverage (12 finance items), per-row currency display, no `.data.data` double-unwraps.

### 4.5 Portal / external API

- ✅ P0-class: NONE — no IDOR/cross-client leak found; all portal endpoints scope by session `client_id`; pay flow amount 100% server-derived; external auth is textbook Phase D.
- ✅ P1: F-PORTAL-REC, F-PORTAL-DASH, F-STMT-DBL, F-SIGN-NOTIF (above).
- ◐ P1 External quotes PATCH accepts ANY status string (incl. `signed` with no signature evidence) gated only by `quotes:create`. `external/quotes/[id]/route.ts:74`
- ◐ P2 `pending_approval` quotes visible to clients (only `draft` excluded) with raw-English badge. External quotes GET logs fake `external_quote_created` on every poll. Portal pay: no rate limit + `Date.now()` idempotency key → concurrent tabs = double full payment (needs refund to unwind). Quote sign: read-then-write race (no conditional update) + unbounded `signature_data`. Raw fetch across portal invoices/quotes/statement pages (no `usePortalInvoices`/`usePortalQuotes`/`usePortalStatement` hooks exist). External invoice items accept negative/NaN quantity/rate; unverified `client_id` insert.
- ◐ P3 UTC-day expiry check on sign; `'SAR'` fallback; statement labels raw English (`online`, `credit_note`) + confusing negative-credit presentation; session `last_activity` never refreshed; pay-success page asserts success without verifying; `'expired'` dead branch; STATUS_MAP gaps.
- **Parity gaps:** credit notes have NO portal surface (client sees cryptic ledger row only); early-payment discount never applied/surfaced in pay flow; recurring effectively missing (broken).

### 4.6 Quotes surface (dashboard)

Covered pieces: dead hooks (✅), QuoteBuilder size, quotes-client raw fetch, analytics clean (4× useQuery ✓), `quotes.delete_own`/flip-and-warn/three-way-scope all working as locked. Open documented items: #8 dedicated `quotes.send` perm, #9 edit-page read-only gating for agents, #10 delivery-receipt UX, agent read-only quote view, `c_`/`cl_` namespace fix.

---

## 5. Cross-cutting themes

1. **`void supabase` inert-thenable epidemic** — send-reminders (5 sites, breaks its own dedup), check-renewals (3), reject-renewal (2), approve-renewal (1), PO/supplier audit logs (6). Grep smell: `void supabase` not followed by `.then(`.
2. **Currency discipline** — reference implementation is `reports/pnl` (invoice→currency map→`toAED`). Violators: revenue-summary, finance/dashboard revenue+outstanding, cashflow, both profitability reports, revenue-targets, client statements ×2, supplier totals, CN create ('AED' hardcode), commissions ('AED' hardcode). `pyra_payments` has NO currency column — every payment sum needs an invoice join. Multi-currency is LIVE in expenses/subscriptions today.
3. **Mass assignment** — invoices PATCH (✅P1), recurring PATCH, subscriptions PATCH, cards PATCH, revenue-targets PATCH. Whitelist pattern exists next door (expenses, contracts, suppliers).
4. **Dubai-day rule** ignored across finance (`dubaiDayKey` locked since Phase 15.1): payment_date/expense_date stamping, check-overdue, all report boundaries, quote expiry, subscription/recurring schedule math.
5. **`logError` absent** from effectively every finance catch block (Phase 14.1 targets exactly this class).
6. **Activity-log discipline** — direct inserts + ad-hoc action_type strings module-wide (known backlog; keeps accreting).
7. **No-transaction partial writes** — backup-rollback applied on some creates (invoice POST, CN create, PO create, contract items PUT) but missing on invoice PATCH items, recurring generate, milestone generate, approve-renewal.
8. **Scoping architecture debt** — `c_`/`cl_` namespace mismatch (root), `Number()` coercion, `UserScope.clientIds: number[]` type lie, inconsistent scoping (some routes scoped, reports/CN/PO/suppliers/cards/targets company-wide), all latent while finance perms are admin-only.

---

## 6. URL / endpoint map (the finance surface)

### Dashboard pages
| URL | Purpose | Server gate |
|---|---|---|
| `/dashboard/finance` | Finance home (KPIs, charts, renewals widget) | none ⚠ |
| `/dashboard/finance/expenses` (+`/new`, `/[id]`, `/categories`) | Expenses + approval + categories | `finance.view` (list only) |
| `/dashboard/finance/contracts` (+`/new`, `/[id]`) | Contracts + milestones + retainer billing | `finance.view` (list only) |
| `/dashboard/finance/credit-notes` (+`/new`, `/[id]`) | Credit notes | none ⚠ |
| `/dashboard/finance/purchase-orders` (+`/new`, `/[id]`) | POs (0 rows in prod) | none ⚠ |
| `/dashboard/finance/suppliers` (+`/new`, `/[id]`) | Suppliers | none ⚠ |
| `/dashboard/finance/recurring` (+`/new`) | Recurring invoices + manual generate | none ⚠ |
| `/dashboard/finance/subscriptions` (+`/new`, `/[id]`) | Subscriptions + renewal approve | none ⚠ |
| `/dashboard/finance/cards` | Payment cards (0 rows) | none ⚠ |
| `/dashboard/finance/targets` | Revenue targets (0 rows) | none ⚠ |
| `/dashboard/finance/reports` | P&L / VAT / profitability tabs | none ⚠ |
| `/dashboard/finance/client-statement/[clientId]` | Client statement | none ⚠ |
| `/dashboard/invoices` (+`/new`, `/[id]`) | Invoices + payments + Stripe link | `invoices.view` (list only) |
| `/dashboard/quotes` (+`/new`, `/[id]`, `/analytics`) | Quotes + builder + analytics | `quotes.view` |

### Portal pages (client)
`/portal/invoices` (+detail+pay) · `/portal/quotes` (+sign) · `/portal/statement` · `/portal/contracts` (+detail) · `/portal/recurring` (broken F-PORTAL-REC) · dashboard financial card (broken F-PORTAL-DASH)

### API groups
`/api/invoices/**` (7 routes) · `/api/quotes/**` (+templates, duplicate, revise, check-expired, send) · `/api/finance/**` (36 routes: contracts×8, recurring×3, subscriptions×5, expenses×4, cards×2, targets×2, reports×6, dashboard, alerts, client-statement, send-reminders, check-alerts) · `/api/dashboard/{credit-notes×3, purchase-orders×2, suppliers×3}` · `/api/stripe/{create-checkout, webhook}` · `/api/portal/{invoices×3, quotes×3, statement, recurring-invoices, contracts×2, dashboard}` · `/api/external/{invoices×2, quotes×2, subscriptions, expenses×2, alerts, status}`

---

## 7. Documented open items feeding this domain (docs sweep)

Full table in the docs-agent report; highlights that intersect this audit:
`c_`/`cl_` namespace (root of F-SCOPE-NAN/F-REV-SUM scoping debt) · SMTP cert + `smtp_allow_insecure` · Stripe key rotation (precautionary) · `mailer.ts` cache-key missing `smtp_pass` · Gap #3 Phase 2 FULL (invoices/quotes/expenses still `authenticated`-readable to logged-in users) · Phase 3b bucket privacy + **WhatsApp send-pdf targets non-existent `files` bucket (likely broken)** · dead `useQuotes` hooks · entity-logo PDF bloat · payroll earned-month attribution · portal residual gaps (PORTAL-GAPS.md stale) · Coolify backup encryption UNKNOWN.

### Documentation drift (fix-the-docs list)
1. `DATABASE-SCHEMA.md`: `pyra_quotes` badly stale (SAR default, missing lead_id/discount/entity/status-union); `pyra_payroll_runs` unique missing currency; `pyra_payroll_items` missing currency; **`pyra_business_entities` absent entirely**; `pyra_sales_follow_ups` missing migration-013 columns; `pyra_invoices` missing `business_entity_id` note.
2. `docs/ARCHITECTURE.md`: says Vercel (is Coolify), "29 tables" (~110-125), "RLS enabled on all" (contradicted by Gap #3).
3. `docs/CRM-AUDIT-2026-07-02.md`: no Implementation-Status delta layer (fixes shipped but doc reads open).
4. `docs/PORTAL-GAPS.md`: Phase-1 items shipped but doc never updated.
5. `SYSTEM-STRUCTURE.md`: exchange rates missing EGP; evaluation-bonus rule stale; RBAC counts stale (`employee_payments.*` removed).
6. `ROADMAP.md §3.8` superseded (server quote PDF).

---

## 8. Proposed remediation roadmap (draft — pending user decisions)

**Batch 0 — decisions (see chat):** VAT rate · cron architecture · late-penalty feature fate · dead modules (cards/targets/POs) · portal credit-notes parity · accountant-role timeline (drives scoping priority) · data repairs approval.

**Batch 1 — money integrity (P1 core):** F-BILLED (recompute-from-invoices pattern + duplicate-period guard + data repair D1/D2) · F-REM (await inserts + column-based dedup, or delete route) · F-STRIPE-REF + F-PI-META (+ notify() with real admins, F-ADMIN-GHOST) · F-INV-MASS whitelist · payment-recompute error handling · F-CN-GUARD transition map + atomic apply · F-VAT-ABS · F-CASHFLOW · expense-status filter in aggregates.

**Batch 2 — portal client-facing:** F-PORTAL-REC · F-PORTAL-DASH · F-STMT-DBL · F-SIGN-NOTIF · pending_approval hide · sign race/conditional update · pay rate-limit · external quotes status whitelist.

**Batch 3 — automation:** cron-auth paths (Phase D §7) on 6 endpoints + PyraFinance_Cron n8n workflow + subscription date repairs + recurring row for retainer contract + retainer generate duplicate guard interplay.

**Batch 4 — multi-currency correctness:** replicate P&L pattern (or per-currency maps) across revenue-summary/dashboard/cashflow/profitability/targets/statements/supplier totals; CN currency; commission currency.

**Batch 5 — RBAC/scoping:** decide `c_`/`cl_` unification; fix Number() sites; consistent scope policy per route class; page gates (28 pages) + `usePermission` action gating.

**Batch 6 — UI/RQ migration:** adopt the existing unused hook layer across ~20 raw-fetch pages; pagination fix; finance-home widget wiring; false-success toasts; invalidations; dead-hook removal; status-label constants; component splits.

**Batch 7 — hygiene & docs:** `void supabase` sweep · `logError` coverage · `logActivity` constants · `dubaiDayKey` sweep · mass-assignment whitelists (4 remaining PATCHes) · number-generation uniqueness · docs drift fixes (§7).
