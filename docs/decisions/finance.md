# Finance — Locked Decisions Archive

Invoices, payments, contracts, recurring billing, quotes, and the cash-basis accounting doctrine.

> **Archive of locked decisions.** These were settled after audit → design → implementation → review, and are recorded so they are **not re-litigated**.
> `CLAUDE.md` carries a one-line index of everything here; open this file when the index says a decision touches what you are about to change.

## Contents

- [Finance Remediation — Locked Decisions (2026-07-03)](#finance-remediation-locked-decisions-2026-07-03)
- [Quote System + Gap #5 — Locked Decisions (2026-06-19)](#quote-system-gap-5-locked-decisions-2026-06-19)
- [Public Quote Signing — Locked Decisions (2026-07-27)](#public-quote-signing-locked-decisions-2026-07-27)

---

## Finance Remediation — Locked Decisions (2026-07-03)

Closure of the finance-audit remediation (audit: `docs/FINANCE-AUDIT-2026-07-02.md`
— point-in-time findings + Implementation Status delta table at its top; 7 batches,
each independently reviewed/built/shipped). **Do NOT re-litigate.**

### 1. Derived counters, never increments — `amount_billed` pattern
`pyra_contracts.amount_billed` is ALWAYS recomputed from actual linked invoices
via `recalcContractBilled()` in `lib/finance/contract-billing.ts` (direct
`contract_id` + milestone-linked, cancelled excluded). Called on invoice
create/PATCH-items/DELETE and all three generators. **NEVER reintroduce
read-modify-write increments** — the increment pattern drifted production by
97,000 AED (reconstructed to the dirham in the audit). Same doctrine as
`amount_collected` (re-sum of payments).

### 2. Multi-currency: payments convert at their INVOICE's currency
`pyra_payments` has NO currency column. Every cross-invoice payment aggregate
goes through `lib/finance/payment-currency.ts` (`getInvoiceCurrencyMap` +
`sumPaymentsAED`) — which **fails LOUD** on lookup errors (a silent AED fallback
would produce plausible wrong numbers). Invoice `amount_due` aggregates convert
via `toAED(due, invoice.currency)`. Revenue-target `actual_revenue` is ALWAYS
AED (UI must not label it with the target's currency); progress ratio converts
the target to AED too.

### 3. Business decisions (Abdou, do NOT undo silently)
- **VAT rate stays 0** — company not VAT-registered. The VAT report math is
  fixed (signed refunds — no `Math.abs` on payments) for whenever registration
  happens.
- **Late-penalty feature REMOVED** (not disabled). If ever needed again, build
  it as a separate invoice line item — NEVER mutate invoice total/amount_due.
- **Client-facing automation OFF**: `send-reminders` requires
  `pyra_settings.dunning_enabled === 'true'` (explicit opt-in; default off) and
  is NOT wired to any cron. Recurring templates keep `auto_send=false`.
  Internal-only automation is fine.
- **Subscriptions module SUNSET** (commit `8f553aa`) — recurring costs are
  regular expenses (`ec_subscriptions` category + `is_recurring`).
  `pyra_subscriptions` table data kept (historical, no UI). Cards page is now
  orphaned — removal candidate *(still present at
  `app/dashboard/finance/cards/page.tsx`, verified 2026-07-26 — open, not done)*.
- **Batch 5 (RBAC/scoping) DEFERRED** — no non-admin finance role planned. The
  `c_`/`cl_` namespace mismatch + `Number(NaN)` contract-scope checks stay as
  documented latent issues until an accountant role is actually needed.

### 4. The daily finance cycle — `/api/cron/finance-daily`
ONE cron endpoint (Phase D §7 pattern: `getExternalAuth` + `cron.finance-daily`
or `*`), scheduled daily 08:30 Dubai via n8n workflow **PyraFinance_Cron**
(`tWRE4tlQCX5xRzNK`; API key `ak_j9VWKq51JM7cNjJz` — the scoped cron key, NOT
wildcard). Four jobs, each in its own try/catch: mark-overdue, recurring
generation (DRAFTS + admin notify), quote expiry, contract-expiring alerts
(7-day dedup via `pyra_notifications.entity_id`). New finance automation goes
INTO this route as a new job — don't create parallel finance cron endpoints.
The recurring engine lives in `lib/finance/recurring-generation.ts` (single
source of truth for the manual button AND the cron; contract `vat_rate`
priority incl. explicit 0; items/advance failures roll the invoice back).

### 5. Money-write discipline (patterns now enforced in the core)
- Invoice PATCH uses a strict field whitelist (`ALLOWED_PATCH_FIELDS` in
  `app/api/invoices/[id]/route.ts`) — money state (total/subtotal/tax/amount_*)
  is DERIVED; identity fields (client_id/currency/invoice_number/created_by/
  contract_id) immutable via PATCH. Recurring/cards/targets PATCH have their
  own whitelists. **No raw `.update(body)` on finance tables.**
- Credit notes: `applied` is TERMINAL (transition map) — reversing requires a
  dedicated un-apply that reverses the payment. Apply claims the CN via a
  conditional update (optimistic lock) BEFORE the money write, re-validates
  the cap after the claim, and rolls the claim back on payment-insert failure.
- Payments POST rolls the payment row back if the invoice recompute fails
  (no false-success 201). Payments are otherwise append-only by design —
  corrections via credit note / refund only.
- Stripe webhook: `charge.refunded` books the refund DELTA vs recorded rows
  (Stripe's `amount_refunded` is CUMULATIVE) — replay-idempotent; dispute-lost
  insert idempotent by `dispute_<id>` reference; admin alerts resolve REAL
  active admins via `notifyMany` (a literal 'admin' user does not exist);
  `payment_intent_data.metadata` is set in BOTH checkout routes.
- Portal statement ledger: `pyra_payments` is the ONLY money source
  (`pyra_stripe_payments` rows are session records, never ledger entries);
  refunds present as DEBIT with Arabic labels, never negative credits.

### 6. Etmam ground truth (data repaired 2026-07-03, audit-logged)
Contract switched quarterly→monthly at 13,000/month. INV-0005 corrected
20,000→13,000 (paid, due 0 — the 7,000 was refunded via CN-0001, which IS the
refund record); INV-0002 linked to the Brand Identity contract. All 3 contracts
reconcile billed=collected. Recurring template `ri_5d699ff769df52e5` generates
monthly drafts on the 25th. Future bulk invoice entry: Abdou will hand over
paid invoices; enter them excluding what already exists (match by amount+date+client).

### Finance v1.1 backlog
See the audit doc's Implementation Status "Still open" list — highlights:
migrate ~20 raw-fetch finance pages onto the existing hook layer; page gates +
`usePermission` action gating; `pyra_payments.currency` column (schema fix
superseding the invoice-join pattern); Stripe refund unique index; commission
currency + refund reversal; docs drift (DATABASE-SCHEMA quotes/payroll/
business_entities, ARCHITECTURE.md, PORTAL-GAPS.md).

## Quote System + Gap #5 — Locked Decisions (2026-06-19)

Closure of the quote-system fix arc (Groups 1–3) — the "Bahaa broken-loop"
saga: sales agents could create quotes but not **see / send / delete** them,
plus the broken-snapshot all-NULL PDF bug. **Do NOT re-litigate.** Full
chronological arc + verifications in `CRM-PROGRESS.md`.

### 1. Quote scoping = created_by OR lead-owned OR clientIds (Gap #5a)

`GET /api/quotes` (list) and `GET /api/quotes/[id]` (single) scope non-admins
with a **three-way OR**: a quote is visible if the user **created it**
(`created_by`), OR it's on a **lead they own** (`lead_id ∈ their leads`, via
`canAccessLead`), OR it's for a **client in their ERP scope** (`clientIds`).
Replaces the old `client_id IN clientIds`-only filter, which returned `[]` for
team-less CRM agents (no teams → empty `clientIds`) — that was the create→view
break. Empty arrays are OMITTED from the `.or()` (PostgREST `in.()` is invalid);
all values quoted via `escapePostgrestValue` (usernames contain dots). The
Lead-Detail Deals tab quotes card (`useLeadQuotes` → `/api/quotes?lead_id=`)
rides the same scoped endpoint (Gap #5b, closes issue #7).

**KNOWN v1.1 ISSUE (do not assume team scoping works):** `clientIds` comes from
`pyra_projects.client_id` (`c_` namespace) but `pyra_quotes.client_id` is the
`cl_` namespace — they rarely match, so the clientIds clause is **latently
inert** for everyone. `created_by` + lead-owned are the real workhorses; the
clientIds clause is kept (with `String()` coercion) for when the namespace
mismatch is fixed.

### 2. `quotes.delete_own` + three-way delete + NULL client_id fix (Group 2)

New permission `quotes.delete_own` (delete OWN quotes only) — granted to
`sales_agent`. `DELETE /api/quotes/[id]` authenticates first (`getApiAuth`,
NOT `requireApiPermission('quotes.delete')` which would 403 agents), then
branches:
- has `quotes.delete` (full) → admin bypass OR Gap #5a three-way scope
- else has `quotes.delete_own` → must be `created_by === me`
- else → 403

**Issue #4 fix:** the old `!clientIds.includes(client_id)` check forced
forbidden for lead-only quotes (`client_id = NULL`) **even for the creator**.
The three-way / creator-only model fixes it — NULL client_id is irrelevant to
own-scope deletion. Verified end-to-end: kassem (agent, delete_own only) deleted
his own NULL-client_id quote QT-0027 (activity-log proven).

### 3. Save-and-send gate + honest send-UX = flip-and-warn (Groups 2–3)

- **Gate:** "حفظ وإرسال" (QuoteBuilder) + the per-row "إرسال" are hidden when
  the user lacks `quotes.edit` (the `/send` endpoint requires it). Agents see
  only "حفظ كمسودة" — kills the save-then-fail-send partial-state double-create.
- **Honest UX (flip-and-warn):** `/api/quotes/[id]/send` AWAITs the email and
  returns `{ ...quote, email: { sent, reason?: 'no_email'|'not_delivered', to? } }`.
  The quote **always flips to `sent`** regardless of email outcome (admin's
  action stands; they can re-send); the UI shows the truth via 3 toasts:
  delivered → success `"تم إرسال العرض بالبريد إلى {to}"`; no_email / not_delivered
  → warning. `sendQuoteSentEmail()` (awaitable) returns the boolean; the
  fire-and-forget `notifyQuoteSentToClient` is retained but signposted as
  "do NOT use on the send path".

### 4. DataTable portaled-click fix is root-level (`components/ui/data-table.tsx`)

Radix `DropdownMenu`/`Dialog` content is **portaled to `document.body`**, but
its React synthetic `onClick` bubbles through the React **component** tree to the
`<tr>` `onClick` — so clicking a row's ⋮ menu item fired row navigation. The
`<tr>` guard now also bails on `target.closest('[data-radix-popper-content-wrapper]')`,
`[role="menu"]`, `[role="dialog"]`, `[role="alertdialog"]`. Strictly corrective
(no case wants a portaled-menu click to navigate the row); fixes the same latent
glitch on **quotes + invoices + projects** lists. Any new `DataTable` + row-menu
page inherits the fix.

### 5. Server-side PDF generation pattern (Group 3) — LOCKED

- **`lib/pdf/pdf-assets-server.ts` (server-only)** reads Amiri fonts + the
  default logo from the filesystem (`node:fs`) and the server INJECTS them into
  `generateQuotePDF`/`generateInvoicePDF` via `{ fonts, defaultLogo }`. WHY:
  `registerArabicFont`'s browser path uses `fetch('/fonts/..')` — a **relative
  URL that THROWS in Node** ("Failed to parse URL"), which silently broke ALL
  server-side Arabic (incl. the pre-existing WhatsApp `send-pdf`). Keep all `fs`
  usage in this module — it must only be imported by **server route handlers**
  (no `'use client'` file may import it, or the client build breaks).
- **`quote-pdf.ts` / `invoice-pdf.ts` are NOT `'use client'`** — they're
  isomorphic utilities (plain async fns). A `'use client'` directive makes the
  server's `await import()` resolve to a **client-reference proxy** → server
  generation silently fails. Browser callers still bundle them via their own
  `'use client'` boundary.
- **`registerArabicFont(doc, preloaded?)`** throws loudly if called server-side
  without `preloaded` fonts (instead of silently producing a fontless PDF).
- **`addImage` format is detected** from the data URI (`data:image/png` → 'PNG',
  else 'JPEG') so the PNG default logo embeds correctly.
- **Pattern to reuse for any server PDF:** select full `*_FIELDS` + items →
  `loadServerPdfFonts()` + `loadServerDefaultLogo()` → `await import()` the
  generator → `Buffer.from(await blob.arrayBuffer())` → attach. PDF failure is
  **isolated** (logError + link-only fallback) and never blocks the send or the
  status flip.
- **Gmail 25 MB cap:** Node can't resize images (no canvas), so the embedded
  logo is raw. Default logo (904×398 → ~1.5 MB PDF) is safe; a **very-high-res
  entity logo could bloat the PDF past 25 MB** (v1.1 — needs server-side resize).
- **Quote emails ATTACH the PDF** (lead recipients have no portal login); body
  leads with "العرض مرفق بهذا البريد (PDF)", portal link is secondary.

### 6. SMTP config + `smtp_allow_insecure` TEMPORARY compromise

SMTP creds live in `pyra_settings` (DB only, NEVER in code — repo is public):
`smtp_host/port/user/pass/from/from_name` (sender shows **"Pyramedia X"**).
`mailer.ts` reads DB-first (env fallback), `secure: port===465`.

⚠️ **`smtp_allow_insecure=true` is a DOCUMENTED, TEMPORARY compromise.** The
`mail.pyramedia.info` Let's Encrypt cert **expired 2026-06-03** (auto-renew
broke); prod's `rejectUnauthorized:true` refused it. The flag (DB-toggleable,
**secure-by-default**, part of the transporter cache key so it takes effect with
no redeploy) disables cert validation for the SMTP transport ONLY (still
TLS-encrypted). **REVERT to `false` (or delete the key) once the cert is
renewed** — then re-run the connect+cert+auth pre-flight. Until then, server-side
SMTP cert validation is OFF.

> **STILL OPEN — verified in prod 2026-07-26: `smtp_allow_insecure` is still
> `true`, ~8 weeks after the cert expired.** "Temporary" has become standing.
> Renew the `mail.pyramedia.info` cert (fix the auto-renew), then flip the key to
> `false` and re-run the pre-flight. Surfaced in `CLAUDE.md` → "Live exceptions".

### 7. Granting a permission to EXISTING users needs the DB role updated, not just `ROLE_EXTRAS`

`buildUserPermissions` = `BASE_EMPLOYEE ∪ (dbRolePermissions ?? ROLE_EXTRAS[role]) ∪ extras`.
Users whose `pyra_users.role_id` points to a `pyra_roles` row resolve from
**`dbRolePermissions`** — so adding a perm to `ROLE_EXTRAS.sales_agent` in code
is **INERT** for them. Group 2 hit this: `quotes.delete_own` only worked after
the "Sales" DB role's `permissions` array (`text[]`) was also updated
(`array_append`, idempotent). **When granting a new role permission, update BOTH
the code `ROLE_EXTRAS` (canonical/fresh-setup) AND the live DB role row** —
verify with a DB read.

### Quote-system v1.1 backlog

- `c_` vs `cl_` client-id namespace mismatch → team-based quote scoping latently
  inert for all (clientIds clause never matches). Fix the namespace, then the
  clause works.
- Dead hooks: `useQuotes`/`useQuote`/`useCreateQuote` in `hooks/useQuotes.ts`
  point at `/api/dashboard/quotes` (404, doesn't exist) and are imported by
  nothing. Remove or repoint to `/api/quotes`.
- Entity-logo bloat: Node can't resize → a very-high-res entity logo could push
  the email PDF past Gmail's 25 MB. Add server-side resize (sharp) or a
  pre-sized asset.
- Remaining original quote issues: #8 (a dedicated `quotes.send` perm vs reusing
  `quotes.edit`), #9 (edit-page read-only gating for agents), #10 (deeper
  sent-status UX — delivery receipts / retry).
- Read-only quote view for agents (the Deals-tab card covers visibility for now;
  no standalone agent-facing quote detail).

## Public Quote Signing — Locked Decisions (2026-07-27)

A no-login `/d/<token>` page lets a customer view and sign a quote from a link
sent over WhatsApp or email, without a portal account. Migrations 054/055 add
`pyra_document_links` (the opaque-link table) and twelve columns on
`pyra_quotes` that record HOW a signature was obtained and whether the quote
email actually delivered. Schema: `DATABASE-SCHEMA.md` → "Public Quote Signing
(054/055)". **Do NOT re-litigate.**

### D-1. The public quote PDF omits bank details

`lib/quotes/public-payload.ts`'s `PUBLIC_QUOTE_FIELDS` allowlist — the only
fields that may cross onto the unauthenticated link — deliberately excludes
`bank_details`, and every PDF generated off that link (the customer's
download, and the signed-copy email in D-3) blanks the field explicitly
rather than trusting the allowlist alone. **Why:** a public link is, by
design, forwardable — a customer can screenshot it, forward the email, or
paste the URL into a group chat. Publishing the company's IBAN on a document
that can end up anywhere is handing out an invoice-fraud kit: a
"here's our updated bank details" scam email is far more convincing with a
real, signed company quote attached. The allowlist is deliberately an
allowlist, not an omit-list, specifically so a future `select *` on the
public route adds a column to the *row* but not to the *payload* — a unit
test pins the key set so a regression fails CI instead of shipping.

### D-2. The append-only signature trigger is a partial Gap #3 mitigation

`pyra_quotes` still has RLS **off** and grants `authenticated` full DML
(the open Gap #3 exposure — see `docs/decisions/security.md`), which means a
direct PostgREST `PATCH` from any authenticated session can, in principle,
rewrite a signature. The `trg_pyra_quotes_signature_append_only` trigger
(054, extended in 055 to thirteen signature/evidence columns total — nine of
054's twelve new columns plus the four legacy ones; the three `delivery_*`
columns are deliberately excluded, since delivery status is recomputed on
every send — see `DATABASE-SCHEMA.md`) closes the specific hole this feature
would otherwise
open: once a signature/evidence column is non-NULL, a further `UPDATE` that
changes it raises instead of silently overwriting the audit trail. **This is
not a substitute for revoking `authenticated`'s grant on `pyra_quotes`.** A
full revoke needs its own read-path audit — every place in the app that
currently reads `pyra_quotes` as `authenticated` (rather than through a
gated API route with the service-role client) has to be found and fixed
first, or the revoke breaks those reads outright. **The revoke must never
ship before the code that stops reading as `authenticated`** — that ordering
mistake is exactly how Gap #3 remediation regresses a feature instead of
closing a hole. Track the full Gap #3 closure separately; this trigger only
guarantees append-only-ness for one table's signature columns in the
meantime.

### D-3. The customer gets an emailed copy when they sign

`POST /api/public/quotes/[token]/sign` (`app/api/public/quotes/[token]/sign/route.ts`)
emails the signed quote PDF to `quote.client_email` after a successful sign,
via `sendSignedQuoteCopyEmail` (`lib/email/notify.ts`). **Why:** an
unauthenticated signer has no portal login and no other durable record of
what they just agreed to — without this email, "what did I actually sign"
is answerable only by someone at Pyramedia looking it up. The send is
best-effort (wrapped in try/catch, logged as a `warning` on failure) and
never blocks or fails the sign response — the quote is already legally
signed in the DB regardless of whether the courtesy copy goes out. The
attached PDF follows D-1: bank details are always blanked, never the real
`quote.bank_details`.

### D-4. QuoteDetailView moved out of components/portal/ and translated

`components/quotes/QuoteDetailView.tsx` (commit `58e4a56`) used to live at
`components/portal/quotes/QuoteDetailView.tsx`, rendered only inside the
authenticated client portal. It shipped 100% hardcoded Arabic — and because
`components/portal/` was outside the i18n gate's `MIGRATED_PATHS` manifest at
the time, `pnpm i18n:check` had no way to catch it. Reusing it as-is for the
public link would have shipped an Arabic-only legal document (a quote a
customer is being asked to sign) to an English-preferring client, silently,
with no CI signal that anything was wrong. The move to `components/quotes/`
plus the translation is what let this task also add `app/d` to
`MIGRATED_PATHS` (see `scripts/i18n-check.ts`) — the component's own
translatedness is a precondition for that manifest entry passing at all.
The moved component also gained `canSign`/`showBack` props and switched its
"already signed" detection from presence of `signature_data` (never present
in the public payload — see S-15 below) to the quote's `status`.

### S-10. Unknown, revoked and expired links must return ONE response

`classifyLinkState()` (`lib/documents/link-state.ts`) distinguishes `valid`
/ `expired` / `revoked` for internal/operator use, but every public-facing
caller — `app/d/[token]/page.tsx` (all three `notFound()` calls),
`app/api/public/quotes/[token]/sign/route.ts` (`invalidLinkResponse()`) —
collapses anything that is not `valid`, plus an unknown token entirely, into
the exact same response: same HTTP status, same body, same copy. **Why:** if
an invalid token got a different response than a revoked or expired one, a
holder of a harvested/guessed token could distinguish "never existed" from
"was real once" — confirming a token was genuine even after it stopped
working. `app/d/[token]/not-found.tsx` goes further and renders a **fixed
locale** rather than trying to resolve the visitor's preferred language,
because at the point any of the three `notFound()` calls fires, the target
quote's client (and therefore `preferred_language`) may not even have been
looked up yet — there is no per-token signal left to branch on without
reopening the same distinguishability hole through response *language*
instead of response *shape*.

### S-11. A DB error must be a 500, never the invalid-link response

Both `app/d/[token]/page.tsx` and the public sign route check `linkErr` /
`quoteErr` / `itemsErr` from every Supabase call and **throw** (the page) or
return `apiServerError()` (the sign route) — never `notFound()` / the
invalid-link response — when the database itself failed. **Why this is
explicit, not obvious:** conflating "the database errored" with "the link is
invalid" is precisely the bug class that left the older `/api/shares/*`
stack silently dead in production for five months — a transient DB blip (or
a permissions regression) rendered as "this link doesn't exist" instead of
an error, so nobody investigated because the failure looked like normal
traffic hitting bad/expired links rather than a broken system. Keeping the
two failure modes visibly distinct is what makes a future regression here
noisy instead of silent.

### The mint path must revoke-then-insert

`POST /api/quotes/[id]/link` (`app/api/quotes/[id]/link/route.ts`) always
revokes any existing live link for the quote **before** inserting the new
one — never a bare `insert`. `idx_document_links_one_live` (the partial
unique index enforcing "at most one live link per document") only looks at
`revoked_at IS NULL`; it has no idea an `expires_at` in the past means the
row is functionally dead. An expired-but-unrevoked link therefore still
blocks a bare insert with `23505` **forever** — "generate a new link" would
never succeed once the old one expired. Revoking first (including an
already-expired link) makes every mint succeed and makes a second mint
supersede the first exactly as the UI implies. The route still handles the
genuine leftover race (two concurrent mints both revoke as a no-op, then
both insert — the loser gets `23505` after the winner's row is live) by
re-fetching and reporting the link as existing **without** fabricating or
returning the winner's token.

### signed_offline_by is always server-derived

`POST /api/quotes/[id]/offline-signature` (`app/api/quotes/[id]/offline-signature/route.ts`)
sets `signed_offline_by` to `auth.pyraUser.username` from the authenticated
session — **the request body is never read for this field**, even if a
caller includes one. The whole point of this column is recording who, on the
Pyramedia side, is vouching that a customer really did counter-sign the
paper/PDF copy being uploaded as evidence. Trusting a client-supplied value
for that would let anyone attest on someone else's behalf, making the
record legally worthless. This is the same doctrine as `logActivity()`'s
actor parameter and every other "who did this" column in the codebase:
identity comes from the session, never from the payload.
