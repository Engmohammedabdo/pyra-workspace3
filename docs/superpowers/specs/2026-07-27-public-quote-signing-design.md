# Public Quote Signing — Design Spec (2026-07-27)

## Goal

Let a customer sign a quote from a link we send on **WhatsApp**, with no login and no
email in the critical path — and let us record a signature we obtained **offline**, with
the counter-signed PDF kept as evidence and the internal attester named.

Plus one honesty fix: the quotes list must show whether a quote was actually **delivered**,
not just that we tried.

## Why this exists

Abou, 2026-07-27:

> عرض السعر بيروح بالايميل عشان العميل يوقع، احياناً سيرفر الايميلات بيقع

That is not an occasional annoyance. The system has one signing path and it is gated twice:

1. **Signing requires a portal login.** `app/api/portal/quotes/[id]/sign/route.ts` is the
   only sign endpoint in the repo. Live: 6 clients, **3** with an `auth_user_id`.
2. **Delivery requires SMTP**, and SMTP is running degraded on purpose. The
   `mail.pyramedia.info` certificate expired ~8 weeks ago and the mitigation was to turn
   certificate validation **off** (`smtp_allow_insecure = true`), still true in prod —
   see the live-exceptions table in `CLAUDE.md`.

Worse, the quote is marked `sent` **before** the email is attempted
(`app/api/quotes/[id]/send/route.ts:60-65`, then the send at `:95+`). The route already
returns an honest `email: { sent, reason }` — but nothing is persisted, so the list shows
`sent` for a quote that never arrived.

The link the system *does* hand the client is dead: the client notification writes
`target_path: /quotes/${id}` (`send/route.ts:150`) and **`app/quotes/[id]` does not
exist**.

Result, live: **28 quotes → 2 ever signed**, 16 expired, 3 rejected (all 3 internal
pricing vetoes, `sent_at IS NULL` — no customer has ever rejected anything, because there
is no reject button).

## Locked decisions (Abou, 2026-07-27 — do NOT re-litigate)

1. **Both mechanisms ship together.** A public signing link *and* an offline
   "mark as signed" button. Each covers the case the other fails.
2. **Do NOT merge the quotes and invoices list pages.** Different lifecycles (sign vs
   pay), different permissions. What gets unified is the *sending* action, not the lists.
3. **No OTP / SMS verification on the public link in v1.** Explicitly weighed and declined
   as friction. The controls are expiry + revocation + IP/timestamp capture.
4. **Renewing the mail certificate stays out of scope** — server work, and the whole point
   of this feature is to stop depending on it.

## Non-goals (v1)

- A public **payment** page for invoices. `pyra_document_links` is built generic
  (`entity_type` covers `invoice`/`contract`) but only `quote` is wired.
- A customer-facing **reject / renegotiate** button. Real gap, separate feature.
- A read-only quote **detail page**. Actions go in the existing row dropdown (OD-6).
- Captcha / bot protection (OD-7).
- Fixing the pre-existing `/api/shares/*` breakage beyond the one-line middleware fix
  (OD-12).

---

## Prerequisite findings that change the shipping order

Three facts from the design research invalidate assumptions this spec would otherwise
have made. They are stated here because each one has already cost this codebase a shipped
feature.

### P-1 — The one existing public-link precedent is dead in production, three ways

`app/share/[token]` + `app/api/shares/*` has been broken since it shipped:

| Defect | Evidence |
|---|---|
| `/api/shares/verify` missing from the middleware API allowlist → anonymous request 401s | `middleware.ts:152-163`; live `curl` → `401 {"error":"Unauthorized"}` |
| Page branches on `json.success`, which `apiSuccess` never emits | `app/share/[token]/page.tsx:21,30` vs `lib/api/response.ts:9-15` |
| Routes select/insert `password_hash` + `notification_email`, columns that do not exist | PostgREST `42703`; a real live token returns 404 |

**Do not pattern-match this code.** The read path in this feature therefore does **not**
go through an API route at all — the server component queries directly with the service
role, which removes the entire 401/envelope class of bug.

### P-2 — `pyra_shares` does not exist; the table is `pyra_share_links`

