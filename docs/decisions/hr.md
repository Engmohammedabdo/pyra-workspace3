# HR & Payroll — Locked Decisions Archive

Employees, attendance, leave, payroll, documents, onboarding, and offboarding.

> **Archive of locked decisions.** These were settled after audit → design → implementation → review, and are recorded so they are **not re-litigated**.
> `CLAUDE.md` carries a one-line index of everything here; open this file when the index says a decision touches what you are about to change.

## Contents

- [HR Department Improvement — Locked Decisions (2026-06-27)](#hr-department-improvement-locked-decisions-2026-06-27)
- [Payroll Integrity Fixes — Locked Decisions (2026-06-30)](#payroll-integrity-fixes-locked-decisions-2026-06-30)
- [Employee Documents Vault — Locked Decisions (2026-06-29)](#employee-documents-vault-locked-decisions-2026-06-29)
- [Employee Onboarding — Locked Decisions (2026-06-30)](#employee-onboarding-locked-decisions-2026-06-30)
- [HR + Payroll Organization — Locked Decisions (2026-07-01)](#hr-payroll-organization-locked-decisions-2026-07-01)
- [HR/Payroll v1.1 Cleanup — Closure (2026-07-01)](#hrpayroll-v11-cleanup-closure-2026-07-01)
- [HR Gap-Remediation — Locked Decisions (2026-07-02)](#hr-gap-remediation-locked-decisions-2026-07-02)
- [User Hard-Delete Guard — Locked Decisions (2026-07-15)](#user-hard-delete-guard-locked-decisions-2026-07-15)
- [Employee Offboarding — Locked Decisions (2026-07-21)](#employee-offboarding-locked-decisions-2026-07-21)

---

## HR Department Improvement — Locked Decisions (2026-06-27)

These are **intentional, documented design choices** locked during the HR
Department Improvement bundle closure (30 commits merged to `main`).
**Do NOT re-litigate.** Future sessions touching the HR Overview, attendance,
or payroll surfaces should defer to the decisions recorded here.

### 1. `hr.view` is admin-only — NOT in BASE_EMPLOYEE

`PERMISSIONS.HR_VIEW = 'hr.view'` and `PERMISSIONS.HR_MANAGE = 'hr.manage'`
are declared in `lib/auth/rbac.ts` under a dedicated `'hr'` `PERMISSION_MODULES`
group. Neither is added to `BASE_EMPLOYEE` — the HR Overview is an admin-only
aggregate dashboard showing ALL employees' headcount, payroll, and leave data.
Admin gets it implicitly via `'*'`. `hr.manage` is reserved for future write
operations (no routes use it in v1).

**Rule:** any future HR admin write endpoint MUST gate on `hr.manage`, NOT on
`payroll.manage` or `attendance.manage` (which are narrower per-module gates).

### 2. `/api/hr/overview` = single aggregator, gate THEN service-role

`GET /api/hr/overview` follows the gate-then-service-role pattern established
for sensitive tables by audit Gap #3:

1. `requireApiPermission('hr.view')` — 401/403 if not admin
2. ONLY THEN `createServiceRoleClient()` — because `payroll_runs`,
   `payroll_items`, `employee_payments`, and `attendance` tables had
   `authenticated` revoked in Phase 2 Tier-2 (Gap #3)

**Single-aggregator invariant:** the endpoint is one round trip returning all
7 sections (headcount, attendance_today, leave, payroll, evaluations, alerts,
celebrations). DO NOT fragment into per-widget endpoints — at this team size the
aggregator is faster and simpler to maintain. The same pattern mirrors
`/api/my-work` for employees.

### 3. Migration 020 — `date_of_birth` is additive and nullable

`supabase/migrations/020_pyra_users_date_of_birth.sql` adds:

```sql
ALTER TABLE pyra_users ADD COLUMN IF NOT EXISTS date_of_birth date NULL;
```

Idempotent (`IF NOT EXISTS`). `PyraUser.date_of_birth?: string | null`
(YYYY-MM-DD). Celebrations in the HR Overview combine:
- **Birthdays** — from `date_of_birth` (current month match, day/month only)
- **Anniversaries** — from `hire_date` (current month match + years computed)

Both computed by `computeCelebrations()` in `lib/hr/overview-helpers.ts` (pure
helper, no DB access). The `date_of_birth` field is wired into `/api/users`
POST + PATCH and the users create/edit form.

### 4. Attendance was already React-Query-compliant — consolidated, not rewritten

Initial research over-stated the attendance client as using "raw fetch + useState."
It was already RQ-compliant with inline `useQuery`/`useMutation`. The bundle's
work was **consolidation** onto a shared `hooks/useAttendance.ts`:

- Exports: `useAttendanceRecords`, `useAttendanceSummary`, `useClockIn`,
  `useClockOut`, `useUpsertAttendance` + typed `AttendanceRecord`/`AttendanceSummary`
- Removed a `setWorkSchedule`-inside-`queryFn` side effect (mutations in queryFns
  are a React Query anti-pattern — they fire on every background refetch)
- Status constants centralized in `lib/constants/statuses.ts`:
  `ATTENDANCE_STATUS`, `ATTENDANCE_STATUS_LABELS`, `ATTENDANCE_STATUS_STYLES`

**Component split:** attendance client (537 → 197 lines) into
`components/attendance/` sub-components (`AttendanceCalendar`,
`AttendanceSummaryCards`, `TodayClockCard`).

### 5. Admin attendance edit wires the previously-DEAD `canManage` flag

The attendance client had a `canManage` boolean (gated on `attendance.manage`)
that controlled conditional rendering — but the admin edit UI was never built.
This bundle ships:

- `POST /api/dashboard/attendance/admin` — `attendance.manage` gate + service
  role + upsert on `(username, date)` + recomputes `total_hours` + `logActivity`
  + DB errors via `logError`
- `components/attendance/AdminAttendanceDialog.tsx` — wired to `canManage`,
  now the flag actually gates real functionality

The endpoint follows the same gate-then-service-role pattern as `/api/hr/overview`
because attendance tables are service-role-only (Gap #3 Phase 2 Tier-2).

### 6. Payroll migrated OFF `useState`/`useEffect` — fixed a double-`.data` unwrap bug

The payroll client previously used manual `useState`/`useEffect`/`fetch()` for
data loading. The bundle migrated it to React Query via `hooks/usePayroll.ts`:

- Exports: `usePayrollRuns`, `usePayrollRun`, `useMyPayslips`, `useCreatePayroll`,
  `useCalculatePayroll`, `useUpdatePayroll`
- `hooks/useEmployeePayments.ts`: `useEmployeePayments`, `useCreateEmployeePayment`,
  `useUpdateEmployeePayment`

**Bug fixed:** the old manual-fetch path did `.data.data` on the response —
`fetchAPI()` already unwraps `{ data }` (CLAUDE.md mandate), so reading `.data`
again produced `undefined`. The migration surfaced and fixed this silently-broken
double-unwrap.

Additional payroll improvements: `formatCurrency` from `lib/utils/format` (was
inline); a11y (toggle button `aria-expanded`/`aria-controls`, detail region in
DOM via `hidden`, `scope=col` headers).

**Component split:** payroll client (848 → 80 lines) into `components/payroll/`
sub-components (`PayrollRunsTable`, `PayrollRunRow`, `EmployeePaymentsTab`,
`CreatePayrollDialog`, `AddPaymentDialog`).

### 7. A11y hardening across attendance and payroll

Both attendance and payroll received targeted a11y improvements (not cosmetic):
- **Attendance:** keyboard grid (`role=gridcell`, `aria-label`, `tabIndex`,
  `focus-visible ring`); nav `aria-label`s + `rtl:rotate-180` for directional
  icons; `aria-live` on clock-in/out result; status legend.
- **Payroll:** toggle button `aria-expanded`/`aria-controls`; detail region kept
  in DOM via `hidden` (not conditional render) so `aria-controls` target always
  exists; `scope=col` on table headers.

These invariants must be preserved in future edits to the attendance/payroll
clients.

### Implementation invariants (locked, do NOT regress)

- **`hr.view` is admin-only.** Do NOT add it to `BASE_EMPLOYEE` or `ROLE_EXTRAS`
  for any role — the HR Overview surfaces all-employee aggregate data that must
  never leak to individual employees or sales agents.
- **Gate-then-service-role is mandatory for `/api/hr/overview` and
  `/api/dashboard/attendance/admin`.** Never call `createServerSupabaseClient()`
  (session client) after the permission check — those tables have `authenticated`
  revoked (Gap #3).
- **HR Overview stays a single aggregator endpoint.** Do NOT split into per-widget
  endpoints. Extend the existing endpoint response when new data is needed.
- **Attendance and payroll clients consume the shared hooks.** No inline `queryFn`
  side-effects (mutations inside queryFns), no `useState`-as-cache, no
  double-`.data` unwrap (recall: `fetchAPI()` already unwraps `{ data }`).
- **`date_of_birth` is nullable/optional everywhere.** Celebrations degrade
  gracefully when the field is NULL — the celebrations array simply omits those
  users. Never throw on NULL `date_of_birth`.
- **`computeCelebrations` + `deriveAlerts` are pure functions** in
  `lib/hr/overview-helpers.ts`. They have no DB access and no side effects —
  keep them pure so the unit tests in `__tests__/hr-overview-helpers.test.ts`
  remain valid.
- **Component split target: <300 lines per client file** (per CLAUDE.md mandate).
  Attendance and payroll now meet this target; do not re-inline sub-components.

### HR bundle v1.1 backlog

- `users-client` `date_of_birth` field: `onChange` uses object-spread (not
  functional `setFormData`); uses `<Label>` not `<FormLabel>` unlike `hire_date`.
- `hooks/usePayroll.ts` `useMyPayslips` returns `unknown` shape AND is currently
  unused (the my-payslips page was not migrated in this bundle) — wire onto the
  hook or drop and add when the page is migrated.
- `attendance-client.tsx`: merge duplicate import + `import type` from
  `@/hooks/useAttendance`; drop dead `"|| ''"` status fallbacks; still has its
  own `getTodayUAE()` (could reuse `dubaiDayKey` from `lib/utils/format`).
- `AdminAttendanceDialog` `DialogFooter` `flex-row-reverse` cosmetic alignment.
- `formatTime`/`formatHours` duplicated across the 3 attendance sub-components;
  `MONTH_NAMES_AR` duplicated in 4 places (incl. the overview route `MONTHS_AR`)
  — extract to a shared `lib/constants/` entry.
- `CreatePayrollDialog` month/year not reset on close (pre-existing).
- `components/payroll/PayrollRunsTable` imports `PayrollRunRow` via relative `'./'`
  vs the project's `'@/'` path-alias convention.
- Payslip download still uses imperative `fetchAPI` double-unwrap pattern (pre-
  existing; the only remaining non-hook fetch in the payroll surface).
- `useUsers()`-based pickers (`AdminAttendanceDialog`, `AddPaymentDialog`) depend
  on `users.view` — a future HR-manager granted only `attendance.manage` /
  `payroll.manage` via `extra_permissions` would see an empty dropdown. Consider
  `/api/users/lite` (role+status only, narrower scope).
- HR Overview "pending approvals" KPI surfaces `leave.pending` only (no combined
  all-approvals count yet — leave + expense + timesheet).

## Payroll Integrity Fixes — Locked Decisions (2026-06-30)

Closure of the payroll integrity-fix bundle (8 commits + migrations 022/023,
merged to `main`). Followed an audit (4 parallel agents) → plan → SDD →
whole-branch review. **Do NOT re-litigate.** Full plan at
`docs/superpowers/plans/2026-06-30-payroll-integrity-fixes.md`.

### 1. Deduction model is LOCKED — fixed salary; ONLY unpaid leave is deducted

User decision: monthly salary is **fixed**; the ONLY automatic deduction is
approved **unpaid leave** (`baseSalary / PAYROLL_WORKING_DAYS_PER_MONTH × days`).
**Attendance/absence is intentionally NOT wired into payroll** — `pyra_attendance`
stays a tracking log only. No income tax / GPSSA.

**Future sessions: do NOT "fix" the attendance→payroll disconnect as a gap.** A
prior audit flagged it HIGH; the user reviewed and chose to keep attendance
decoupled. Re-wiring it would violate the locked model. The pure calc core lives
in `lib/payroll/calculate-item.ts` (unit-tested, `__tests__/payroll-calculate-item.test.ts`).

**Active-only + hire-date pro-ration (2026-06-30 follow-up).** Two refinements
the user caught by running a real payroll:
- Payroll includes ONLY `status='active'` employees. The calculate route filters
  `.eq('status','active')` — `inactive` AND `suspended` are excluded entirely
  (never paid). The earlier `.neq('status','suspended')` wrongly paid inactive
  staff.
- A new hire's FIRST partial month pro-rates the **base salary** by calendar days
  worked. `hireProrationFactor(hire_date, year, month)` (in `calculate-item.ts`)
  returns `daysWorked / daysInMonth` when the hire date is inside the run month,
  `1` if hired earlier, and `0` (employee skipped — not yet hired) if hired after
  the run month. Additions (task/bonus/commission/overtime) are NEVER pro-rated;
  only the fixed base is. Example: hired 2026-06-29 in a June run → base × 2/30.
- After deploying changes to the calc, **re-calculate** an existing run to refresh
  its items (stale items are not auto-recomputed).

### 2. Payroll math is a pure function; the route only maps DB→input→DB

`calculatePayrollItem()` in `lib/payroll/calculate-item.ts` owns ALL summing
(task/bonus/commission/overtime additions, manual + unpaid-leave deductions, net
floored at 0). `app/api/dashboard/payroll/[id]/calculate/route.ts` only fetches
rows and maps them in. New pay rules go in the pure fn + its tests — NOT inline
in the route.

### 3. Overtime = approved timesheets + manual `overtime` payments

Two overtime sources, both fold into `overtime_amount`: timesheet rows
(`is_overtime=true` AND **`status='approved'`** — draft no longer pays) × hourly
rate × multiplier, PLUS `source_type='overtime'` employee_payments (previously
silently dropped while still being consumed). `hourly_rate=0` salaried staff get
0 timesheet overtime by design — manual overtime payments are how they're paid.

### 4. Payment lifecycle settles forward; `markPaymentsPaidAndPropagate` is the DRY path

`lib/payroll/payment-lifecycle.ts` flips `pyra_employee_payments` → `paid` (+`paid_at`)
AND propagates `source_type='task'` rows to their `pyra_tasks.payment_status='paid'`.
Called when a payroll **run** is paid (bulk) and mirrored inline when a single
employee-payment is paid. A task payment is NO LONGER marked paid on creation —
it is set `pending` and settles only when actually paid. Duplicate-active-payment
guard fails **safe** (blocks on a `maybeSingle` multi-row error, not open).

### 5. `commission` is a first-class stored line item (migration 022)

`pyra_payroll_items.commission` (numeric NOT NULL DEFAULT 0) is populated by the
calc and surfaced everywhere: payslip route, my-payslips route, `PayrollItem`
type, payslip PDF, employee + admin payslip UIs. Invariant:
`net_pay = base + task + overtime + bonus + commission − deductions` (floored 0).
Commission was always inside net_pay; this just makes the breakdown reconcile.

### 6. Config + observability + integrity

- Magic numbers centralized in `lib/constants/payroll.ts` (working days 22,
  overtime multiplier 1.5, default currency AED). Payslip `company_name` reads
  `pyra_settings` key `company_name` (fallback constant). v1.1: admin-editable
  working-days/multiplier via settings UI.
- All payroll routes use `logError()` in catches; the payroll→expense insert no
  longer swallows its error and upserts the `ec_salaries` category defensively.
- Migration 023 added the missing `pyra_employee_payments.payroll_id` FK
  (`ON DELETE SET NULL`) and removed an orphan `pyra_salary_history` row. Dead
  `employee_payments.{view,manage}` permissions removed from `rbac.ts`.

### Operational note (NOT a code bug)

At closure, all active employees had `salary = 0/NULL`, so a run would output
zeros. Payroll is non-functional until salaries are entered on the user records —
this is data entry, not a defect.

### Deferred (v1.1 backlog)

- Payment attribution by **earned/work month** instead of `created_at` (needs a
  `pay_period`/`earned_date` column + UI).
- Admin-editable working-days + overtime multiplier via `pyra_settings` + UI.
- Stored-field vs net_pay sub-cent rounding consistency (harmless at numeric(12,2)).

## Employee Documents Vault — Locked Decisions (2026-06-29)

These are **intentional, documented design choices** locked during the Employee
Documents Vault implementation. **Do NOT re-litigate.** Future sessions adding
document-related features should defer to the decisions recorded here. The vault
gives HR a private per-employee document store with expiry tracking and a daily
cron alert pipeline, plus an employee self-service read-only surface.

### 1. Reuse the existing `pyra-private` bucket — no new bucket (D1)

Documents are stored in the **existing** `pyra-private` bucket under path
`employee-documents/{employee_username}/{Date.now()}-{nanoid}{ext}`. Rejected: a
dedicated `pyra-hr-private` bucket — identical security model, extra ops overhead,
zero gain.

**Gap #3 Phase 3a pattern reused verbatim:** private bucket + `createSignedUrl`
(TTL 3600 s / 1 hour) + `storage_path` stripped from ALL list responses. The GET
handler destructures `{ storage_path, ...rest }` before returning rows — raw paths
NEVER leave the server.

### 2. Configurable document types in `pyra_document_types` — not a fixed enum (D2)

A dedicated `pyra_document_types` table holds the catalogue (id, name, name_ar,
requires_expiry, is_active, sort_order). Seeded with 6 default rows: `dt_contract`
(عقد عمل), `dt_eid` (هوية إماراتية, requires_expiry), `dt_passport` (جواز سفر,
requires_expiry), `dt_visa` (إقامة/تأشيرة, requires_expiry), `dt_cert` (شهادة),
`dt_other` (أخرى).

**Rationale:** UAE-specific types (labour card, medical certificate, etc.) can be
added by admin without a migration. The `requires_expiry` flag drives the upload
form's expiry-date requirement — no code change needed for new types.

Admin-only management at `/dashboard/hr/documents/settings` (documents.manage gate).

### 3. HR-only upload; employee surface is read-only (D3 / D4)

`documents.manage` is required for all write operations (upload, edit metadata,
delete). `documents.view` (in `BASE_EMPLOYEE` — every internal user) grants
read-own-documents only via `/api/my-documents` and `/dashboard/my-documents`.

Employee self-upload is **explicitly deferred to v1.1** — the simplest safe model
for employee PII data. HR remains the sole upload authority in v1.

### 4. Two-tier daily expiry cron — flags flip before notify (D3)

`POST /api/cron/document-expiry-check` runs daily at 08:00 Asia/Dubai via n8n
Schedule Trigger (the same 'Integration' API key with `*` wildcard used by other
crons). Two tiers:

- **7-day tier** (`expiry_date ≤ today+7 AND expiry_alert_7_sent=false`) →
  flip BOTH `expiry_alert_7_sent=true` AND `expiry_alert_30_sent=true`, then
  notify the employee (critical severity).
- **30-day tier** (else AND `expiry_alert_30_sent=false`) →
  flip `expiry_alert_30_sent=true`, then notify the employee.

After the per-doc loop a single **grouped admin summary** notification is sent to
all users with `role='admin'` (count of expiring docs).

**Idempotency (Phase 11 lock re-applied):** flags flip **regardless of notify
outcome** — a notify exception never causes duplicate alerts on re-run. The SELECT
filter `WHERE expiry_alert_*_sent = false` naturally excludes already-alerted docs.

`dubaiDayKey()` (from `lib/utils/format.ts`) is used for all date-window
comparisons — never `.toISOString().slice(0, 10)` (Phase 15.1 lock, UTC ≠ Dubai).

### 5. PATCH re-arms both alert flags when `expiry_date` changes

`PATCH /api/hr/documents/[id]` allows updating `label`, `expiry_date`, `notes`,
`type_id`. When the request body contains `expiry_date` (even if unchanged), the
handler unconditionally resets **both** `expiry_alert_30_sent = false` AND
`expiry_alert_7_sent = false`. The admin summary notification field
`expiry_alerts_reset` records this in the activity log.

**Rationale:** an HR edit of the expiry date (e.g. visa renewed, new expiry)
must re-trigger the alert pipeline as if the document were newly uploaded — stale
flags from the previous expiry would silence the new reminder.

### 6. Storage path 100% server-controlled; SVG rejected; 20 MB hard cap

All guards inherited from the Gap #3 Phase 3a lead-attachments pattern:

- Path = `employee-documents/{employee_username}/{Date.now()}-{generateId('doc').slice(4)}{ext}` —
  `file.name` NEVER used anywhere in the path.
- Extension derived from `MIME_TO_EXT` map server-side; hard-error (500) on a
  missing MIME entry — preserves the path-control invariant against future drift.
- MIME allowlist: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
  `image/svg+xml` is **explicitly rejected** (SVG can carry `<script>` — XSS).
- `employee_username` path segment validated by `/^[a-zA-Z0-9._-]+$/` before use
  in the storage path (path-traversal guard).
- 20 MB cap enforced server-side (`MAX_DOC_SIZE = 20 * 1024 * 1024`).
- Orphan cleanup: if the DB insert fails after a successful storage upload, the
  route removes the uploaded file before returning the error.

### 7. `documents.view` is own-scope only; `documents.manage` is full scope

`GET /api/my-documents` (employee surface) filters `WHERE employee_username = auth
user` — the scope gate is enforced server-side, NOT just by UI hiding. The
employee can never access another employee's documents by manipulating query params.

`GET /api/hr/documents` (HR surface) requires `documents.manage` and can filter by
`?employee_username=` to scope to a specific employee. No cross-contamination: the
two endpoints are separate routes with separate permission gates.

### 8. `NotificationType` extended with `document_expiring_soon` + `document_expired`

Both new types are added to the `NotificationType` union in
`lib/notifications/notify.ts`. The cron uses `document_expiring_soon` for BOTH
the per-employee 30-day/7-day alerts AND the grouped admin summary.
`document_expired` is reserved in the union but currently unused (v1.1 may use
it for an already-expired digest). DO NOT use generic `'reminder'` or custom
strings outside this union.

### Implementation invariants (locked, do NOT regress)

- **Gate-then-service-role on every route.** `requireApiPermission('documents.manage')`
  (or `documents.view`) is called BEFORE `createServiceRoleClient()`. No route
  creates the service client to check auth.
- **`storage_path` NEVER leaves the server.** List routes destructure
  `{ storage_path, ...rest }` and return `signed_url` instead. Single-item signed-
  URL refresh endpoints (`/api/hr/documents/[id]/signed-url` and
  `/api/my-documents/[id]/signed-url`) re-sign on demand. Clients must treat
  signed URLs as ephemeral (1h TTL).
- **`documents.view` is own-scope only — enforce server-side, not just in UI.** The
  `/api/my-documents` route hardcodes `eq('employee_username', auth.pyraUser.username)`.
  Any new read endpoint that uses `documents.view` MUST do the same.
- **Server controls 100% of the storage path** — file.name input NEVER reaches
  the path construction. `MIME_TO_EXT` hard-error on miss must NOT be softened to
  a fallback.
- **SVG explicitly rejected** — do NOT add `image/svg+xml` to `ALLOWED_DOC_MIME`
  without a server-side SVG sanitizer. XSS risk is real.
- **Document types are configurable — do NOT hardcode type IDs in business logic.**
  Use the `type_id` FK and let the `requires_expiry` flag drive validation.
- **PATCH re-arms BOTH flags when `expiry_date` is present** — even if the value
  is identical. The flag reset is unconditional on key presence, not on value diff.
- **Cron flag-flip happens before notify (idempotency).** Notify exceptions MUST
  NOT prevent the flag from being set. Sequential `await` per doc (not
  `Promise.all`) — low v1 volume, consistent with Phase 11 lock.
- **`dubaiDayKey()` for all date windows in the cron.** `.toISOString().slice(0,10)`
  is a regression smell (Phase 15.1 HIGH 1 re-confirmed).
- **`DOC_BUCKET`, `SIGNED_URL_TTL`, `MAX_DOC_SIZE`, `ALLOWED_DOC_MIME` are
  hardcoded constants in the route handler** (NOT env-overridable) — prevents
  misconfiguration to a public bucket. v1.1 backlog: extract to `lib/constants/`.

### Employee Documents v1.1 backlog

- [ ] **Employee self-upload** — allow employees to upload their own documents (e.g.
  updated visa scan). Needs a new permission scope (`documents.create`) + server-
  side type restriction (employee can only upload to own username path).
- [ ] **Per-download audit logging** — log `document_download` activity on each
  signed-URL request (currently only upload + delete are logged).
- [ ] **Document versioning / replace-in-place** — currently replace = delete + re-upload
  (new row, new storage path). A true versioning model would chain rows by a
  `parent_id` FK.
- [ ] **OCR auto-expiry extraction** — parse expiry dates from uploaded PDFs/images
  on the server and pre-fill the expiry_date field.
- [ ] **Tiered 60/30/7 alerts** — add a 60-day early-warning tier (requires
  `expiry_alert_60_sent` column + migration).
- [ ] **Bulk upload** — upload multiple documents for one employee in a single form
  submission.
- [ ] **Export / zip an employee's docs** — generate a signed multi-file zip from
  storage for HR offboarding packs.
- [ ] **Widen cron admin summary to all `documents.manage` holders**, not just
  `role='admin'` — so HR managers granted the permission via `extra_permissions`
  also receive the daily summary.
- [ ] **Centralize `DOC_BUCKET` / `SIGNED_URL_TTL` / `MAX_DOC_SIZE` /
  `ALLOWED_DOC_MIME` into `lib/constants/`** — currently hardcoded inline in the
  route; extraction avoids drift if a second upload endpoint is added.
- [ ] **Cron: check `.update()` error return** — the current cron loops don't inspect
  the Supabase update error before proceeding to notify; a failed flag-flip would
  silently proceed.
- [ ] **`encodeURIComponent` on `employee_username` query param** in
  `useEmployeeDocumentsByUser` — usernames containing `.` are currently safe
  because the allowlist forbids special chars, but encoding is defensive hygiene.
- [ ] **T9 (typing test):** TypeScript `tsc --noEmit` clean pass post-completion was
  confirmed; the T9 item in the plan refers to a deferred full regression test suite.

## Employee Onboarding — Locked Decisions (2026-06-30)

These are **intentional, documented design choices** locked during the Employee
Onboarding implementation. **Do NOT re-litigate.** Future sessions adding
onboarding-related features should defer to the decisions recorded here. The
onboarding module provides a new-hire wizard for HR admins: it creates the user
account, auto-generates three Arabic PDF documents (offer letter, NDA, asset-
handover form) stored in the Employee Documents Vault, and seeds a simple
per-hire task checklist.

### 1. PDF Arabic engine: jsPDF + `arabic-reshaper` + `bidi-js` (NOT headless browser)

All onboarding PDFs are generated with jsPDF + the `arabic-reshaper` + `bidi-js`
npm packages, exposed via `lib/pdf/arabic.ts`:

- `prepareRtl(text)` — reshapes Arabic glyph forms + applies Unicode BiDi algorithm
- `drawRtlParagraph(doc, text, x, y, options)` — renders a single RTL Arabic
  paragraph to the jsPDF document at the given position
- `drawBilingualClause(doc, ar, en, x, y, options)` — renders an Arabic line
  followed by its English equivalent (used for bilingual contract clauses)

**Callers MUST call `doc.setFont('Amiri', ...)` before any standalone
`drawRtlParagraph` call.** The helper does NOT set the font itself — omitting
the call silently produces a fontless (Helvetica) PDF. Future refactoring may
retrofit this helper into the invoice/quote/payslip generators (v1.1 backlog).

The headless-browser alternative (Puppeteer, Playwright) was explicitly rejected
by the user — it adds a heavy dependency and is not available in the Coolify
Docker environment without custom image changes.

### 2. Three auto-generated PDFs stored in the Employee Documents Vault

The wizard generates exactly three documents per onboarding, stored as three new
`pyra_document_types` rows added in migration 024:

| Doc type ID | name | name_ar | Generator |
|-------------|------|---------|-----------|
| `dt_offer_letter` | Offer Letter | عرض عمل | `lib/pdf/offer-letter-pdf.ts` |
| `dt_nda` | NDA | اتفاقية سرية | `lib/pdf/nda-pdf.ts` |
| `dt_asset_handover` | Asset Handover | نموذج تسليم عهدة | `lib/pdf/asset-handover-pdf.ts` |

All three are stored via `lib/hr/store-generated-document.ts` into the existing
**`pyra-private`** bucket (same private-bucket + signed-URL pattern as the
Document Vault). `storage_path` is NEVER returned to clients; all access is via
1-hour signed URLs. Verbatim source content (for human review) lives in
`docs/onboarding-templates/` (offer HTML, `nda-content-ar.md`,
`asset-handover-content-ar.md`) — implementers copy from there when building
the generators.

The regenerate endpoint (`POST /api/hr/onboarding/[id]/documents/[docType]/regenerate`)
replaces the most recent document of that type for the employee by inserting a
new `pyra_employee_documents` row (old row is NOT deleted — the list query
returns ordered by `uploaded_at DESC` so the newest is always served first).
v1.1 backlog: add an `onboarding_id` FK on `pyra_employee_documents` to scope
precisely which rows belong to an onboarding.

### 3. Offer letter content differs by role; section numbering is dynamic

The offer letter (`lib/pdf/offer-letter-pdf.ts`) branches on `offer_data.is_sales`:

- **Sales hires** (`is_sales = true`): include the Sales Commission Structure section
  with the commission tier table and monthly target.
- **Non-sales hires** (`is_sales = false`): omit the commission section entirely.

Section numbering is computed dynamically — no hardcoded section numbers.
This prevents gaps if the commission section is absent.

**Custom clauses ("بنود إضافية")** from `offer_data.custom_clauses` render as an
additional section ONLY when present and non-empty.

The monthly-target words-form (التعبير الحرفي للمبلغ) was **intentionally dropped**
from the offer letter. The source HTML hardcoded a stale words-form that would
always be wrong for variable targets. v1 renders the numeric value only.

### 4. Wizard creates the user via `createEmployeeUser` (DRY helper)

User creation is handled by `lib/hr/create-employee.ts::createEmployeeUser` —
factored out of the `/api/users` POST handler to prevent copy-paste drift.

- `pyra_users.salary` = the **monthly total package** (basic salary + allowances
  combined into one number). The wizard does NOT store sub-components separately.
- Role assignment: `is_sales ? 'sales_agent' : 'employee'`.
- Leave balance seeding: `createEmployeeUser` seeds initial leave balances for
  **both** `employee` AND `sales_agent` roles. The `/api/users` POST seeded only
  `employee` before this refactor; the onboarding wizard was the trigger that
  exposed the gap for `sales_agent` hires.

All user creation runs via service-role AFTER the `hr.manage` permission gate
(see Decision 6).

### 5. Generated PDFs stored server-side via `lib/hr/store-generated-document.ts`

`storeGeneratedDocument(supabase, { employeeUsername, typeId, buffer, mimeType,
sizeBytes, uploadedBy })` handles both the Supabase Storage upload to `pyra-private`
AND the `pyra_employee_documents` row insert in one call.

**Path pattern**: `employee-documents/{employeeUsername}/{Date.now()}-{nanoid}{ext}` —
same as the HR upload route, so all document tooling (expiry cron, signed-URL
refresh, `UserDocumentsTab`) works on generated docs without modification.

**`storage_path` is NEVER returned to clients.** The standard Document Vault
`GET /api/hr/documents` endpoint already strips `storage_path` and returns
`signed_url` instead — generated docs inherit this for free.

v1.1 backlog: add `onboarding_id` FK on `pyra_employee_documents` to allow
scoped "regenerate replaces old" logic without relying on the date-ordered
query.

### 6. `hr.manage` gates all onboarding routes (not `users.manage`)

All `/api/hr/onboarding` routes check `requireApiPermission('hr.manage')` before
doing anything, then use `createServiceRoleClient()` for DB and Storage access.

**Documented deviation from routing user creation through `users.manage`:**
onboarding is an inherently HR-admin action. Using `hr.manage` keeps the
permission model clean — anyone who can manage HR can onboard a new hire.
A user who has `users.manage` but NOT `hr.manage` cannot create onboarding
records (they can still create raw users via `/api/users`).

The `createEmployeeUser` helper itself does NOT check permissions — it is a
pure DB helper that trusts the calling route to have already gated access.

### 7. Simple unified checklist — no per-task assignees in v1

`DEFAULT_ONBOARDING_TASKS` in `lib/constants/onboarding.ts` is a flat array of
Arabic-titled task objects with `sort_order`. Seeded on onboarding creation by
the POST route.

- **No per-task assignees** in v1 — HR admin is implicitly responsible for all tasks.
- **AlertDialog confirmation** before marking a task done (prevents accidental clicks).
- Task toggle goes through `PATCH /api/hr/onboarding/[id]/tasks/[taskId]` — not
  batched, one request per toggle.

### 8. Out of scope in v1 (v1.1 backlog)

The following were explicitly deferred:

- **Probation tracking** — a separate `probation_end_date` column + reminder
  cron. Deferred until the HR Overview surfaces probation KPIs.
- **Salary-receipt generation** — an on-demand PDF showing the employee's
  monthly salary breakdown. Belongs on the payroll surface (generate from a
  `pyra_payroll_items` row), not on onboarding.
- **Per-task assignees** — individual team members responsible for specific
  onboarding tasks (IT setup, badge, etc.).
- **`onboarding_id` FK on `pyra_employee_documents`** — would allow precise
  scoping of generated docs to an onboarding; currently relies on date ordering.
- **Admin notify on hire** — redundant because the admin IS the actor who
  initiated the onboarding.
- **Asset Register (Phase 2)** — a `pyra_assets` table tracking company
  property, linked to the asset-handover form.
- **Offboarding (Phase 3)** — return of assets, exit interview, access revocation
  workflow.

### 9. Migration 024 — Windows UTF-8 gotcha for Arabic inserts

Migration 024 (`supabase/migrations/024_pyra_onboarding.sql`) added the two
tables and the three `pyra_document_types` seed rows. The seed rows (`dt_offer_letter`,
`dt_nda`, `dt_asset_handover`) contain only ASCII names and Arabic `name_ar` values.

**Windows gotcha:** inserting Arabic via the `pg/query` curl endpoint in PowerShell
requires `--data-binary @file.json` (pointing at a UTF-8 encoded file) rather
than inline JSON in the command. PowerShell defaults to system code page
(cp1252 / cp1256) which mojibakes multi-byte UTF-8 sequences. When in doubt,
always re-read after a manual Arabic insert to confirm encoding (look for
garbled `├┐` sequences vs proper Arabic glyphs). Backfilled rows carry
`backfill:true` + `backfill_reason` in metadata so reconstructed rows are never
mistaken for live-logged ones.

### Implementation invariants (locked, do NOT regress)

- **`doc.setFont('Amiri', ...)` BEFORE any `drawRtlParagraph` call.** The helper
  does not set font internally. A missing setFont call produces a silent Latin
  PDF — no error thrown.
- **`createEmployeeUser` is the single user-creation entry point for onboarding.**
  Do NOT copy-paste the Supabase Auth `signUp` + `pyra_users` insert into the
  onboarding route directly.
- **`storeGeneratedDocument` is the single PDF-storage entry point.** Do NOT call
  `supabase.storage.from(...).upload(...)` + `pyra_employee_documents` insert
  directly from route code — the helper handles orphan cleanup on insert failure.
- **`hr.manage` is required for ALL `/api/hr/onboarding` routes** including the
  task toggle and regenerate endpoints. Do NOT lower the gate to `hr.view`.
- **Offer letter sales/non-sales branching is on `offer_data.is_sales`** — a
  boolean set by the wizard. Do NOT infer it from the role string.
- **Regenerate does NOT delete old rows** — it inserts a new `pyra_employee_documents`
  row. The newest row (by `uploaded_at DESC`) is the active one. Do NOT change
  this to a hard-delete without also adding the `onboarding_id` FK (v1.1).
- **All three doc types (`dt_offer_letter`, `dt_nda`, `dt_asset_handover`) are
  seeded by migration 024 with `ON CONFLICT (id) DO NOTHING`.** They are safe to
  re-run. Do NOT hardcode the `type_id` values outside of `lib/constants/onboarding.ts`
  or the route handlers.

### Employee Onboarding v1.1 backlog

- [ ] **`onboarding_id` FK on `pyra_employee_documents`** — migrate existing rows
  + add column + unique constraint per `(onboarding_id, type_id)` so regenerate
  can hard-replace instead of appending.
- [ ] **Probation tracking** — `probation_end_date` on `pyra_onboarding` + 7-day
  reminder cron + HR Overview alert tier.
- [ ] **Salary-receipt generation** — move to payroll surface; generate from
  `pyra_payroll_items` on first payslip after hire date.
- [ ] **Per-task assignees** — `assigned_to varchar` on `pyra_onboarding_tasks` +
  notify on assignment + My Work Inbox surface for the assignee.
- [ ] **`lib/pdf/arabic.ts` into invoice/quote/payslip generators** — currently
  those use a bespoke Arabic font registration path; the `prepareRtl` helper
  would unify the approach.
- [ ] **`smtp_pass` added to mailer transporter cache key** — so SMTP password
  rotation takes effect without a redeploy. Track alongside the cert-renewal
  `mailer.ts` work (deferred in Quote System v1.1).
- [ ] **Asset Register (Phase 2)** — `pyra_assets` table + link to
  `pyra_onboarding` via `asset_ids[]`.
- [ ] **Offboarding (Phase 3)** — asset return, exit interview, access revocation.

## HR + Payroll Organization — Locked Decisions (2026-07-01)

A 7-phase "organization" pass (design spec:
`docs/superpowers/specs/2026-07-01-hr-payroll-organization-design.md`) that closed
audited gaps and made payroll multi-currency. **Do NOT re-litigate.** Each phase
shipped to `main` independently (audit → design → implement → review → build).

### 1. Multi-currency payroll = per-employee currency + single-currency runs (Phase 2)

Currency is a first-class attribute of the EMPLOYEE (`pyra_users.salary_currency`,
migration 025, default `'AED'`). Each payroll RUN is **single-currency**
(`pyra_payroll_runs.currency`); run uniqueness is `(month, year, currency)`
(migration 026) so an AED run and an EGP run coexist in one month.
`app/api/dashboard/payroll/[id]/calculate/route.ts` includes ONLY employees whose
`salary_currency === run.currency`, gates `pyra_employee_payments` to the run
currency (mismatches skipped → `warnings[]`), and stamps
`pyra_payroll_items.currency`. `total_amount` is therefore a same-currency sum —
**never mix currencies in a run.** `salary_currency` governs BOTH `salary` AND
`hourly_rate` (there is no separate hourly_rate_currency). Display: every
`formatCurrency(amount, currency)` call passes the row's real currency; the
`salary=0` contractor hack is GONE.

### 2. Unpaid-leave deduction — the columns are `type` + `days_count` (Phase 0)

`pyra_leave_requests` has `type` (a NAME string matching `pyra_leave_types.name` —
there is NO `leave_type_id`) and `days_count` (NOT `total_days`). The calculate
route previously SELECTed the non-existent `total_days`/`leave_type_id`, so
PostgREST returned null and **no unpaid leave was ever deducted**. Fixed:
resolve unpaid types by `pyra_leave_types.name` where `is_paid=false`; deduct only
the days that fall inside the run month via `leaveOverlapDays()` (cross-month
safe). **Operational note:** all seeded leave types are `is_paid=true` today — to
actually deduct unpaid leave, an admin must create an `is_paid=false` leave type.

### 3. The two EGP contractors are real EGP employees

`wael.hany` (25,000 EGP) and `abdelrahman.morshedy` (14,000 EGP) have
`salary_currency='EGP'` + real salaries. Pay them by creating an **EGP payroll
run** (Create Payroll → currency=EGP → calculate) — pro-ration is automatic from
`hire_date`. Do NOT pay them via manual Employee Payments anymore, and do NOT set
their salary to 0.

### 4. `pyra_users` is the schema of record (Phase 1)

`national_id`, `bank_details`, `commission_rate`, `work_schedule_id`,
`salary_currency`, `salary_breakdown` all have write paths (users API POST/PATCH +
edit dialog). Employment enums are single-source in `lib/constants/auth.ts`
(`EMPLOYMENT_TYPES` = full_time/part_time/contract/freelance/intern;
`WORK_LOCATIONS`; `PAYMENT_TYPES`; `SALARY_CURRENCIES` = AED/EGP/USD/SAR). Do NOT
re-inline these enums.

### 5. Onboarding ↔ Users are linked, not merged (Phase 3)

`pyra_users.onboarding_id` (FK → pyra_onboarding) is set by the onboarding POST
after both rows exist. Both creation paths write the SAME employment fields (the
wizard passes national_id/commission_rate/employment_type/work_location/
salary_breakdown through `createEmployeeUser`; `salary` stays the monthly total).
Cancelling an onboarding sets the linked user `status='inactive'` (no ghost
logins). Cross-links: users-list badge, user-detail button, onboarding-detail
link. Keep the two surfaces separate but linked.

### 6. Workflow + security + IA (Phases 4-6)

- Contractors (`employment_type` contract/freelance) are BLOCKED from submitting
  leave; leave approve/reject notifies the employee (`leave_approved`/`leave_rejected`).
- Employee-payments have approve/pay row actions; draft payroll runs are deletable
  (draft-only: unlink payments → delete items → delete run).
- HR Overview "pending approvals" KPI = leave + expense + timesheet (combined).
- Timesheet/overtime routes use gate-then-service-role (Gap #3-safe) with explicit
  own-user scoping for non-managers.
- `/dashboard/approvals` is gated on `leave.approve` (was `leave.view` — showed to
  every employee).
- Accounting basis: the payroll→expense bridge fires on APPROVE (accrual), by
  decision — documented, not on-pay.

### v1.1 backlog (this effort)

- ✅ DONE (2026-07-01) — Route payroll/leave/attendance/timesheet activity logs
  through `logActivity()` with `${ENTITY_TYPES.X}_${ACTIVITY_ACTIONS.Y}`. 20 raw
  `pyra_activity_log` inserts across 13 routes converted; old string → `details.source`;
  4 new `ENTITY_TYPES` (timesheet/attendance/work_schedule/employee_payment).
- ✅ DONE (2026-07-01) — Replaced the two raw `fetch()` calls in
  `user-detail-client.tsx` with `useUser` + `useEmployeePayments` hooks.
- ✅ DONE (2026-07-01) — HR Overview per-currency payroll trend: server groups runs
  into `trend_by_currency`, chart renders one series per currency (no shared axis).
- `hourly_rate_currency` only if an hourly worker ever needs a currency different
  from their salary_currency (today they share one).

## HR/Payroll v1.1 Cleanup — Closure (2026-07-01)

A scoped hygiene pass after the 3 items above, run superpowers-style (parallel
discovery agents → disjoint work-groups → implement → adversarial review). **Do
NOT re-litigate.** Shipped:

1. **Activity-log consistency** (commit) — see the ✅ item above. The old HR
   action_type strings were referenced NOWHERE outside `app/api/**` (verified), so
   the rename is behavior-preserving; the activity feed's `ACTION_LABELS` gained
   Arabic labels for the new categories.
2. **HR pickers off `useUsers()` → `useUsersLite()`** — `AdminAttendanceDialog` and
   `payroll-client` no longer require `users.view`; an HR manager granted only
   `attendance.manage`/`payroll.manage` via `extra_permissions` now gets populated
   dropdowns. `/api/users/lite` already returns `username/display_name/status/role`;
   the `UserLite` type was extended (additively) to declare them. The two other
   `useUsersLite` consumers (`teams`, `permissions`) cast via `as unknown as`, so the
   change is safe for them.
3. **DRY: finance `ARABIC_MONTHS` → shared `MONTH_NAMES_AR`** — `vat`/`pnl`/`cashflow`
   report routes now import the canonical array (0-based indexing preserved).
4. **Minor** — dead `|| ''` removed in `AttendanceCalendar`; `date_of_birth` field in
   `users-client` switched to the functional `setFormData` updater + `<FormLabel>`
   (matching every sibling field); `PayrollRunsTable` imports `PayrollRunRow` via the
   `@/` alias.

### Verified STALE — backlog notes that were already resolved (do NOT chase)

Discovery found several `HR bundle v1.1 backlog` items no longer valid:
- `getTodayUAE()` does not exist anywhere — attendance already uses `dubaiDayKey`.
- `formatTime`/`formatHours` are already shared from `lib/utils/format.ts`; the two
  remaining LOCAL `formatTime` copies (`calendar-event-pill.tsx`,
  `crm/dashboard/dashboard-data-sources.tsx`) **intentionally differ** (pre-zoned
  `+04:00` string-slicing / numeric ts + `ar-EG`) and MUST NOT be swapped to the shared one.
- `useMyPayslips` is typed (`PayslipsResponse`) and actively used by `my-payslips-client`.
- `CreatePayrollDialog` already resets month/year/currency on close.
- Payslip download does NOT double-unwrap `.data` (it uses `fetchAPI` correctly); the
  imperative `fetchAPI`-on-click for PDF generation is the accepted pattern, not a raw `fetch`.
- `attendance-client` has no duplicate/`import type` merge opportunity.

### Still deferred (low value)
- `AdminAttendanceDialog` `DialogFooter` `flex-row-reverse` — cosmetic only.
- `hourly_rate_currency` — only if an hourly worker needs a currency ≠ salary_currency.

## HR Gap-Remediation — Locked Decisions (2026-07-02)

A 5-batch effort (A/C/B/D/E) closing an adversarial gap audit (47 confirmed
gaps). Each batch: deep discovery → design → implement → adversarial multi-lens
review (opus verify) → fix → ship. UAE legal compliance (gratuity/WPS/exports)
was explicitly DEFERRED by the user — do NOT treat its absence as a bug. Plans in
`docs/superpowers/plans/2026-07-0{1,2}-hr-batch-*.md`. Migrations 027–029.

### Batch A — fixes + notifications (`e0c4137`, `e41d87e`)
- **BUG fixed:** `/api/approvals/team` + `/api/my-work` selected non-existent
  `period_start`/`period_end` on `pyra_timesheet_periods` (real cols
  `start_date`/`end_date`) — the query 42703'd silently so the timesheet approval
  queue was ALWAYS empty. Aliased in the API map (client field names unchanged).
- Entry-level timesheet approval (`/api/timesheet/[id]`) now enforces
  `canApproveFor` (was permission-only → any manager approved anyone).
- 8 notifications wired via `notify`/`notifyBatch` (6 new `NotificationType`s):
  timesheet submit→manager, payroll paid→employee, employee-payment
  approve/pay→employee, evaluation submit→employee + ack→evaluator, HR doc
  upload→employee, doc expired→employee. Migration 027 `expiry_alert_expired_sent`.

### Batch C — Work Schedules admin UI (`9f6a920`, `5d37617`)
- `/dashboard/hr/work-schedules` CRUD + `work-schedules/[id]` PATCH/DELETE
  (DELETE blocks when `is_default` or referenced by any user; PATCH blocks
  unsetting the LAST default → attendance would fall back to hard-coded 09:00).
- Per-employee assignment via `work_schedule_id` in the user create/edit dialogs.
- **`DEFAULT_WORK_DAYS = [1,2,3,4,5,6]`** + **`WEEKEND_DAYS = [0]`** in
  `lib/constants/auth.ts` — **Pyramedia weekend = Sunday only** (Mon–Sat work
  week; 0=Sunday..6=Saturday). Do NOT revert to Sun–Thu.
- Review caught a CRITICAL: `GET /api/users` omitted `work_schedule_id` from its
  SELECT → editing any user silently wiped their schedule. Fixed.

### Batch B — lifecycle + integrity + self-service (`4439e23`, `1ad4450`)
- **Hard-delete a user is BLOCKED (409) when ANY HR-evidence record exists** →
  admin must deactivate instead (user's locked choice). Clean delete also nulls
  direct reports' `manager_username` + alerts admins. **Superseded 2026-07-15 —
  see "User Hard-Delete Guard" below**: the original 4-table list
  (payroll/payment/document/onboarding) was all-zero for a short-tenure
  employee, so they were hard-deletable and the cleanup loop destroyed their
  `pyra_attendance` evidence.
- Deactivating/suspending a manager alerts admins (only on the real transition).
- **`notifyApprovers(supabase, employeeUsername, input)`** (`lib/notifications/
  approvers.ts`) — the canonical approval-notify: notifies the employee's ACTIVE
  manager, else falls back to all active admins. Used by leave/expense/timesheet
  submit so approvals are never stranded on a dead inbox. Use this for any new
  approval-submit path; do NOT hand-roll `getManagerOf` + `notify`.
- Re-hire: onboarding reactivates an existing inactive/suspended account
  (`reactivateEmployeeUser`) instead of hard-409'ing on a duplicate username.
- Self-service: employees edit their own contact + bank (IBAN) from
  `/dashboard/profile` (whitelisted `bank_details`, logged). Profile GET/PATCH
  never returns `password_hash`.

### Batch D — leave depth (`aafe6f8`, `748a7f8`)
- **`pyra_leave_balances_v2` is the SINGLE source of truth. The legacy v1
  `pyra_leave_balances` is DEAD — do NOT read/write it.** (Both were 0-row at
  cutover.) available = `total_days + carried_over − used_days`.
  create/approve/cancel + employee seeding are all v2-only; the dashboard widget
  reads v2. v1's table + a couple dead references remain (harmless no-ops).
- **`countLeaveDays(start, end)`** (`lib/leave/days.ts`) — leave day-count
  EXCLUDES the weekend (Sunday). Do NOT deduct weekend days.
- Cancel restores ONLY the unused/future working days (not the whole request);
  a PENDING cancel restores NOTHING (pending was never deducted); notifies the
  manager (`leave_cancelled`).
- Migration 028 seeds **`lt_unpaid` (`is_paid=false`)** → activates the
  previously-dead unpaid-leave payroll deduction. Unpaid leave skips the balance
  check on submit AND the deduct on approve.
- Rollover cron **`/api/cron/leave-balance-rollover`** (n8n yearly, Jan 1 Dubai)
  reuses `calculateCarryOver` then seeds any missing next-year rows.
- Admin `/dashboard/hr/leave-balances` (view by year + per-employee adjust) +
  `/api/hr/leave-balances` GET/POST (`leave.manage`). Approvals leave tab shows
  the requester's remaining balance (amber/red when insufficient).

### Batch E — evaluations + reporting (`fa27b58`, `ecc1a51`)
- KPI progress: `kpi/[id]` PATCH (`evaluations.manage`) + `KpiProgressEditor`
  (`actual_value` was permanently 0).
- Bonus: the `recommend_bonus` action (tiered 5/10/15% → pending payment) is now
  surfaced as a button (manage + rating≥3.5); uses the employee's
  `salary_currency` (was hardcoded AED); server-side idempotency guard (one bonus
  per evaluation via `source_id`).
- `PerformanceTrend` tab — an employee's rating across periods (+below-3.0 flag).
- **Turnover:** migration 029 **`pyra_users.deactivated_at`** — stamped on
  active→inactive/suspended in the users PATCH, cleared on reactivation/re-hire.
  HR Overview surfaces `inactive` + `departed_30d/90d/365d` (a 6th KPI card).
  Turnover-window comparison MUST use `dubaiDayKey(new Date(iso))` — never a raw
  `.slice(0,10)` (Dubai-day lock).
- **Leave liability is now monetary + currency-grouped:** remaining PAID-leave
  days × (salary / `PAYROLL_WORKING_DAYS_PER_MONTH`), bucketed by
  `salary_currency` (`leave.liability_by_currency` + `LeaveLiabilityCard`). Never
  sum across currencies.

### v1.1 backlog (this effort)
- Leave: reserve PENDING requests against balance + re-validate on approve
  (pre-existing over-approval gap); public-holiday exclusion in `countLeaveDays`;
  drop the dead v1 table + its remaining references; migrate `leave-client.tsx`
  off raw fetch/useState to React Query.
- Evaluations: KPI PATCH stricter type validation on optional fields.
- UAE legal compliance (deferred by decision): end-of-service gratuity engine,
  WPS/SIF bank-file export, HR CSV/PDF exports, YTD/annual payroll summary.

## User Hard-Delete Guard — Locked Decisions (2026-07-15)

Supersedes the Batch B delete lock above. Found during the
`abdelrahman.morshedy` exit audit. **Do NOT re-litigate.** Both fixes live in
`DELETE /api/users/[username]`.

### 1. The guard blocks on ANY HR-evidence row — enumerated in `EVIDENCE_TABLES`

Batch B's 4-table list (payroll_items / employee_payments / employee_documents /
onboarding) is all-zero for a short-tenure employee, so a 13-day hire was
hard-deletable and the cleanup loop then destroyed their `pyra_attendance` rows
— the evidence base the attendance-deduction policy needs to justify a
deduction. Measured at the time of the fix: **6 of 10 production users were
hard-deletable**, every one of them carrying salary history.

`EVIDENCE_TABLES` now adds `pyra_attendance`, `pyra_salary_history`,
`pyra_leave_requests`, `pyra_timesheets`, `pyra_evaluations`
(`employee_username`). **When a new HR table is added, add it here** — a row in
any of them means "deactivate, never delete."

`pyra_salary_history` was previously in NEITHER the guard nor the cleanup list,
so it orphaned on every delete — migration 023 had to remove exactly such an
orphan for the deleted user `abeer`. It is now a blocking table.

A zero-footprint account (never used, e.g. a mistyped username) stays deletable
— that is the deliberate escape hatch, so junk rows don't accumulate forever.
Note `pyra_salary_history` is written on the first salary PATCH, not at
creation, so a brand-new account really is at zero.

### 2. The guard FAILS CLOSED; cleanup verifies `{ error }` and is best-effort

**Supabase JS resolves with `{ error }` — it does NOT throw.** The old
`try { await …delete() } catch {}` therefore never fired, and
`{ table: 'pyra_notifications', column: 'username' }` (the real columns are
`recipient_username` / `source_username`) silently orphaned every departing
user's notifications with a 42703 nobody ever saw. Same silent-42703 class as
the Batch A `period_start`/`start_date` bug.

- **Guard:** any `{ error }` from a count → `logError` + 500. A guard that
  cannot read its evidence must never authorise an irreversible delete. Because
  it fails closed, **every table/column in `EVIDENCE_TABLES` must be verified
  against `information_schema`** — a typo permanently 500s all deletes.
- **Cleanup:** inspect `{ error }`, `logError(severity:'warning')` + `console.error`,
  then continue. The evidence guard already passed, so an orphaned ephemeral row
  must not abort the delete — but it is never swallowed silently again.

### 3. Cleanup deletes notifications by `recipient_username` only

NOT by `source_username`: those rows are in OTHER users' inboxes and must
survive. `source_display_name` is denormalised so they stay readable, and no FK
on `source_username` can dangle (the only FKs into `pyra_users` are
`pyra_auth_mapping` + `pyra_agent_whatsapp_settings`, both CASCADE).

`pyra_board_members` was in neither list (orphaned every delete) and is now in
cleanup, not the guard — board membership is access control, not HR evidence.
Same for `pyra_task_assignees`.

## Employee Offboarding — Locked Decisions (2026-07-21)

Full "إنهاء خدمة" (end-of-service) feature. **Built + reviewed (12 tasks,
Subagent-Driven, opus review per task + whole-branch) + DEPLOYED to prod.** Spec:
`docs/superpowers/specs/2026-07-15-offboarding-design.md`; plan:
`docs/superpowers/plans/2026-07-15-offboarding.md`. **Do NOT re-litigate.**

Born from the `abdelrahman.morshedy` exit (done 100% by hand) + the discovery that
**5 other deactivated users (sayed, mo.hanach, ahmed.s, kassem, lojain) were
`inactive` in `pyra_users` but UNBANNED at GoTrue**, two still holding live refresh
tokens — because `status='inactive'` alone does NOT revoke the identity layer. All 6
hand-locked 2026-07-15. See [[user-deactivation-procedure]] memory + the "User
Hard-Delete Guard" section above.

### What shipped (surfaces)
- `lib/hr/lock-account.ts` — `lockAccount`/`unlockAccount` (GoTrue ban/unban only;
  ban_duration '876000h'/'none'; never throws; uses `resolveAuthUserId` + service-role).
- `lib/hr/final-settlement.ts` — pure `computeFinalSettlement` + `deriveDeductibleAbsenceDays`.
- `lib/hr/handover.ts` — `buildHandover` (fail-closed reads) + `executeHandover` (best-effort
  service-role reassign/remove) + `isOpenLeadStage`.
- Migration **040** `pyra_offboarding` (id, employee_username, status, last_working_day,
  exit_reason, exit_notes, handover jsonb, settlement jsonb, settlement_payment_id, locked,
  lock_error, started_by, started_at) + `pyra_users.last_working_day date NULL`. No unique
  constraint on employee_username (survives re-hire, like pyra_onboarding).
- `GET/POST /api/users/[username]/exit` (gate `hr.manage`) + `/api/cron/access-reconcile`.
- `hooks/useOffboarding.ts`, `components/hr/offboarding/ExitWizard.tsx` (+7 parts),
  3 status buttons on the user-detail page.
- `app/api/users/[username]/route.ts` PATCH: ban-on-deactivate hook + unban-on-reactivate hook.

### Locked decisions
1. **Ban-only identity revocation.** Session/refresh-token revocation is UNREACHABLE from
   app code (PROVEN: the `auth` schema is not exposed to PostgREST → `PGRST106`; `service_role`
   holds no grants on `auth.*`; `auth.admin.signOut` needs the user's OWN jwt). So `lockAccount`
   only bans. Residual window = one access-token TTL (**GOTRUE_JWT_EXP=3600s, measured** from
   refresh-token rotation, not assumed). A `revoke_user_sessions()` SECURITY DEFINER RPC was
   REJECTED — functions in `public` default to anon-EXECUTE here (see migration 038), so it would
   hand any anon caller an auth-nuke primitive. Full session revocation belongs to the Gap #3 project.
2. **Ordering doctrine (LOCKED).** On exit: compute settlement → executeHandover → **lockAccount
   (attempt)** → **flip status ALWAYS (even if lock failed)** → pending settlement insert →
   offboarding record → audit. The flip is an OPTIMISTIC CLAIM (`.eq('status','active').select()`;
   0 rows → abort) that closes concurrent-double-settlement. Never a silent success over a failed
   lock (response carries `{locked, lock_error}`; the wizard shows a warning toast, not green).
   No transactions (backup-rollback doctrine). The PATCH hook uses the same invariant (flip-always,
   lock best-effort/non-blocking).
3. **The `access-reconcile` cron is MANDATORY, not optional.** A PATCH-time hook can't reach users
   already deactivated, the service-role onboarding-cancel path, or the re-hire ban bug. The cron
   asserts every non-active user is banned + every active user is not (idempotent-by-assertion,
   because `banned_until` isn't readable via PostgREST). **WIRED live** in n8n PyraHR_Cron
   (`AeXwITpSmaZ5jg9V`, daily 06:00 UTC); the PyraCRM_Cron API key (`pyra_GE5E0lh…`) gained
   `cron.access-reconcile` in its jsonb perms. First live run: `{banned:7, unbanned:4, failures:[]}`.
4. **Settlement = admin-facing pending obligation, NEVER paid or notified by the system.**
   `(salary/DEDUCTION_DAYS_PER_MONTH=30) × (calendar days employed − deductible absences)`, floored 0,
   net derived from the UNROUNDED daily rate (pins abdelrahman's 5,133.33 EGP). Recorded as a
   `pyra_employee_payments` row `source_type='final_settlement'`, `status='pending'`, currency =
   employee's `salary_currency`. **Triple-defended against payroll sweep**: (a) `.neq('source_type',
   'final_settlement')` on the calculate route's payments fetch, (b) it's `pending` not `approved`,
   (c) the leaver is `inactive` so the run's `.eq('status','active')` drops them. The inactive-recipient
   gate drops any notify to the leaver by design — reach them out-of-band.
5. **Handover reads are FAIL-CLOSED; writes are best-effort.** `buildHandover` throws
   `HandoverReadError` on any Supabase `{error}` (a bad column must never read as "nothing to hand
   over") → the GET 500s → the wizard shows an error, never a blind empty confirm. `executeHandover`
   collects per-source errors into `errors[]` (surfaced in `handover_results`, HTTP 200), validates
   reassign targets via `isAssignableUser`, always removes ACCESS rows, never touches AUDIT rows,
   and scopes board-task ops to the OPEN subset with a delete-or-update split that avoids the
   `pyra_task_assignees UNIQUE(task_id, username)` collision.
6. **Terminal lead stages come from the `PIPELINE_FINAL_STAGES` constant** (`lib/constants/statuses.ts`),
   NOT `pyra_pipeline_stages` (that table is EMPTY and has no won/lost columns). NULL/custom `ps_*`
   stages count as OPEN (safe over-inclusion — admin picks "leave").
7. **The status `Select` was REMOVED from the user edit dialog.** Every status change goes through a
   dedicated button (إنهاء خدمة / إيقاف مؤقت / إعادة تفعيل), gated on `hr.manage` + a self-guard.
   Suspend bans (reversible); reactivate unbans. An edit-dialog save no longer sends `status`.
8. **Reuses `hr.manage`** — no new permission, no DB-role update (admin holds `*`).

### Related security fix (migration 038, shipped same arc)
`increment_share_access` was SECURITY DEFINER + superuser-owned + unpinned search_path +
**anon-EXECUTE-able** (Gap #3 Phase 0 revoked anon on tables/sequences, NOT functions). Migration
038 pinned its search_path, narrowed EXECUTE to service_role, and ran `ALTER DEFAULT PRIVILEGES …
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon` for **both** grantor roles (`supabase_admin` +
`postgres` — `pg_default_acl` has one row per grantor; fixing one leaves the other minting exposed
functions). Also removed `pyra_evaluations.evaluator_username` from the user-DELETE `CLEANUP_TABLES`
(deleting a manager was destroying their reports' performance records).

### Offboarding v1.1 backlog (all reviewer Minors → deferred, none block)
- `lib/hr/handover.ts` is 449 lines with the open-task predicate duplicated between `buildHandover`
  and `getOpenTaskIds` (drift risk) — extract a shared helper + consider split
  (handover-build.ts / handover-execute.ts; keep `@/lib/hr/handover` as the public path).
- No unit test for `getOpenTaskIds`/the reassign collision-split (needs a mocked Supabase client).
- `UserEditDialog.tsx` extraction deferred (`users-client.tsx` still 957 lines).
- Confirm-step settlement preview is today-based; if the admin picks an earlier last-working-day it
  shows a figure ≥ the recorded net (row is pending/paid manually, no overpayment) — key the
  `exit-preview` query on the date in v1.1.
- `StatusEntity` union in `lib/i18n/status-labels.ts` lacks `'offboarding'` (no call site today).
- `offboarding_completed` NotificationType added but unused. Guide tip over-generalizes "archive"
  to all handover buckets (archive is tasks-only).
- **Live dry-run of a REAL exit is still PENDING** (destructive — do it on the next real departure).
- abdelrahman's 5,133.33 EGP settlement is STILL an unpaid manual transfer — see
  [[abdelrahman-exit-2026-07]].

### Deductions policy — ✅ SHIPPED 2026-07-22 (this block is the original direction, kept for context)

> **SUPERSEDED — do not read this as open work.** The deductions system was built
> and shipped in commit `7b8e2bd` (2026-07-22): `app/dashboard/hr/deductions/`,
> `app/api/hr/deductions/{approve,cancel,manual,me,attendance-tracking}`,
> `lib/hr/deductions.ts` + `deduction-approval.ts` + `manual-deduction.ts` +
> `deductions-report.ts`, `lib/constants/deductions.ts`, `hooks/useDeductions.ts`,
> `components/hr/deductions/`, migrations 047–052.
> **The live rules are in `CLAUDE.md` → "Employee Deductions".** One deviation
> from the direction below: quality money is gated off
> (`QUALITY_DEDUCTION_APPROVAL_ENABLED = false`) pending the owner's choice on
> the measurement window — warnings show, approvals fail closed.

The original direction, as approved (2026-07-20):

Abou approved (2026-07-20) a monetary deductions system to precede employee-facing deduction
visibility: **tiered attendance lateness** (¼/½/full day past the 15-min grace) + **monthly on-time-rate
band** for delivery lateness (NOT per-task fines; exclude unrealistic-lead-time tasks) +
**warning-first quality** (rework/rejection score → money only by explicit admin action). Cross-cutting:
detect + admin-approve (not auto-apply), a 25% monthly cap for delivery/quality/manual disciplinary
money (**attendance deductions are explicitly outside this cap**, owner override 2026-07-22), a transparency "this-month at-risk" panel,
excuse window via the existing `'excused'` status. Needs its own brainstorm→spec→plan. All inputs are
already COMPUTED (attendance-policy + production/metrics) — the work is metric→money + how much to automate.
