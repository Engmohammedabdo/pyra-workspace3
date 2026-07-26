# Platform — Locked Decisions Archive

Observability, DB migration strategy, documentation system, and production tracking.

> **Archive of locked decisions.** These were settled after audit → design → implementation → review, and are recorded so they are **not re-litigated**.
> `CLAUDE.md` carries a one-line index of everything here; open this file when the index says a decision touches what you are about to change.

## Contents

- [Phase 14.1 — Locked Decisions](#phase-141-locked-decisions)
- [Phase 17 — Locked Decisions (Documentation Polish)](#phase-17-locked-decisions-documentation-polish)
- [Phase 14.2 — Locked Decisions](#phase-142-locked-decisions)
- [Remote Production Tracking — Locked Decisions (2026-07-03)](#remote-production-tracking-locked-decisions-2026-07-03)

---

## Phase 14.1 — Locked Decisions

These are **intentional, documented design choices** locked during
Phase 14.1 closure (Observability). **Do NOT re-litigate.** Phase 14.1
is post-CRM-rebuild infrastructure work — self-contained error log
layer replaces external Sentry (no DSN, no third-party service, no
egress). All server-side errors funnel through `logError()` into
`pyra_error_logs`; admin viewer at `/dashboard/admin/error-logs`
provides triage + resolve workflow.

### 1. Self-contained observability (no Sentry)

User-revised mid-session decision: skip Sentry entirely, build the
observability layer in-house using Supabase as the backing store.
**Rationale:** external service dependency + DSN management is
complexity Abdou doesn't want. The workspace already has Supabase;
reuse it.

The trade-off accepted: no third-party error aggregation /
deduplication / alert routing in v1. Admin viewer is the only triage
surface. v1.1 may add severity grouping + dedup if volume grows.

### 2. `logError()` contract — fire-and-forget, never throws

`lib/observability/log-error.ts` exports `logError({ severity?, error,
request?, user?, metadata? }): void`. The function:

- Returns `void` synchronously (not a Promise) so callers can use it
  inside cron loops without await
- IIFE-detaches the actual Supabase write — outer try/catch is the
  absolute backstop
- Mirrors to `console.error/warn/info` so Coolify logs always show
  errors even when the DB write fails
- 5-layer PII redaction applied BEFORE insert (see Phase 14.1
  decision 4 below)
- Never recursively calls itself — insert failures use raw
  `console.error` (avoid infinite-loop risk if the logger itself is
  the broken path)

**Cron-safe invariant:** cron per-row try blocks rely on `logError`
never propagating errors. Documented at file top of the cron routes.

### 3. `apiServerError(message?, err?, request?)` backwards-compat

The 722 existing callers (audit count at Phase 14.1 Commit 2 time)
pass 0 or 1 argument. The new optional `err` + `request` params let
callers opt into observability without touching the rest of the
codebase:

```ts
// Pre-Phase-14.1 (still works unchanged):
catch (err) {
  console.error(...);
  return apiServerError();
}

// Phase 14.1 high-risk routes (8 callers explicitly upgraded):
catch (err) {
  logError({ error: err, request, user: { id, role }, metadata: {...} });
  console.error(...);
  return apiServerError();
}

// Other routes can opt in incrementally:
catch (err) {
  return apiServerError('custom message', err, request);
}
```

**Why not `user` in `apiServerError`?** Adding a 4th param would
require every catch to pass auth context — 722 site touches. Routes
that need user context call `logError` explicitly (where `auth` is
already in scope).

### 4. Five-layer PII redaction

Applied in order at insert time inside `logError`:

1. **Noise drops** — message matches `/^Unauthorized$/i`, `/^CSRF
   token mismatch$/i`, or `/^Forbidden$/i` → row NOT inserted at all
   (security noise, not real errors)
2. **Email regex** — `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g`
   → `[EMAIL]`
3. **Phone regex** — `/(?<![a-zA-Z0-9])\+?\d{7,15}(?![a-zA-Z0-9])/g`
   → `[PHONE]` (lookbehind/ahead prevents catching IDs/tokens that
   happen to contain long digit runs)
4. **Sensitive key fragments** — metadata keys containing `phone`,
   `email`, `password`, `token`, `secret`, `apikey`, `api_key` →
   entire VALUE replaced with `[REDACTED]`
5. **Sensitive header allowlist** — headers named `authorization`,
   `x-api-key`, `apikey`, `stripe-signature`, `cookie` → value
   replaced with `[REDACTED]` before going into
   `metadata.request_headers`

**Admin viewer does NOT de-redact.** Rows render AS-STORED — no
"expand original" feature, no fetch to a "raw" endpoint, no
client-side state that reverts the redacted strings.

### 5. Beacon endpoint for Client Component error boundaries

Both `app/dashboard/error.tsx` and `app/portal/(main)/error.tsx`
are Client Components (`'use client'`). They CANNOT call `logError()`
directly because `createServiceRoleClient()` reads
`SUPABASE_SERVICE_ROLE_KEY` which is server-only.

**Solution:** POST `/api/observability/log-client-error`. The route
auth-gates the request (dashboard Supabase Auth session OR portal
cookie session → either accepted; anonymous → 401), then funnels
the payload through `logError()` server-side. PII redaction +
5-layer pipeline inherited verbatim.

**Middleware exemption required:** the middleware Supabase-Auth
block (line 136 of `middleware.ts`) needed `!pathname.startsWith
('/api/observability')` so portal cookie sessions reach the beacon's
own auth gate. The route's own auth check is the canonical gate;
CSRF protection still covers all POST/PATCH/PUT/DELETE.

### 6. Append-mostly DB shape (no trigger, no `updated_at`)

`pyra_error_logs` has NO `updated_at` column and NO trigger. The
only update path is admin marking a row resolved (writes
`resolved`, `resolved_at`, `resolved_by`, `resolved_notes`
explicitly). Append-mostly design — preserves audit integrity, no
hidden mutation paths.

### 7. RBAC permission naming: `error_logs.{view,manage}`

NOT `admin.error_logs.{view,manage}` (which the user's spec
literally said). Q2(a) lock at Phase 14.1 Commit 3 closure:
permissions follow the codebase convention (`module.action`),
matching `sessions.view`, `activity.view`, `reports.view`. Admin-only
semantic is enforced by role assignment, not by name prefix.

### 8. Sheet detail view (Phase 10 pattern reused)

The admin viewer's row-detail panel uses `<SheetContent side="right">`
— visual LEFT in RTL (matching Phase 10 lead-sidebar mobile pattern +
Phase 14.1 admin observability). The Sheet primitive at
`components/ui/sheet.tsx` is the workspace standard for all
slide-out / bottom-sheet UX.

### Implementation invariants (locked, do NOT regress)

- **`logError` is server-only.** Client Component error boundaries
  POST through `/api/observability/log-client-error` — they CANNOT
  import `logError` directly.
- **`apiServerError` signature must remain backwards-compatible.**
  Adding required params (or changing param order) breaks 722
  callers in one stroke.
- **Defense in depth: 4 gates before any anonymous row reaches
  `pyra_error_logs`.** CSRF (middleware) → Supabase Auth
  (middleware) → route-level `requireApiPermission` → DB CHECK
  constraints. Verified post-deploy with 0 anonymous rows after
  multiple probe rounds.
- **`error_logs.manage` is required for PATCH** — `error_logs.view`
  is NOT sufficient. Different permission strings, separately
  checked.
- **Detail panel renders metadata verbatim** — no de-redaction path,
  no "expand original" button.
- **The Sheet `side="right"` is canonical RTL pattern.** Don't swap
  to `side="left"` — that breaks the visual layout in dir=rtl.

### Phase 14.1 v1.1 backlog

See `CRM-PROGRESS.md` → "Phase 14.1 v1.1 items" — TTL prune cron,
severity grouping/dedup, `apiServerError` user-context plumbing,
broader `mutateAPI` audit, magic-byte file validation.

## Phase 17 — Locked Decisions (Documentation Polish)

These are **intentional, documented design choices** locked during
Phase 17 closure (scoped Documentation Polish). **Do NOT re-litigate.**
Phase 17 covers 2 substantive commits + 1 closure: user guides for
critical CRM paths + admin guides for the admin surface. Full API
docs + onboarding tooltips were explicitly scoped OUT (Q17-3 (b) =
critical paths only).

### 1. Single source of truth for in-app docs = `lib/config/module-guide.ts`

All user-facing + admin-facing documentation lives in the
`MODULE_GUIDES` map, exposed via two surfaces:
- `<PageGuide>` popover from `components/ui/page-guide.tsx` — appears
  in the topbar on every dashboard page, auto-detects the route, and
  shows the matching entry's description + goal + tips
- `/dashboard/guide` page — searchable directory of ALL entries
  grouped by section

**Rule:** DO NOT create parallel in-app doc surfaces (separate `/docs`
pages, markdown files surfaced as React components, onboarding modals
that duplicate guide content). They drift from the implementation
within weeks. Future deep-dive docs live in `docs/*.md` (developer
reference) and are LINKED-TO from module-guide entries when relevant
(e.g. backup-procedure entry references `docs/MIGRATIONS.md §10`).

### 2. Tip depth standard = 6-10 actionable items per entry

Phase 17 calibration: the previous ~3-4 tips per entry was too thin
for critical paths. New tips MUST be:
- **Sentence-length workflow walkthroughs**, not labels
  - ❌ "إضافة مهمة"
  - ✅ "إنشاء سريع: اضغط '+ إضافة مهمة' (h-11 touch target) → اكتب العنوان → اختر موعد + أولوية → 'إضافة'"
- **Include concrete UI-element references** ("اضغط الـ ⋮ (3 نقاط)"
  / "افتح Sheet" / "scroll مع flash برتقالي لمدة ثانيتين")
- **Call out related Phase locks where relevant** — e.g. the
  `error-logs` guide mentions Phase D-3 retention; the
  `extra_permissions` warning in the `/dashboard/users` guide
  mentions Phase D-1 whitelist rule

This ensures the in-app docs stay in sync with the code's behavioural
contracts as they evolve.

### 3. Pseudo-entries are valid for cross-cutting admin reference

Phase 17 introduced two pseudo-entries:
- `/dashboard/admin/backup-procedure`
- `/dashboard/admin/security-checklist`

These are NOT real routes. Their `href` points to the nearest existing
admin landing page (`/dashboard/admin/error-logs` in this case). They
serve as **searchable reference content** inside the guide system for
cross-cutting topics that don't fit any specific UI surface but
benefit from in-app discoverability.

**Use sparingly.** Only for content that:
- Doesn't fit a specific page (e.g. operational procedures, security
  references)
- Has admin-only audience (so showing it in `<PageGuide>` on every
  page would be noise)
- Benefits from being searchable in the guide directory

DO NOT create pseudo-entries for user-facing topics — those should
land on the real route they relate to.

### 4. Tip language: Arabic narrative with English technical terms inline

Mirror the codebase's "Arabic UI + English code" convention:
- Arabic for the narrative flow ("استخدم", "اضغط", "افتح", "كل")
- English for code / UI elements / API terms (`extra_permissions`,
  `WhatsApp Instance`, `is_done_column`, `escapePostgrestValue`,
  `timingSafeEqual`)
- Mixed in the same sentence is fine and idiomatic for the
  codebase: "اضغط '+ إضافة مهمة' (h-11 touch target)"

### 5. Deferred scope is EXPLICIT, not implicit

Phase 17 explicitly scoped OUT (Q17-3 (b)):
- Full API documentation (`docs/API.md`)
- Onboarding tooltips / welcome tour

Both have v1.1 backlog entries in `CRM-PROGRESS.md` describing the
expected shape. The closure docs are explicit so future sessions
don't re-discover this scope without context.

### Phase 17 v1.1 backlog

See `CRM-PROGRESS.md` → "### Phase 17 v1.1 items" for the full list.
Highlights: API docs (English, `docs/API.md`-style), onboarding tour,
doc-as-code linting, module-guide entry generator (`pnpm guide:new`),
keyboard-shortcuts overlay, English-tips localization.

---

## Phase 14.2 — Locked Decisions

These are **intentional, documented design choices** locked during
Phase 14.2 closure (DB Migrations Strategy). **Do NOT re-litigate.**
Phase 14.2 is post-CRM-rebuild infrastructure work — establishes the
canonical version-tracking table + drift detection + pre-migration
backup workflow that all future migrations rely on.

### 1. Forward-only migrations (no auto-down)

The Pyra migration system does NOT run down-scripts automatically.
Reverting requires either (a) a new forward migration that reverses
the effect OR (b) restoring from a `pnpm db:backup pre-NNN` snapshot.
Industry trend (Rails 7+, Prisma) is the same — auto-down is too
dangerous when data is involved.

The `-- DOWN` block in `supabase/migrations/_template.sql` is
informational only. Inline rollback hints are double-commented (`-- --`)
so they cannot be accidentally executed by copy-paste into pg/query.

### 2. `pyra_schema_migrations` as canonical version tracker

Single source of truth: `(version, applied_at, applied_by, checksum,
notes)`. Migration 017 establishes the table + backfills rows for
001-016 retroactively with `applied_by='bootstrap'`.

**Append-mostly schema** — no `updated_at`, no trigger. The only
mutation path is `pnpm db:record --force` (explicit re-record after a
legitimate file change). Preserves audit integrity.

**Checksum is LF-normalized SHA-256** — `content.replace(/\r\n/g, '\n')`
before hashing. Both `db-record-migration.ts` and `db-check-drift.ts`
use identical normalization. Windows CRLF and Linux LF produce the same
hash; drift detection has no false positives from line-ending changes.

### 3. Apply-then-verify-then-record workflow

**`pyra_schema_migrations` is a historical record, not a confirmation
of success.** Recording a row without verifying creates fake success
entries that drift detection trusts.

Mandatory sequence (per `docs/MIGRATIONS.md` §6 + §7):
1. Apply the migration via `curl /pg/query`
2. **Manually verify** the changed schema (query columns, indexes,
   CHECK constraints, backfill row counts)
3. ONLY THEN run `pnpm db:record <version> --by=<u> --notes="…"`

Skipping step 2 is a docs violation, not a tooling block — but the
runbook calls it out explicitly. v1.1 may add a `--require-verify`
flag that prompts the dev before recording.

### 4. Backup-before-migrate workflow

`pnpm db:backup pre-NNN` before every Risk tier 2 migration (touches
existing data). Recommended for tier 1 too — cost is trivial (32 MB DB
→ ~5 MB compressed snapshot).

Backups land in `backups/` (gitignored). Restore via `gunzip -c
backups/{file}.sql.gz | psql "$SUPABASE_DB_URL"`. Offsite storage is
deferred to v1.1 (S3 via Coolify's object-storage integration); v1 is
local-only by design — Abdou's call when offsite becomes worth the
maintenance.

`pg_dump --schema=public --no-owner --no-acl --exclude-table-data=
pyra_error_logs --exclude-table-data=pyra_activity_log | gzip`. Audit
tables retain schema but drop row data (regenerable, would bloat the
dump on long-lived prod).

### 5. Three pnpm tooling commands

```bash
pnpm db:backup [<label>]                                    # pre-migration snapshot
pnpm db:record <version> [--by=<u>] [--notes="…"] [--force] # record after manual verify
pnpm db:check-drift                                          # 3-category triage
```

Scripts invoked via `npx tsx` (TypeScript) and `bash` (Bash) — `tsx`
isn't a project devDep, `bash` is invoked explicitly because PNPM on
Windows routes through cmd.exe which can't execute `.sh` files directly.

### 6. Service-role key from `.env.local` ONLY

Both `db-record-migration.ts` and `db-check-drift.ts` read
`SUPABASE_SERVICE_ROLE_KEY` exclusively via `readFileSync('.env.local',
'utf8')` + regex extract. **Reading from `process.env` or CLI args is
explicitly forbidden** — shell history exposure risk.

`db-backup.sh` follows the same pattern for `SUPABASE_DB_URL` (Bash
quote-stripping via `sed -e 's/^["\x27]\(.*\)["\x27]$/\1/'`).

**Intentional asymmetry:** `db-record-migration.ts` accepts
`ABDOU_USERNAME` env fallback for the `--by` field. Documented inline
— a username is non-sensitive; standard shell-env pattern (like `$USER`
or `$LOGNAME`) is fine here. The service-role key is the only secret
treated as file-only.

### 7. Label sanitization (`db-backup.sh`)

Regex `^[a-zA-Z0-9._-]+$` + extra `..` check (belt-and-braces against
path traversal). Anchored full-string match, hyphen at end of character
class (literal, not range). Rejects spaces, `$`, `` ` ``, `;`, `|`,
`&`, `/`, parens, quotes, etc. — any shell metacharacter or filesystem
traversal.

The label appears in exactly 2 places after validation: the `..` check
(read-only comparison) and the filename construction
`backups/${TS}_${LABEL}.sql.gz`. Never interpolated into a command
string. No shell-injection surface.

### 8. `001_employee_system_bootstrap.sql` for fresh-DB setup

Pre-existing `scripts/migration-employee-system.sql` was renamed via
`git mv` (preserves 85% similarity in history) + had a bootstrap
header prepended. Fills the 001 number gap that existed since project
inception. Production DB has it applied via pre-Pyra deployment;
`applied_by='bootstrap'` records it retroactively.

**Fresh DB setup order:** 001 → 002 → … → highest existing migration,
each via `curl /pg/query`. Then loop-record via `for migration in
supabase/migrations/0*.sql; do pnpm db:record ...`. v1.1 may add a
`pnpm db:bootstrap` wrapper.

### 9. Staging environment deferred to v1.1

**Triggers** (documented in `docs/MIGRATIONS.md` §1):
- A destructive migration enters scope (DROP COLUMN with live data
  dependency, irreversible column-type change)
- A second developer joins the codebase

Until then: 32 MB DB + 1-dev workflow + high idempotency hygiene
makes staging cost > value. The backup script provides the rollback
insurance that staging would have provided.

### 10. Concurrent migration assumption

v1 trusts the single-developer workflow. No `pg_advisory_lock` on
`pnpm db:record`. Two devs applying simultaneously = race condition.

v1.1 adds the advisory lock when a second developer joins. Documented
in `docs/MIGRATIONS.md` §12 with the upgrade snippet.

### 11. Order enforcement is advisory

`pyra_schema_migrations` does NOT reject out-of-order INSERTs.
Numbers are advisory; the system trusts the developer to apply in
order. **Why not enforce?** A `BEFORE INSERT` trigger that checks
`version - 1 exists` would block retroactive recording (the Phase 14.2
backfill of 001-016 would fail) and break the bootstrap flow.

v1.1 adds an order-gap warning to `pnpm db:check-drift`: if version
020 exists but 019 doesn't, the script prints a warning (but doesn't
fail). Documented in `docs/MIGRATIONS.md` §13.

### Implementation invariants (locked, do NOT regress)

- **LF-normalization is byte-for-byte identical** between
  `db-record-migration.ts` (line 129) and `db-check-drift.ts` (line 64).
  Both use `raw.replace(/\r\n/g, '\n')` before `createHash('sha256')`.
  Drift between the two breaks all drift detection.
- **The service-role key is never logged.** No `console.log` of the
  key in any error path of any script.
- **Migration 017 does NOT self-record.** The `pnpm db:record
  017_pyra_schema_migrations` step happens manually post-apply — keeps
  migration SQL focused on schema and exercises the canonical tooling.
- **The 001 bootstrap is INTENTIONALLY different content from the
  original `scripts/migration-employee-system.sql`** — the rename
  added a 22-line header banner. The 85% similarity score from `git
  mv` reflects this. The new SHA-256 (`3fd2864d…`) is the canonical
  baseline; the pre-rename checksum is NOT in `pyra_schema_migrations`.

### Phase 14.2 v1.1 backlog

See `CRM-PROGRESS.md` → "Phase 14.2 v1.1 items" — staging environment,
`pnpm db:apply` wrapper, `pnpm db:bootstrap` for fresh DB, advisory
lock for concurrent migration safety, order-gap warnings in
`db-check-drift`, offsite backup to S3, pg_dump availability pre-flight
check, optional pre-commit drift hook.

## Remote Production Tracking — Locked Decisions (2026-07-03)

These are **intentional, documented design choices** locked during the Remote
Production Tracking implementation (production KPIs for a remote video/content
team — pipeline boards → task stage journeys → productivity metrics). **Do NOT
re-litigate.** Full design at
`docs/superpowers/specs/2026-07-03-remote-production-tracking-design.md`.

### 1. On-time = first review submission
A task counts "on time" based on the FIRST time it was submitted for review
(entered a `column_type='review'` column), not the final approval/delivery
timestamp. Rework cycles after that first submission don't retroactively make
an on-time task late — the deadline discipline being measured is "did the
producer submit before the deadline," not "did the whole approval chain finish
before the deadline."

### 2. Metrics are derived from stage history only — no counters
`lib/production/metrics.ts` / `lib/production/report.ts` compute ALL
productivity numbers (on-time rate, average cycle time, rework count, stage
durations) by replaying `pyra_task_stage_history` rows — there is NO
incremented counter column anywhere. Same doctrine as the Finance Remediation
`amount_billed` pattern: derive, never accumulate. This keeps the metrics
recomputable/backfillable and immune to increment-drift bugs.

### 3. Files stay on Drive/frame.io — links only, no uploads
The pipeline does not become a file-storage system. Tasks carry a
review/delivery LINK (Google Drive, frame.io, etc.) — no file upload UI, no
new storage bucket. This keeps the workspace out of large-media hosting and
matches the team's existing external-tool habits.

### 4. Gated columns enforce advance/approve server-side — raw moves rejected
Columns with `column_type` `review`/`delivery` AND `requires_approval=true`
cannot be entered via a raw drag-and-drop column move. The move route
validates the transition and rejects it unless it comes through the
advance/approve action path — this is enforced server-side (not just hidden in
the UI), so a raw `POST /api/tasks/[id]/move` column move against a gated column
is rejected (422) regardless of client behavior.

### 5. `boards.view` / `tasks.view` / `tasks.create` / `productivity.view` now in `BASE_EMPLOYEE`
These four permissions moved into `BASE_EMPLOYEE` so remote production staff get
self-service access without needing a dedicated role. Follows the existing
`BASE_EMPLOYEE` philosophy: `*.view`/`*.create` for OWN-scope self-service,
never `*.manage`.

**Permission is NOT the whole gate — board scope still applies.** The list
endpoints scope non-admins to their MEMBER boards (via `resolveUserScope` →
`scope.boardIds`), so an employee only sees boards/tasks they can actually
reach. The task sub-resource routes (`/api/tasks/[id]/move`, `/assignees`,
`/comments`, and `/boards/[id]/tasks/[taskId]/advance`) additionally enforce
board scope via the shared `checkTaskScope` / `checkBoardScope` helpers in
`lib/auth/task-scope.ts` (admin bypass preserved; a non-member gets 403
«لا تملك صلاحية الوصول لهذه المهمة»). Granting the permission in
`BASE_EMPLOYEE` did NOT open task endpoints to non-members — the scope check
is the second half of the gate and must stay on every task sub-resource route.

### 6. Pipeline notifications migrated to `notify()`
The pipeline's notification inserts previously wrote `pyra_notifications`
directly with the wrong column names — the inserts silently failed (same class
of bug the central `notify()` helper was built to prevent; see "Notifications
— Central Helper" above). All pipeline notification call sites now go through
`notify()`/`notifyMany()`.

### 7. frame.io API integration deferred (v1.1)
Direct frame.io API integration (webhooks, in-app review embeds) is deferred —
the available frame.io account is a personal account, not a company/team
account, so the API surface needed for webhooks isn't available yet. v1 uses
plain links; revisit if/when a company frame.io account exists.

### 8. Attendance `absent_days` fallback uses `DEFAULT_WORK_DAYS` (Mon–Sat)
The productivity report's `absent_days` fallback computation uses
`DEFAULT_WORK_DAYS` (`lib/constants/auth.ts`, Pyramedia's Mon–Sat work week)
for its default working-day calendar — NOT the legacy Sun–Thu assumption. The
Sun–Thu fallback must not come back (see Batch C's weekend-days lock above:
Pyramedia's weekend is Sunday only).

### Implementation notes (discovered during execution — record accurately)

- **The pipeline action UI lives in `components/boards/task-sheet.tsx`** (the
  LIVE task dialog actually rendered by the board view). A review cycle caught
  an attempt to add the new pipeline actions (advance/approve/reject) to the
  then-dead `TaskDetailDialog` in `board-view-client.tsx` instead — put new
  task-dialog features in `task-sheet.tsx`.
  *(Resolved: `TaskDetailDialog` was deleted during i18n Phase 2, 2026-07-06.
  It no longer exists anywhere in the source — nothing left to clean up.)*
- **The per-card «مطلوب تعديل» badge from the design spec §4.1 was
  consciously replaced** by the mandatory reject-note comment
  (`❌ مطلوب تعديل: …`) + a loud notification. A per-card badge would require a
  per-card activity lookup on every board render (N+1-shaped cost across the
  whole board); the comment + notification gives the same signal without that
  cost. Revisit as a v1.1 item if the comment-only signal proves insufficient
  in practice.