`SELECT to_regclass('public.pyra_shares')` → `null`. Any spec text or plan step naming
`pyra_shares` is wrong.

### P-3 — There is no quote *viewer* page

`app/dashboard/quotes/[id]/page.tsx` renders `QuoteBuilder`, an **editor**. Every
per-quote action lives in the list row dropdown
(`app/dashboard/quotes/quotes-client.tsx:257-300`). New internal actions go there.

---

## Feature 1 — The public signing link

### Flow

1. Sales opens the row dropdown on a `sent`/`viewed` quote → **«رابط التوقيع»**.
2. The system mints a token, shows the URL, and offers copy / open. One live link per
   quote (OD-9).
3. Sales pastes it into WhatsApp.
4. Customer opens `/d/<token>` — no login. Sees the quote, signs on the pad, types their
   name.
5. The quote flips to `signed` with `signature_source = 'public_link'`, and the frozen
   payload the customer actually saw is stored in `signed_snapshot`.

### Why the read path is a Server Component

`app/d/[token]/page.tsx` reads `pyra_document_links` + `pyra_quotes` + `pyra_quote_items`
through `createServiceRoleClient()`. No API route, no session, no envelope mismatch.
The root layout (`app/layout.tsx:64-97`) is already auth-free and supplies
`<html lang dir>`, theme, i18n and providers — so the page needs **no layout of its own**,
and must **not** hardcode `dir="rtl"` the way `app/share/[token]/page.tsx:50` does.

Only the sign POST needs a route: `POST /api/public/quotes/[token]/sign`.

### A client wrapper is mandatory

`components/portal/quotes/QuoteDetailView.tsx` cannot be rendered from a Server Component:
it takes three function props (`onBack`, `onDownload`, `onSign` — `:19-26`), and functions
do not cross the RSC boundary. It is also `'use client'` and dynamically imports
`SignaturePad` with `ssr: false` (`:14`), which is only legal from a client boundary.

`app/d/[token]/public-quote-view.tsx` (`'use client'`) owns the signing state and the POST.

### The states the page must render

`ready` · `already_signed` · `expired` · `invalid` · `unavailable_status`.

`invalid` collapses **unknown token, revoked link and expired link into one
indistinguishable response** (S-10). Expiry of the *quote* is a separate, visible state
with different copy, because the customer's next action differs: ask for a new **link**
vs ask for a new **quote**.

---

## Feature 2 — Offline signature attestation

Row dropdown → **«تم التوقيع خارج النظام»**. The dialog collects:

- The counter-signed **PDF** (required — this is the evidence)
- The date the customer signed → `signed_at`

The server sets `signature_source = 'offline'`, `signed_offline_at = now()`, and
`signed_offline_by = auth.pyraUser.username` — **derived from the session, never from the
request body** (S-26).

Evidence goes to the private `pyra-private` bucket and is served only through a short-TTL
signed URL. `signed_evidence_path` is stripped from every response, following
`app/api/hr/documents/route.ts:117-123`.

---

## Feature 3 — Honest delivery status

`POST /api/quotes/[id]/send` already computes the truth and throws it away. Persist it:

| `delivery_status` | Meaning |
|---|---|
| `delivered` | SMTP accepted the message |
| `no_email` | the client/quote has no email address |
| `not_delivered` | SMTP failed or is not configured |

The quotes list gets a badge so **«ابعتله واتس»** becomes an obvious next action instead of
a guess. The quote still flips to `sent` — that behaviour is deliberate and documented in
the route; what changes is that the list stops lying about the outcome.

---

## Data model

### New table — `pyra_document_links`

