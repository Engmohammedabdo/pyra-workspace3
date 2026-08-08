# Security — Locked Decisions Archive

Audit findings, RBAC hardening, DB exposure remediation, and the secret-handling doctrine.

> **Archive of locked decisions.** These were settled after audit → design → implementation → review, and are recorded so they are **not re-litigated**.
> `CLAUDE.md` carries a one-line index of everything here; open this file when the index says a decision touches what you are about to change.

## Contents

- [Phase D — Locked Decisions (P2 Security Polish)](#phase-d-locked-decisions-p2-security-polish)
- [Phase 14.3 — Locked Decisions (Security Audit + Fix Bundle)](#phase-143-locked-decisions-security-audit-fix-bundle)
- [Audit Gap #4 — `sales_leads.manage` misleading name (documented, rename deferred)](#audit-gap-4-sales_leadsmanage-misleading-name-documented-rename-deferred)
- [Audit Gap #3 — DB exposure remediation (2026-06-19) — P0, partially closed](#audit-gap-3-db-exposure-remediation-2026-06-19-p0-partially-closed)

---

## Phase D — Locked Decisions (P2 Security Polish)

These are **intentional, documented design choices** locked during
Phase D closure. **Do NOT re-litigate.** Phase D shipped 9 of 10
P2-backlog items from `docs/SECURITY-AUDIT-2025-01.md` across 4
substantive commits + 1 closure. The remaining P2 (Redis rate-limiter
migration) is infra-heavy and stays in v1.1 backlog.

### 1. `validateExtraPermissions` is the DRY entry point for per-user grants

Phase D-1 lock (audit P2 #1). All sites that accept an
`extra_permissions` payload from an admin request body MUST import
`validateExtraPermissions()` from `lib/auth/rbac.ts` — NEVER re-implement
inline.

```ts
import { validateExtraPermissions } from '@/lib/auth/rbac';

const result = validateExtraPermissions(body.extra_permissions);
if (!result.ok) return apiValidationError(result.error);
updateData.extra_permissions = result.value;
```

The helper:
- Whitelists against `ALLOWED_EXTRA_PERMISSIONS = new Set(Object.values(PERMISSIONS))` — exact-match only
- Explicitly rejects wildcards (`*` and `module.*`) — wildcards MUST go
  via `pyra_roles.permissions` for audit clarity (silent per-user
  super-admin grants are an admin foot-gun)
- Returns `{ ok: true, value: [] }` for null/undefined so PATCH partial
  updates don't clobber existing extra_permissions when the field is
  absent from the request body
- Arabic error messages with the rejected permission included for
  debugging

### 2. `escapePostgrestValue(escapeLike(...))` is THE pattern for `.or()` user input

Phase 14.3 closed legacy sales-leads sites (3 routes); Phase D-1 closed
the WhatsApp conv site. Any future `.or()` / `.filter()` call that
incorporates user input MUST use this canonical pattern:

```ts
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';

if (search) {
  const safe = escapePostgrestValue(`%${escapeLike(search)}%`);
  query = query.or(`field_a.ilike.${safe},field_b.ilike.${safe}`);
}
```

**Regression smell:** any custom regex strip like
`.replace(/[,...]/, '')` — these always miss at least one PostgREST
filter delimiter (typically `.`) and reopen the injection. Grep for
`\.replace\(\/\[.*\]\/g?,/` in `.or()`-containing files as a code
review focus.

### 3. Per-account lockout MUST follow the IP-rate-limit chain on every auth endpoint

Phase D-2 lock (audit P2 #9). Two-tier defense:
1. IP-keyed limit (existing `loginLimiter` / `adminLoginLimiter` —
   defends against single-IP brute-force)
2. Email-keyed lockout (`accountLockoutLimiter` 10/24h — defends against
   distributed brute-force via proxy rotation)

```ts
// 1. IP gate
const limited = checkRateLimit(adminLoginLimiter, request);
if (limited) return limited;

// 2. Email gate (normalized lowercase!)
const lockoutKey = email.trim().toLowerCase();
const lockoutCheck = accountLockoutLimiter.check(lockoutKey);
if (lockoutCheck.limited) return error429;

// 3. Actual auth
const { data, error } = await supabase.auth.signInWithPassword({...});
if (error) return error401;

// 4. RESET on success (CRITICAL — legitimate user typos don't get
//    24h lockout)
accountLockoutLimiter.reset(lockoutKey);
```

**Rule:** any future auth surface (OAuth callback, alternative 2FA
enrollment, etc.) MUST apply the same 2-tier gate. The reset-on-success
step is mandatory.

### 4. PII redaction pipeline ordering is FIXED (audit P2 #4)

Phase D-3 locked the sequence in `lib/observability/log-error.ts`:

```ts
function redactString(input: string): string {
  let s = input.replace(EMAIL_RE, '[EMAIL]');        // (1) email first
  s = normalizeArabicDigits(s);                       // (2) Arabic → ASCII
  s = collapsePhoneFormatting(s);                     // (3) strip spaces/hyphens/parens
  s = s.replace(PHONE_RE, '[PHONE]');                 // (4) phone regex last
  return s;
}
```

Order rationale: emails never contain Arabic digits, so step 1 runs
clean of any normalization side-effects. Steps 2-3 prepare the input
for step 4's regex matcher. Reordering risks redaction misses or
false-positives.

Side effect: Arabic-Indic digits in the output become ASCII. Acceptable
since this is internal audit-log content, not user-facing display. The
`collapsePhoneFormatting` regex includes an **IPv4 guard** — if a
matched run contains ONLY dots (no space/hyphen/paren), it's left
unchanged. This distinguishes `192.168.1.1` from `(056) 579-9505`.

### 5. External-auth uses constant-time iteration with NO early break

Phase D-4 lock (audit P2 #10). The Phase 14.3 #5 lock established
`timingSafeEqual` as the codebase standard for ANY secret comparison.
Phase D-4 applied it to API-key hash lookup with one additional
discipline:

```ts
// fetch all active + non-expired keys (LIMIT 1000)
const { data: rows } = await supabase.from('pyra_api_keys')
  .select(...).eq('is_active', true)
  .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
  .limit(1000);

// Iterate ALL rows; no early break
let matched = null;
for (const row of rows) {
  const rowBuf = Buffer.from(row.key_hash, 'hex');
  if (rowBuf.length === keyHashBuf.length &&
      crypto.timingSafeEqual(rowBuf, keyHashBuf)) {
    matched = row;
    // NO break — keep scanning to neutralize position-timing attack
  }
}
```

**Rule:** any future constant-time lookup over multiple candidates
MUST follow the no-early-break pattern. An attacker timing response
latency could otherwise infer which position matched even with
`timingSafeEqual` on the bytes.

LOCK 4 cap: `LIMIT 1000` on the SELECT. `pyra_api_keys` currently has
<10 rows in production. If you hit this limit, the table has grown
beyond design assumptions — revisit with a bloom-filter pre-filter or
Redis-backed lookup.

### 6. Backup encryption is OPT-IN via env var (audit P2 #6)

Phase D-4 lock. `scripts/db-backup.sh` checks for
`BACKUP_ENCRYPTION_PASSPHRASE` in `.env.local`:
- Set → GPG symmetric AES256 encryption, output `.sql.gz.gpg`
- Unset → legacy `.sql.gz` with stderr warning (backwards compat)
- Set but `gpg` not installed → abort cleanly with install instructions
  (NO silent fallback — that would defeat the purpose)

**Passphrase discipline (mandatory):**
- Passphrase is sent to gpg via **file descriptor 3** with here-string
  `3<<<"$PASS"` — out-of-band of stdin/stdout
- Never appears in `ps aux` / shell history / process listings
- During encryption: `gpg --passphrase-fd 3 3<<<"$PASS"` writes to stdout,
  redirected to `"$OUT"` via `> "$OUT"` (NOT `--output`) so gpg failures
  propagate through `set -o pipefail`
- During restore: `gpg --passphrase-fd 3 --output - "$FILE" 3<<<"$PASS"`
  reads the ciphertext file via positional arg, NOT via stdin — avoids
  the fd-0 collision that `< FILE <<<PASS` would cause (gpg would
  consume the passphrase as ciphertext and silently fail decryption)

v1.1 may flip to default-on once passphrase rotation tooling exists.

### 7. Cron endpoints follow the Phase 11 pattern verbatim

Phase D-3 lock. Any new cron endpoint MUST mirror
`/api/cron/follow-up-reminders` exactly:

```ts
export async function POST(request: NextRequest) {
  try {
    // 1. Auth via x-api-key header → pyra_api_keys
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    // 2. Permission check accepting wildcard
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.<name>') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.<name>', 403);
    }

    // 3. Service-role client (RLS bypass intentional for cron)
    const supabase = createServiceRoleClient();
    // ... cron logic ...

    return apiSuccess({ ... });
  } catch (err) {
    logError({ error: err, request, metadata: { action: '...' } });
    console.error('[cron/<name>] threw:', err);
    return apiServerError();
  }
}
```

DO NOT invent a separate cron auth surface. n8n workflow setup
documented in `docs/MIGRATIONS.md` §15 Operations.

### 8. Rate-limiter messages auto-format units via `formatRetryArabic`

Phase D-2 Reviewer-MEDIUM fix. The shared `checkRateLimit()` helper in
`lib/utils/rate-limit.ts` calls `formatRetryArabic(retryMs)` to produce
human-friendly Arabic units:
- `< 60s` → `"N ثانية"`
- `< 60min` → `"N دقيقة"`
- else → `"N ساعة"`

`Retry-After` HTTP header stays in seconds per RFC 7231 (downstream
client tooling compliance).

**Rule:** new limiter callers benefit automatically — DO NOT hand-format
retry messages. Inconsistent unit choice across callers is a UX
regression smell.

### Phase D v1.1 backlog

See `CRM-PROGRESS.md` → "## Phase D — P2 Security Polish" → P2 findings
list for the actionable list. Highlights:
- Redis-backed rate limiter (only when horizontal scaling required)
- Offsite backup to S3 (encryption now in place reduces blast radius)
- Default-on backup encryption + passphrase rotation tooling

---

## Phase 14.3 — Locked Decisions (Security Audit + Fix Bundle)

Phase 14.3 was a read-only security audit (commit `945fd2e`) followed
by a tight 3-fix bundle of the audit's highest-priority + lowest-
effort findings. **3 of 8 P1 findings shipped this session.** The full
audit + implementation status delta lives at
`docs/SECURITY-AUDIT-2025-01.md`.

### 1. Audit doc is a point-in-time record + delta layer

`docs/SECURITY-AUDIT-2025-01.md` was written as the closure artifact
of the read-only audit (Codebase HEAD `676d2ab`). The findings
themselves are NEVER edited — they remain a historical snapshot.
Post-audit implementation progress is tracked via an **"Implementation
Status" delta table at the top** of the same doc, referencing commit
SHAs for fixed items + deferral rationale for the rest.

Future security audits should follow the same pattern: name the file
`docs/SECURITY-AUDIT-YYYY-NN.md` (next would be `2025-02`), preserve
the original findings verbatim, layer implementation status on top.
Audit history is its own form of value — rewriting it loses context.

### 2. `crypto.timingSafeEqual` is the standard for secret comparison

Phase 14.3 fix #1 (commit `4eaaa70`) — WhatsApp webhook secret
comparison was switched from plain `!==` to `timingSafeEqual` from
`node:crypto`. **All future secret/key/token comparisons in the
codebase MUST use `timingSafeEqual`**, NOT `===`/`!==`. Plain JS
equality is variable-time and leaks the comparison position via
network timing.

**Length-guard is mandatory before `timingSafeEqual`** — it throws
`RangeError` on unequal-length buffers, and that throw itself becomes
a timing oracle differentiating the length-mismatch path from the
equal-length-mismatch path. The canonical pattern:

```ts
const aBuf = Buffer.from(provided, 'utf8');
const bBuf = Buffer.from(expected, 'utf8');
if (
  !expected ||                          // empty-secret guard
  aBuf.length !== bBuf.length ||        // length-guard BEFORE timingSafeEqual
  !timingSafeEqual(aBuf, bBuf)
) {
  return unauthorized();
}
```

Length leakage is acceptable: guessing a JWT's length is trivial;
guessing its bytes is what we prevent. Already-applied in
`app/api/dashboard/sales/whatsapp/webhook/route.ts:51-74`.

### 3. PostgREST `.or()` user input MUST be escaped

Phase 14.3 fix #2 (commit `7abad17`) — legacy sales-leads search input
flowed raw into `.or()` filter strings, letting authenticated agents
inject `assigned_to.neq.self` to bypass the agent-scope clause.
**ALL `.or()` calls that include user input MUST use the canonical
escape pattern** documented in `lib/utils/path.ts`:

```ts
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';

if (search) {
  const safe = escapePostgrestValue(`%${escapeLike(search)}%`);
  query = query.or(`name.ilike.${safe},phone.ilike.${safe},...`);
}
```

`escapeLike` escapes `%`, `_`, `\` (LIKE wildcards).
`escapePostgrestValue` wraps the result in double-quotes + escapes
any pre-existing quotes — preventing the attacker from closing the
quoted literal early. PostgREST treats the entire quoted token as a
single literal ilike pattern; commas and dots inside are NOT parsed
as filter syntax.

Single-column `.eq()`/`.in()`/`.gte()` calls are safe (parameter
binding is automatic). The injection vector is ONLY `.or()` /
`.filter()` / `.match()` which take filter strings.

Pre-fix audit: 21 `.or()` calls in the codebase. 4 had raw injection
(fixed in commit `7abad17`). 1 more had partial sanitization (WA
conversations route — P2 in audit, deferred to v1.1).

### 4. `PASSWORD_MIN_LENGTH` is the single source of truth

Phase 14.3 fix #3 (commit `125104e`) — password length minimums were
inconsistent across 17 surfaces (6/8/12 chars depending on UI).
Now centralized in `lib/constants/auth.ts`:

```ts
export const PASSWORD_MIN_LENGTH = 8;
```

**ALL password validation MUST import this constant**, both server-
side (API route validation) AND client-side (form input `minLength`
attrs + JS submit-gate length checks + toast/setError messages via
template-literal interpolation `${PASSWORD_MIN_LENGTH}`).

**Documented exceptions** (intentional hardcoded values):
- `lib/config/module-guide.ts` — module-guide tip text is plain data
  config without runtime templating; hardcoded "8 أحرف" is acceptable
  because the file is reviewed when constants change.
- `docs/IMPLEMENTATION-EMPLOYEE-SYSTEM.md` + `docs/SECURITY-AUDIT-
  2025-01.md` — historical documentation, intentionally NOT
  edited when constants change.

If `PASSWORD_MIN_LENGTH` is raised in the future (e.g. → 12), the
3 documented exceptions are the ONLY surfaces requiring manual
text update — every other site auto-tracks via the import.

**Value choice rationale (8 chars):** NIST SP 800-63B minimum, balance
of security + UX for the small Pyramedia team, matches the existing
dashboard profile pw-change → least churn. Abdou confirmed during
Phase 14.3 fix-bundle session.

### 5. Local shadow constants are forbidden

Reviewer surfaced two cases during the Phase 14.3 fix #3 sweep:
- `components/crm/customer/customer-convert-modal.tsx` declared its
  OWN `const PASSWORD_MIN_LENGTH = 6;`
- `app/api/crm/leads/[id]/convert-to-customer/route.ts` declared
  `const PORTAL_PASSWORD_MIN_LENGTH = 6;`

Both were removed and replaced with the canonical import.

**General rule:** any shared invariant (password length, file size
caps, rate limits, timeout values, max retries) MUST be imported
from `lib/constants/`. Inline literals AND local re-declarations both
violate the single-source-of-truth principle and cause drift over
time. If a literal is unique to one file (e.g. a one-off magic
number), prefer a top-of-file `const NAME = N;` comment-explained
declaration — but never duplicate a name that exists in
`lib/constants/`.

### 6. Task descriptions are plain text — no markdown rendering

Phase 14.3 second-wave Fix B (commit `fa30e3a`) — the boards task
sheet at `components/boards/task-sheet.tsx` previously rendered
task descriptions via `dangerouslySetInnerHTML` + 5 regex passes
to convert markdown to HTML. That path was XSS-vulnerable: text
NOT matched by the regexes was preserved verbatim, so payloads
like `**foo**<img src=x onerror=alert(1)>` executed.

**Locked decision (Abdou):** Pyramedia doesn't need markdown in
task descriptions. Plain-text rendering only. Existing descriptions
with markdown syntax become literal characters — the `**bold**`
shows as 5 literal asterisks.

The view-mode rendering pattern is:
```tsx
<div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
  {task.description}
</div>
```
React auto-escapes; `whitespace-pre-wrap` preserves line breaks;
`break-words` wraps long URLs (which are no longer linkified);
`leading-relaxed` provides comfortable line-height for plain text.

The textarea placeholder + hint were updated to reflect the new
behavior so users don't try to use markdown syntax that no longer
works.

**Generalized principle:** any user-input field rendered to other
users (task descriptions, comments, notes, messages) should default
to plain-text via `{value}` in JSX. If markdown becomes a real
business need, ship it via a vetted library (`react-markdown` with
`remark-gfm` + `rehype-sanitize`) — NEVER via regex-based HTML
generation. The Phase 14.1 observability layer's PII redaction +
auto-escape via React JSX text nodes is the canonical safe path.

### 7. Supabase JS filter-builder semantics — reassignment is load-bearing

Phase 14.3 second-wave Fix A (commit `0825f54`) — Reviewer surfaced
this pre-existing bug at `app/api/dashboard/sales/leads/route.ts`.
The `countQuery` was declared `const countQuery = supabase.from(...)
.select(..., { count: 'exact', head: true });` then chained with
`countQuery.eq(...)` without reassignment.

**Critical: Supabase JS filter methods (`.eq`, `.in`, `.gte`,
`.or`, `.match`, etc.) return a NEW PostgrestFilterBuilder rather
than mutating in place.** Without reassignment, every filter is
silently discarded.

The canonical pattern (already correct in most places):
```ts
let query = supabase.from('table').select('*');
if (filter1) query = query.eq('col1', value1);
if (filter2) query = query.eq('col2', value2);
```
NOT:
```ts
const query = supabase.from('table').select('*');
if (filter1) query.eq('col1', value1);  // ← SILENTLY DISCARDED
```

**Impact when wrong:** count queries return unscoped totals →
non-admin users see global counts in pagination. Verified
production bug pre-Fix-A: total leads = 29; sayed had 27, elharm
had 2 — pre-fix both agents saw `total=29` in their pagination
totals.

**Recurring review focus:** any new filter chain on Supabase
queries must use `let` + reassignment. Pattern is now grep-able:
`const \w+Query = supabase` followed by `\1\.\w+\(` without `\1 =`
is a code-smell.

### Phase 14.3 v1.1 backlog

See `CRM-PROGRESS.md` → "Phase 14.3 v1.1 items" — 3 remaining P1s
(2FA encrypt, 2FA enforce, GDPR export + erasure deferred with
explicit business rationale; 1 rate-limit deferral) + 10 P2s +
1 unknown (Coolify Postgres backup encryption — needs Abdou
verification). 5 of 8 audit P1s + 1 Reviewer-bonus bug fix shipped
across the two fix-bundle sessions (2026-05-15 + 2026-05-16).

## Audit Gap #4 — `sales_leads.manage` misleading name (documented, rename deferred)

**Decision (2026-06-19, Option B):** document, do NOT rename now. `sales_leads.manage`
gates 9 routes across 7 files + 3 `rbac.ts` definitions + the live "Sales" DB role.
Despite the `.manage` suffix it does **NOT** grant manage-all — every gated route
ALSO enforces own-lead scope (`canAccessLead` / own-lead filter) and the leads LIST
endpoint scopes by `sales_leads.view` + own-lead filter, so agents only ever touch
their OWN leads. It's **P2 hygiene (no security hole), just a badly-named permission.**

A bare rename carries a real **403 risk**: permissions resolve from the DB role, so a
code/DB mismatch window during deploy would lock the 3 agents out of all 9 routes. The
proper fix is a 3-step zero-downtime migration (accept both → flip gates → drop old),
bundled with the **broader `sales.*` rename** already deferred in Phase 12 decision #4.

**v1.1 backlog:** rename `sales_leads.manage` → `sales_leads.update` as part of the
sales.* rename pass, via the zero-downtime alias migration. Clarifying comment lives at
the `SALES_LEADS_MANAGE` definition in `lib/auth/rbac.ts`.

## Audit Gap #3 — DB exposure remediation (2026-06-19) — P0, partially closed

**The incident (P0, proven live-exploitable):** 115/125 `pyra_*` tables had RLS
OFF and the `anon` + `authenticated` Postgres roles held **full DML grants** on
all 125. The `anon` key is public (client bundle + public repo). Net:
**anyone on the internet could read/write the entire DB via PostgREST**, bypassing
every app-layer permission/scope check. Proven: `GET /rest/v1/pyra_clients` with
only the anon key returned `HTTP 200 + data`. Worst exposure: `pyra_settings`
held the **live Stripe secret key**, Stripe webhook secret, and SMTP password.

**Git history: CLEAN** — verified no real secret was ever committed (`.env`/
`.env.local` never tracked; only `.env.example` placeholders; `__tests__/env.test.ts`
JWTs are dummies, hash ≠ real keys). The ONLY exposure vector was the DB hole.

### ✅ Phase 0 — DONE & verified (closed the internet hole)
`REVOKE ALL PRIVILEGES ON ALL TABLES/SEQUENCES IN SCHEMA public FROM anon;` +
`ALTER DEFAULT PRIVILEGES ... REVOKE ... FROM anon;`. Verified: anon probe →
`HTTP 401 permission denied` (was 200); `authenticated` retained (app's auth path
+ dashboard realtime depend on it); service_role untouched; kassem login confirmed
working. **Safe because** no code path reads tables as `anon` (portal/external/
Stripe/share-token = service role; dashboard = authenticated post-sign-in). Only
casualty: portal realtime notif pop (anon `postgres_changes` on
`pyra_client_notifications`) degrades to refresh/poll — itself part of the hole.

### ✅ Phase 1 — DONE & verified (locked the secrets table)
`pyra_settings` had its 2 authenticated readers switched to service role
(`app/api/settings/route.ts` GET+PATCH, `app/api/dashboard/route.ts` max_storage
read — commit `443ffd2`, deployed first), THEN
`REVOKE ALL PRIVILEGES ON TABLE public.pyra_settings FROM authenticated;`. Now
**service-role-only** (anon + authenticated both gone). Verified: only
`postgres`/`service_role`/`supabase_admin` retain grants; service read works (34
rows); anon REST → 401. The other 25 `pyra_settings` readers were already service
role.

### ⏳ DEFERRED — precautionary secret rotation (low priority, do when free)
These were briefly DB-readable while the hole was open (Stripe/everything since
inception; the SMTP pass I added ~30 min). **Stripe dashboard logs are CLEAN** (no
unfamiliar charges/refunds/payouts) and Stripe is rarely used → low priority, but
rotate as precaution. Rotation needs manual dashboard/mail-server work (Abdou):
- **`stripe_secret_key`** (LIVE `sk_live_`): roll in Stripe → Developers → API
  keys → paste new key → update `pyra_settings.stripe_secret_key` (service-role
  `pg/query` or admin Settings UI). App picks it up **next request** (no redeploy
  — `lib/stripe.ts` auto-rebuilds on key change).
- **`stripe_webhook_secret`**: roll in Stripe → update. Live next request.
- **`smtp_pass`**: change on mail server → update. ⚠️ **needs a redeploy** to take
  effect — `mailer.ts` caches the transporter keyed on `host:port:user:allowInsecure`
  (NOT pass). **v1.1 fix (1 line): add the pass to that cache key** so future pass
  changes auto-pick-up; fold in when next touching `mailer.ts` (cert renewal).
- `stripe_publishable_key` — public by design, no rotation.

### 📋 PENDING — Phase 2 (least-privilege) + Phase 3 (storage), structural
- **Phase 2 Tier-1 + Tier-2 — ✅ DONE:** revoked `authenticated` on **18 sensitive
  tables** now service-role-only — Tier-1 (12, zero-migration): api_keys, cards,
  payments, contracts, credit_notes, purchase_orders, suppliers, evaluations,
  subscriptions, recurring_invoices, revenue_targets, business_entities; Tier-2 (6,
  after switching their session-client readers to service role): payroll_runs,
  payroll_items, employee_payments, error_logs, sessions, login_attempts. Plus a
  real **payroll authz leak fixed** — `GET /payroll` + `/payroll/[id]` now require
  `payroll.manage` (were `payroll.view` = every employee → all salaries); employees
  keep their own payslip via `my-payslips`/`payslip` (self-scoped).
- **Phase 2 FULL — 📋 deferred v1.1 (MEDIUM):** the remaining `authenticated` grants
  on the other ~107 tables. Locking them needs migrating ~87 pure + ~40 mixed
  session-client (`createServerSupabaseClient().from()`) routes to service role +
  handling the auth-path `pyra_users`/`pyra_roles` reads + dashboard realtime
  tables (need authenticated SELECT). **~90–120 file migration → staged.** Only the
  ~7 logged-in internal users can over-read via PostgREST (NOT internet-wide).
- **Phase 3a — ✅ DONE:** lead attachments (client PII) moved to a new **PRIVATE**
  bucket `pyra-private` + served via 1h **signed URLs** (`createSignedUrl`, viewer
  refetches on expiry). 0 existing rows → clean cutover, zero blast radius.
- **Phase 3b — 📋 deferred v1.1 (MEDIUM):** make `pyraai-workspace` itself private
  (248 file-manager project/client docs auto-secured — the file manager already
  signs) + migrate display-asset stored URLs (avatars/branding/entity-logos: store
  path + sign-on-read, or a dedicated public assets bucket) + WhatsApp media
  long-TTL signed URL + **fix the `send-pdf` route targeting the non-existent
  `files` bucket** (likely already broken). Paths are unguessable nanoids, so the
  remaining exposure is MEDIUM, not enumerable.

**Invariant for all remaining phases:** any `REVOKE`/RLS change on `authenticated`
must be preceded by deploying the code that stops reading those tables as
`authenticated` — never revoke against live code that still depends on the grant.

---

## Identity-table hardening — Locked Decisions (2026-08-08)

Closes the `pyra_users` / `pyra_roles` cluster that Phase 2 FULL had deferred.
Migrations **059**, **060**, **061**. Every claim below was proven live against
production from a real non-admin session before and after each change.

### The exposure, as measured (not estimated)

`pyra_users`, `pyra_roles`, `pyra_auth_mapping` and `pyra_salary_history` all had
**RLS off, zero policies, zero triggers**, and granted `authenticated` full DML.
With no RLS the grant is the *only* database-level gate, so every logged-in
account had unscoped reach via PostgREST — bypassing every permission check in
the application.

Proven from `test.sales` (a plain `sales_agent`, no admin rights):

```
GET   /rest/v1/pyra_users?select=username,role,salary   → 200, 15 rows with salaries
PATCH /rest/v1/pyra_users?username=eq.test.sales        → 200, role became 'admin'
PATCH /rest/v1/pyra_roles?id=eq.<Sales>                 → 200  (after 059 shipped)
```

Nothing lands in `pyra_activity_log` on any of these paths.

The deferral above rated this MEDIUM on the stated basis of "~7 logged-in
internal users". **That premise was incomplete**: three client-portal contacts
also hold Supabase Auth accounts, so the population was never staff-only.

### D-1. Revoking one table is not a fix — enumerate every table that reaches the same outcome

**059 alone was insufficient, and was reported as complete.** Revoking writes on
`pyra_users` closed "PATCH my own row, set `role='admin'`" — and left the
identical escalation one table over. `lib/auth/rbac.ts:911` returns the `['*']`
superuser set when a user's DB role row contains `'*'`, so a single PATCH on
`pyra_roles` was still a password-free path to full admin. Worse: `youssef`,
`cosette` and `test.sales` share **one** role row, so it promotes three accounts
at once.

The permission set, the identity mapping and the audit trail are each an
escalation path in their own right. **060** therefore also closed
`pyra_auth_mapping` (identity confusion) and `pyra_salary_history` (forging or
erasing the evidence of a pay change — revoked `ALL`, since it has **zero read
sites** anywhere in the codebase and holds old/new salary figures).

### D-2. Column-level, not table-level, for the read side

A full `REVOKE SELECT ON pyra_users` was measured at **~55 changes across ~30
files**, 18 of them on paths that fail *silently* — a null row reads as "user not
found", so a missed site looks like a mass logout rather than an error.

Measured instead: **37 session-side reads, 29 of which only ask for a name or a
status.** The outage risk came from **two functions**, not from breadth:
`getApiAuth()` (every API request) and `loadUserWithRole()` (every page render),
both `select('*')`.

**061** withholds 9 columns and leaves 29 readable:

> `password_hash`, `two_factor_secret`, `salary`, `salary_breakdown`,
> `hourly_rate`, `commission_rate`, `bank_details`, `national_id`,
> `date_of_birth`

`salary_currency` is granted deliberately — it holds `'AED'`/`'EGP'`, carries no
amount, and the payroll UI reads it for formatting.

Cost: **6 code changes in 6 files** instead of ~55, touching **none** of the
silent-failure paths.

### D-3. ⚠️ A column REVOKE against a table-wide GRANT is a silent no-op

```sql
REVOKE SELECT (salary) ON pyra_users FROM authenticated;   -- ❌ DOES NOTHING
```

PostgreSQL accepts this, reports success, and changes nothing — a column-level
revoke cannot subtract from a table-level grant. **Verified by running exactly
that and still reading `salary_breakdown` back.** The correct order, which 061
uses, is:

```sql
REVOKE SELECT ON public.pyra_users FROM authenticated;      -- drop the table grant
GRANT  SELECT (<29 safe columns>) ON public.pyra_users TO authenticated;
```

Anyone "simplifying" this back to a single column revoke silently re-opens the
leak. Do not.

### D-4. Auth-path reads move to the service role — and stay scope-neutral

`getApiAuth()` and `loadUserWithRole()` now read `pyra_users` via
`createServiceRoleClient()`. This is **not** a widening: RLS is off and the grant
was table-wide, so the session client already had unscoped reach. Both resolve
their lookup key from the **verified JWT**, never from request input, so each
still returns exactly one row — the caller's own.

`getApiAuth()` keeps `supabase.auth.getUser()` on the *session* client: the
identity check must remain the thing only a valid JWT can pass. Only the profile
read moved. `loadUserWithRole()` lost its client parameter entirely, which also
removed two `as any` casts.

The other four migrated reads (`/api/profile` GET, `/api/users` GET,
`/api/users/[username]` GET + PATCH-preload) were already behind
`users.view` / `users.manage`; who can call them is unchanged.

### D-5. Verified before shipping, so deliberately NOT changed

- **`count(*)` works under column-only grants** — tested. The two
  `select('*', { count: 'exact', head: true })` calls in `app/api/roles/[id]`
  need no edit.
- **No PostgREST embedded join anywhere selects a withheld column** — swept
  `app/`, `lib/`, `components/`, `hooks/`. This was the highest-risk blind spot:
  an embed like `.from('x').select('*, pyra_users(salary)')` contains no
  `from('pyra_users')` and is invisible to a naive grep.
- **`/api/auth/login`'s projection is entirely within the granted set** — login
  is untouched. Dry-run in a rolled-back transaction confirmed the exact login
  query succeeds while `salary` and `bank_details` are denied.

### D-6. Test accounts, not real employees, prove security work

`test.sales` and `test.admin` exist in production (`scripts/create-test-accounts.ts`,
credentials in the gitignored `.env.test.local`). Signing in as a real sales agent
rotates their device key and **kills the call-tracking app on their phone** — so
non-admin verification had no safe path before these existed.

Two reusable probes ship with this work:
- `scripts/_exploit-probe.ts` — attempts the salary read and the self-promotion,
  and reverts the role itself.
- `scripts/_role-escalation-probe.ts` — writes the role's **existing colour back
  to itself** and never touches `permissions`, then re-reads them to prove no
  drift. A probe that could really promote someone is not an acceptable probe.

### D-7. Ordering is not advisory

Each migration ran **only after** its code was deployed and confirmed live via
`built_at` in `GET /api/health`, and each was followed by a full before/after
functional sweep (login · own profile · admin user list · admin user detail ·
inbox · directory · page render) that had to match the baseline exactly.
Reversing the order takes production down: without the code, 061 alone 401s every
API request and loops every page back to `/login`.

### Corrections to the record above

- **Phase 2 FULL's "auth-path `pyra_users`/`pyra_roles` reads" blocker is now
  cleared.** Remaining: **119 tables** still grant `authenticated`.
- **Phase 3b's stated premise is factually wrong.** It defers the public bucket
  on the grounds that "paths are unguessable nanoids". A sample of 45 stored
  paths in `pyraai-workspace` returned **zero** random names — they are plain
  client and project names (`shared/clients/etmam/…`, `projects/injazat/…`).
  Three anonymous downloads with no key and no cookie returned HTTP 200,
  including a **signed client contract** (314,640 bytes). 279 objects / 838 MB
  are affected. Directory listing IS blocked, so it is not browsable — but it is
  guessable, which the deferral assumed it was not. Re-rate accordingly.
- Phase 3b's suspicion that `send-pdf` targets a non-existent `files` bucket is
  **confirmed**: only `pyraai-workspace` and `pyra-private` exist, and none of
  the 21 outgoing document messages came from that path.