```sql
CREATE TABLE IF NOT EXISTS public.pyra_document_links (
  id             text PRIMARY KEY,
  entity_type    text        NOT NULL CHECK (entity_type IN ('quote','invoice','contract')),
  entity_id      text        NOT NULL,
  token          varchar(64) NOT NULL,
  content_hash   text        NULL,
  expires_at     timestamptz NULL,
  revoked_at     timestamptz NULL,
  revoked_by     text        NULL,
  view_count     integer     NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  last_viewed_at timestamptz NULL,
  created_by     text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

House conventions applied (verified against migrations 036/037/039/040): application-
generated `text` PK with no DB default, `timestamptz NOT NULL DEFAULT now()`, inline
`CHECK` instead of enums, and **no FK on username columns** (only 2 of 114 `pyra_*` FKs
reference `pyra_users`). `entity_id` is polymorphic so it carries no FK by construction —
which is why revocation must be handled in code (OD-8).

`expires_at IS NULL` means **never expires** — a deliberate product choice, not an
oversight.

**Token:** `crypto.randomBytes(32).toString('base64url')` — 43 chars, 256 bits. Not
`generateId()`, whose 20-char cap exists to fit `varchar(20)` id columns and is far too
short for a legally binding link.

### Lockdown (mandatory, same migration)

```sql
ALTER TABLE public.pyra_document_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pyra_document_links FROM anon, authenticated;
GRANT ALL  ON TABLE public.pyra_document_links TO service_role;
```

No `CREATE POLICY` — RLS is a deny-all backstop here, effective because `service_role`
has `rolbypassrls`. **Never grant `anon`**: Gap #3 Phase 0 revoked it globally on the
stated premise that share-token reads use the service role
(`docs/decisions/security.md:495-503`), and that premise holds here.

Contrast with what exists today: `pyra_share_links` has RLS **off**, zero policies, and
grants `authenticated` full DML — any logged-in employee can read every share token
directly. `pyra_document_links` holds signing tokens and must not repeat that.

### Atomic view counter

A `SECURITY DEFINER` function with `SET search_path = ''`, `EXECUTE` granted **only** to
`service_role`. The explicit grant is required: `038_function_execute_acl.sql:63-75` set
`ALTER DEFAULT PRIVILEGES` revoking EXECUTE from PUBLIC/anon, so a new function is not
born executable and the counter would silently fail.

### New columns on `pyra_quotes`

All nullable, no defaults. Verified absent before writing.

| Column | Purpose |
|---|---|
| `delivery_status`, `delivery_detail`, `delivery_checked_at` | Feature 3 |
| `signature_source` (`portal`/`public_link`/`offline`), `signed_link_id`, `signed_user_agent` | how the signature was obtained |
| `signed_offline_by`, `signed_offline_at`, `signed_evidence_path/_mime/_size` | Feature 2 evidence |
| `signed_snapshot` (jsonb) | the frozen payload the signature attests to |

The existing `signature_data`, `signed_by`, `signed_at`, `signed_ip` are reused as-is.

**No new quote status.** `pyra_quotes_status_check` pins `status` to exactly 9 values and
the TS union gives no protection against the DB — a new value fails at runtime, not build
time. `signature_source` and `delivery_status` are separate columns precisely so no
constraint churn is needed.

---

## Security requirements

The full numbered list (S-1 … S-29) lives in the implementation plan. The ones that shape
the design:

- **S-6 — content mutation blocked on `signed`/`invoiced` quotes.** *Highest severity in
  the feature, and it is a bug that exists today:* `PATCH /api/quotes/[id]` will silently
  re-price a signed quote while leaving `signature_data` and `signed_at` intact. Without
  this, a public signature is legally worthless.
- **S-7 / S-8 — the signature attests to a frozen payload.** `signed_snapshot` is written
  inside the same conditional UPDATE as the signature; `content_hash` on the link lets the
  public page refuse to show the sign action if the quote changed after the link was sent.
- **S-10 — all invalid link states are byte-identical.** The existing share verify route
  returns 404 for unknown vs 410 for expired, confirming to an attacker that a harvested
  token was once real.
- **S-11 — a DB error must 500 + `logError()`, never render as "invalid link."** This is
  precisely how `/api/shares/*` stayed dead for five months without anyone noticing.
- **S-15 — the public payload is an explicit allowlist asserted in a unit test**, so a
  future `select *` fails CI. Must exclude `client_email`, `client_phone`,
  `client_address`, `client_id`, `lead_id`, `created_by`, `signed_ip`, `license_no`,
  `entity_id`, `token`, `signed_evidence_path`.
- **S-19 — `draft` and `pending_approval` quotes are unreachable by public link**, so
  internal re-pricing cannot leak.
- **S-28 — do NOT use `timingSafeEqual` on the token lookup.** The repo reserves it for
  secret compares against a fixed known value (3 sites). A btree `.eq('token', …)` on a
  256-bit opaque token is correct; `timingSafeEqual` would require loading every token
  into memory.
- **S-29 — deployment assumption:** rate limiting and `signed_ip` integrity both depend on
  the Coolify proxy overwriting `X-Forwarded-For`. If the container ever becomes directly
  reachable, both fail. Recorded as an assumption, not a code guarantee.

### The middleware edit is exactly one line

```ts
!pathname.startsWith('/api/public') &&
```

inserted into the API-gate chain at `middleware.ts:157`.

**Do NOT add `/d` to `publicRoutes`.** Matching is
`publicRoutes.some(r => pathname.startsWith(r))` (`:64`) and the public branch returns
*before* the dashboard auth gate (`:75-81`) and before CSRF (`:98-139`) — so `'/d'` would
make **`/dashboard` public**. It is unnecessary anyway: live `curl /d/sometoken` returns
404 (renders) while `/dashboard` returns 307. `config.matcher` needs no change.

`/api/public` must also stay **out** of the CSRF exempt list — the sign POST is a
same-origin browser fetch, so the Origin/Referer check protects it for free.

---

## Owner decisions still required

Everything else has a recommendation recorded in the plan. These four need Abou.

**D-1 — Bank details on the public quote PDF.**
The portal passes the quote verbatim into `generateQuotePDF`, which renders
`bank_details.{bank,account_name,account_no,iban}`. On an unauthenticated, forwardable
URL that publishes the company IBAN — a ready-made invoice-fraud kit. *Recommendation:*
omit bank details from the public PDF and print "bank details will be on the invoice".

**D-2 — Any logged-in employee can forge a signature today.**
`pyra_quotes` has RLS off and grants `authenticated` UPDATE. A direct PostgREST PATCH can
set `status='signed'` with chosen `signature_data`/`signed_by`/`signed_at`/`signed_ip`,
bypassing every application guard and producing no activity row. This is pre-existing
(Gap #3), not introduced here. *Recommendation:* ship an append-only signature trigger in
migration 054 as a partial mitigation; a full revoke needs its own read-path audit and
must never precede the code that stops reading as `authenticated`.

**D-3 — Does the customer get a copy when they sign?**
Today the signer receives nothing — no email, no notification, no timeline row.
*Recommendation:* email them the signed PDF and write a lead-timeline row. Small, and it
is what makes the feature feel finished.

**D-4 — Move `QuoteDetailView` out of `components/portal/`?**
It is Arabic-only (~19 hardcoded strings). Moving it to `components/quotes/` is
semantically correct and puts it under `pnpm i18n:check`, but adds a translation pass.
*Recommendation:* move it — a customer-facing legal document that is Arabic-only for an
English-speaking client is a real product defect, and this is the natural moment.

---

## Migration baseline

`pnpm db:check-drift` **exits 1 today** — migration 036 is recorded but its table does not
exist. Before 054 is applied, drift must show **exactly one MISSING (036) and nothing
else**. Fixing 036 is unrelated scope; the baseline is recorded here so the next engineer
does not mistake it for damage caused by this work.

Next migration number is **054** (highest on disk: `053_stripe_payment_integrity.sql`).
Filename must match `/^\d{3,}_[a-z0-9_]+$/` or `pnpm db:record` exits 1.

---

## Verification that this feature is actually alive

Every previous public-link feature in this repo shipped broken and stayed broken because
nobody tested it the way a customer uses it. Therefore:

**An anonymous, cookie-less end-to-end test is mandatory and its output must be pasted
into the PR description** — `curl` or an incognito window, never a logged-in browser tab:

1. `GET /d/<valid-token>` renders the quote
2. `POST /api/public/quotes/<token>/sign` succeeds
3. `/dashboard` still redirects to `/login`
4. A random token and an expired token return byte-identical responses
