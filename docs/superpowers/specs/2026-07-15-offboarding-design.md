# Employee Offboarding — Design Spec (2026-07-15)

## Goal

One deliberate **"إنهاء خدمة"** action that does what an admin currently has to do by
hand: revoke the leaver's access **for real**, surface every piece of live work still
tied to them so it can be handed over, compute the final settlement and record it as an
obligation, and write a **permanent** exit record that survives a re-hire.

Not an HR ceremony module. No exit interview, no exit-document PDF, no asset-return
form in v1.

## Why this exists

The `abdelrahman.morshedy` exit (2026-07-15) was performed **entirely by hand** — a
GoTrue ban, a raw SQL refresh-token revoke, a raw SQL session delete, two task
archives, and a hand-calculated 5,133.33 EGP settlement that existed nowhere in the
system.

Then the design research found the same failure had been silently accumulating:

| username | status | `deactivated_at` | `banned_until` | live tokens | sessions |
|---|---|---|---|---|---|
| mo.hanach | inactive | **NULL** | NULL | **2** | **2** |
| sayed | inactive | 2026-07-14 | NULL | **1** | **1** |
| ahmed.s | inactive | 2026-07-03 | NULL | 0 | 0 |
| kassem | inactive | **NULL** | NULL | 0 | 0 |
| lojain | inactive | **NULL** | NULL | 0 | 0 |

Five deactivated users, none banned, two still holding live refresh tokens — and
because **GoTrue knows nothing about `pyra_users.status`** (it is an application
table), *any* of them who remembered their password could mint a fresh access token
straight from the public token endpoint and reach PostgREST as `authenticated` —
where Gap #3 still grants `SELECT/INSERT/UPDATE/DELETE/TRUNCATE` on `pyra_users`
with RLS off. They could have set their own status back to `active`.

All six were locked by hand on 2026-07-15 (banned, tokens revoked, sessions deleted,
verified `banned=true, live_tokens=0, open_sessions=0`). **This spec exists so that
never has to happen manually again.**

Note also: `deactivated_at` is NULL for 3 of 6 leavers. Migration 029 added the column
and never backfilled, and `app/api/users/[username]/route.ts:267` **clears it on
reactivation**. Half the departure history in the database does not exist. That is the
direct argument for a permanent `pyra_offboarding` record.

## Locked decisions (Abou, 2026-07-15 — do NOT re-litigate)

1. **An exit action, not a module.** No exit interview, no exit doc, no asset-return
   form. (Q1)
2. **A `pyra_offboarding` TABLE**, not columns on `pyra_users`. Every exit is a
   permanent historical record that survives a re-hire. (Q1 follow-up, approach B)
3. **Settlement is recorded as a `pending` `pyra_employee_payments` row.** The system
   never pays anyone. The admin transfers out-of-band and marks it paid. (Q2)
4. **Handover is a review list.** The admin decides per item — reassign to X / archive
   / leave. A "assign all to X" shortcut is provided. The system never guesses. (Q3)
5. **Gap #3 (the PostgREST hole) is OUT OF SCOPE** — a separate project. 27 files read
   `pyra_users` with the session client; revoking `authenticated` breaks them. (Q4)
6. **The status `Select` in the user edit dialog is REMOVED ENTIRELY.** Every status
   change gets a dedicated, explicit button. (Q5)

## Non-goals (v1)

- Exit interview, exit/asset-return PDF, asset register.
- End-of-service gratuity (deferred by business decision, HR Gap-Remediation).
- Closing the ≤1h access-token window (needs Gap #3; see Prerequisites).
- Rescuing external files — the system can only warn (see EXTERNAL-DEPENDENCY).
- Notifying the leaver of anything (structurally impossible — see Settlement).

---

## Verified research facts (established 2026-07-15; do not re-derive)

- **`ban_duration` works via the SDK.** `@supabase/supabase-js` resolves **2.95.3**;
  `AdminUserAttributes.ban_duration?: string | 'none'` is declared and documented.
  `auth.admin.updateUserById(uid, { ban_duration: '876000h' })` on the existing
  `createServiceRoleClient()` (`lib/supabase/server.ts:34-45`) is a one-line call.
  Proven live: HTTP 200, `banned_until` set ~100y out, on 6 real users.
- **Session revocation is NOT reachable from application code.** Proven, not reasoned:
  - `auth.admin.signOut(jwt, scope)` takes the **user's own JWT**, not a uid
    (`GoTrueAdminApi.js:42-51`; `lib/fetch.js:73-74` shows the jwt *overwrites* the
    service-role header). You cannot substitute privilege for possession of the token.
  - The `auth` schema is **not exposed to PostgREST**. Live probe:
    `GET /rest/v1/refresh_tokens` with `Accept-Profile: auth` + service_role →
    `406 PGRST106 "The schema must be one of the following: public, storage,
    graphql_public"`. Control (`GET /rest/v1/pyra_users`) → 200.
  - `service_role` holds **no grants** on `auth.refresh_tokens` / `auth.sessions` /
    `auth.users`. `has_table_privilege('service_role','auth.refresh_tokens','DELETE')`
    → **false**. Grantees are `postgres`, `supabase_auth_admin`, `dashboard_user` only.
  - No code in the repo reads any `auth.*` table through the JS client. `.schema(` →
    0 hits. Every auth touch goes through the GoTrue admin SDK.
- **A ban blocks login AND refresh, but does not kill an already-issued access token.**
  It lives until `exp`. This is the residual window.
- **The SECURITY DEFINER escape hatch is rejected** — see Prerequisites §2.
- **`hireProrationFactor` has no departure leg** (`lib/payroll/calculate-item.ts:148-172`,
  unchanged since `0c51f97`). For a July run with `hire_date=2026-07-02` it returns
  `30/31` → pays through 2026-07-31 regardless of the last working day.
- **`countDeductibleAbsences` has no departure cap** (`lib/hr/attendance-policy.ts:101-113`).
  Its only upper bound is `if (dateStr > todayKey) break;`. Called with today's key for
  abdelrahman it returns **3**, not 2 — it counts 2026-07-15, a day *after* he left.
- **`last_working_day` does not exist**, and nothing anywhere is adding it. Repo-wide
  grep for `last_working_day|termination_date|exit_reason|rehire_eligible|offboarding_id|
  pyra_offboarding` → **zero hits** in any `.ts`/`.tsx`/`.sql`/doc. `pyra_users` has
  only `deactivated_at`.
- **Migration numbering: offboarding takes `039`.** `037_call_tracking` was the highest
  when this spec was drafted; **`038_function_execute_acl` was applied + recorded on
  2026-07-15** (the function-ACL lockdown — see Deferred, below: it shipped immediately
  rather than waiting, because it was a live hole).
  ⚠️ **`036_push_subscriptions.sql` exists on disk but was NEVER applied**
  (`pyra_push_subscriptions` does not exist; not in `pyra_schema_migrations`). It is a
  live hole in the ledger that `db:check-drift` does not fail on. Do not adopt it; flag
  it separately.

### In-flight work — the collision map (checked 2026-07-15)

Working tree clean. No branches, worktrees, or stashes for any of the three tasks.

| Task | State | Impact |
|---|---|---|
| **Notify status gate** | ✅ **SHIPPED to `origin/main`** (`3a46ab0`) | A **dependency, not a competitor.** `selectUndeliverableRecipients` (`lib/notifications/notify.ts:130-198`) drops non-active recipients in all three writers, LOCKED + unit-tested. **It solves the ghost-cron-notification symptom for free** — the moment status flips, `task-deadline-reminders` stops reaching the leaver, with zero offboarding code. |
| **User DELETE cleanup** | ✅ **SHIPPED, UNPUSHED** (`32e1fc1`, `integrate-pending-fixes` ahead of `origin/main` by 1) | **SOFT** collision only. Its diff is lines 36-70 + 518-684 (DELETE); ours lands in 255-269 + 442-475 (PATCH). ~250 lines apart, merges cleanly. **Treat `32e1fc1` as the baseline.** |
| **Payroll departure pro-ration** | ❌ **NOT STARTED** (zero code, branch, worktree, stash, migration) | 🔴 **HARD × 3** — same function, same signature, same column. See "Sequencing". |

**Two things inherited from the shipped DELETE fix — reuse, do not re-derive:**
- `EVIDENCE_TABLES` (`app/api/users/[username]/route.ts:36-46`) — a hand-audited 9-table
  list of "every table that proves this person worked here", already compiling against
  real columns. Note the `{table, column}` shape exists because the column names are
  **not** uniform: `username` for 6, `employee_username` for 3.
- The **fail-CLOSED doctrine** (`:557-573`) — an unreadable evidence check returns
  `apiServerError`, never a pass.

---

## Architecture

### 1. `lib/hr/lock-account.ts` — the single lock primitive

```ts
export async function lockAccount(
  serviceClient: SupabaseClient,
  username: string,
): Promise<{ locked: boolean; error?: string }>

export async function unlockAccount(
  serviceClient: SupabaseClient,
  username: string,
): Promise<{ unlocked: boolean; error?: string }>
```

- Resolves `auth_user_id` via `pyra_auth_mapping` (column is **`pyra_username`**, not
  `username`) — reuse `resolveAuthUserId` from `lib/auth/auth-mapping.ts`, which
  auto-heals legacy users missing a mapping row.
- `lockAccount` → `auth.admin.updateUserById(uid, { ban_duration: '876000h' })`.
- `unlockAccount` → `{ ban_duration: 'none' }`.
- **Never throws.** Returns the outcome. Logs via `logError` on failure.
- **Idempotent** — banning a banned user is a no-op; unbanning an unbanned user is a no-op.

Called from exactly three places: the users PATCH, the onboarding-cancel path, and the
reconcile cron. Mirrors the `markPaymentsPaidAndPropagate` / `notifyApprovers` shared-helper
precedent — and prevents the copy-paste drift that
`app/api/dashboard/employee-payments/[id]/route.ts:112-118` already demonstrates.

**Session/refresh-token revocation is NOT in the helper** — it is unreachable from app
code (see Verified research facts). v1 is **ban-only**.

### 2. `POST /api/cron/access-reconcile` — the safety net

**Mandatory, not a nice-to-have.** A PATCH-time hook only fires on *future* transitions.
It cannot reach:
- Users already deactivated (sayed, mo.hanach, ahmed.s, kassem, lojain — all five were
  past any future hook).
- `app/api/hr/onboarding/[id]/route.ts:238`, which writes `status:'inactive'` with a
  **service-role** client, bypassing the users PATCH entirely.
- Direct `pg/query` writes (as `supabase_admin`), which bypass everything.
- The **re-hire ban bug** (see below).

Phase D §7 cron shape verbatim: `getExternalAuth` + `cron.access-reconcile` or `*`,
service-role client, per-item try/catch, `logError`, `apiSuccess`. n8n daily trigger on
**PyraHR_Cron** (`AeXwITpSmaZ5jg9V`).

Two idempotent assertions:
1. every `pyra_users.status <> 'active'` → `banned_until` in the future, else `lockAccount`
2. every `pyra_users.status = 'active'` → `banned_until` null/past, else `unlockAccount`

Assertion 2 is what catches the **re-hire bug**: `lib/hr/create-employee.ts:331` sets
`status='active'` on reactivation and resets the Auth password at `:378`, but **never
clears `banned_until`**. Under a ban-on-exit design, every re-hire would be silently
un-loginable — the user would be `active` in the app and banned at the identity layer,
with a `user_banned` error nobody could explain. `reactivateEmployeeUser` should call
`unlockAccount` directly; the cron is the backstop.

Reports counts + a `notifyMany` to active admins when it had to correct anything —
a correction means a write path bypassed the helper, which is a defect worth surfacing.

### 3. `pyra_offboarding` — migration 039

Mirrors `pyra_onboarding` (024) exactly: `varchar(24)` ids, unbounded-`varchar` username
columns, **no FK on usernames** (workspace doctrine — orphan usernames exist in prod),
**no CHECK on status** (matching `pyra_onboarding`; the TS union is the only enforcement),
`IF NOT EXISTS` on every DDL, `-- -- DOWN` double-commented.

```sql
CREATE TABLE IF NOT EXISTS pyra_offboarding (
  id                varchar(24) PRIMARY KEY,
  employee_username varchar NOT NULL,
  status            varchar(20) NOT NULL DEFAULT 'completed',
  last_working_day  date NOT NULL,
  exit_reason       varchar(30) NOT NULL,          -- resigned | terminated | contract_ended | other
  exit_notes        text,
  handover          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- the admin's per-item decisions, as executed
  settlement        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- the computed breakdown (audit of the math)
  settlement_payment_id varchar(24),               -- → pyra_employee_payments.id
  locked            boolean NOT NULL DEFAULT false,-- did the identity lock succeed?
  lock_error        text,
  started_by        varchar NOT NULL,
  started_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offboarding_employee ON pyra_offboarding(employee_username);
CREATE INDEX IF NOT EXISTS idx_offboarding_status   ON pyra_offboarding(status);
```

**No unique index on `employee_username`** — deliberately, exactly as `pyra_onboarding`.
A person can leave, be re-hired, and leave again; each exit is its own row. **Rows are
never updated on re-hire and never deleted.** This is the whole point of approach B.

**`status` in v1 is always `'completed'`.** The exit is atomic — there is no `in_progress`
state, because there is no future-dated exit (see the orchestrator). The column exists for
symmetry with `pyra_onboarding` and to leave room for a later `'reversed'` (an exit undone
by mistake). `OFFBOARDING_STATUS` declares both; only `completed` is written. A failed
identity lock is **not** a status — it is `locked:false` + `lock_error`, because the exit
itself did complete.

`handover` records what was actually executed, per item, so the row answers "what happened
to their work?" years later without re-deriving it:
`{ leads: {reassigned_to, count} | {archived, count}, follow_ups: {...}, tasks: {...},
   whatsapp: {...}, direct_reports: {reparented_to, count},
   external_files: {acknowledged: bool, count}, errors: [...] }`

`pyra_users.last_working_day date NULL` is added as a **denormalised convenience** for
payroll to read (`ADD COLUMN IF NOT EXISTS`, migration 029 is the template). The
`pyra_offboarding` row is the source of truth. Unlike `deactivated_at`, the offboarding
row is immutable — so re-hire clearing `pyra_users.last_working_day` loses nothing.

**Offboarding owns `last_working_day`.** Payroll cannot populate it — a pro-ration leg is
a *reader* of a departure date; only the exit action knows it. If the payroll task later
adds it with `IF NOT EXISTS`, that is a silent no-op.

`types/database.ts` gains `PyraOffboarding`. Status constants go in
`lib/constants/offboarding.ts` (`OFFBOARDING_STATUS`, `EXIT_REASONS`) following the
`lib/constants/onboarding.ts` pattern; labels via the `statuses.*` i18n namespace.

### 4. `POST /api/users/[username]/exit` — the orchestrator

Gate: `requireApiPermission('hr.manage')` — matching onboarding, its mirror. Then
service-role.

**The ordering is the most important decision in this design:**

```
1. Validate       last_working_day (<= today — see below), exit_reason;
                  employee exists and is currently active
2. Recompute      the handover list server-side; reject if it disagrees with what the
                  admin was shown (stale-view guard); FAIL CLOSED on any read error
3. Execute        the admin's handover decisions (reassign / archive), collecting outcomes
4. LOCK           lockAccount()  ← attempted BEFORE the status flip
5. Flip           status='inactive' + deactivated_at + last_working_day  ← ALWAYS, even if 4 failed
6. Settle         compute + insert the pending pyra_employee_payments row
7. Record         insert the pyra_offboarding row (incl. locked / lock_error)
8. Audit          logActivity + notify admins on any partial failure
9. Return         { offboarding_id, locked, lock_error?, settlement, handover_results }
```

**The exit is IMMEDIATE — `last_working_day` must be `<= today` (Dubai day).** The status
flips in the same request. Future-dated exits (a notice period recorded in advance, with
the flip scheduled for later) are **explicitly deferred**: they would require a scheduler,
a "pending exit" state, and a window in which an employee is `active` *and* carries an
approved settlement — which is exactly the money-vanishing scenario below. Abou's real
workflow is to record the exit on or after the last day (abdelrahman left 07-14, was
deactivated 07-15), so v1 loses nothing. Validate it; do not silently accept a future date.

**Why lock-before-flip, and why non-blocking:** if the lock is a *blocking* precondition
and GoTrue is briefly unavailable, the PATCH 500s and the employee stays **fully
`active`** — retaining both the identity layer *and* the app layer. The admin's intent is
discarded because a secondary system blinked. Non-blocking, lock-first, the worst case is
"app layer shut, identity layer open pending retry" — and the cron retries within a day.
**There is no ordering under which blocking produces a safer end state.**

But non-blocking must **never be silent**. On lock failure: `logError` + `notifyMany` to
active admins + `{ locked: false, lock_error }` in the response, and the UI shows
**"تم إنهاء الخدمة — لكن قفل الحساب فشل"** with a retry button. A green toast over a
failed lock trains the admin to trust a lock that did not happen — strictly worse than
today's honest manual process.

There is **no transaction** (workspace doctrine: backup-rollback pattern). Steps 3-7 are
independent round-trips; each records its own outcome into the offboarding row rather
than pretending atomicity.

### 5. The exit modal

`components/hr/offboarding/ExitWizard.tsx` — modelled on `NewHireWizard.tsx` (281 lines:
local `Stepper`, `useState` step, per-step `validateStep`, barrel export, one file per
step, all steps ≤220 lines). Three steps:

1. **التفاصيل** — last working day (date), exit reason (select), notes.
2. **المراجعة** — the handover list, grouped by bucket, with a decision per item and an
   "سلّم الكل لـ ▾" shortcut. Target picker = **`useLeadCapableUsers`** for lead-shaped
   work (it is the documented "SINGLE SOURCE for the reassignment 'who can be an owner'
   security filter": `status === 'active' && role ∈ {sales_agent, admin}`); an
   equivalent active-user filter for task-shaped work.
3. **التأكيد** — the settlement breakdown + an `AlertDialog` confirm.

Entry point: `/dashboard/users/[username]` (the detail page, 472 lines — has room).

### 6. Removing the status Select

`app/dashboard/users/users-client.tsx` is **956 lines — 3.2× the 300-line limit**, with
the edit dialog inline at ~565. The status Select (~580-590) is removed; `editStatus`
state and its `status:` field in the `handleEdit` payload (`:248`) go with it.

Three explicit actions replace it: **إنهاء خدمة** (opens the wizard) · **إيقاف مؤقت**
(suspend + lock, `AlertDialog` confirm) · **إعادة تفعيل** (reactivate + unlock).

**This is also a correctness fix.** `users-client.tsx:248` currently sends `status` on
**every** save, unconditionally — so `body.status !== undefined` is *always* true in the
PATCH. Any hook placed inside the `if (body.status !== undefined)` block would fire on
every unrelated field edit. **Gate on the transition (`existingUser.status !== body.status`),
never on key presence.**

Per the HR bundle precedent (attendance 537→197, payroll 848→80), extract the edit dialog
to `components/users/UserEditDialog.tsx` as part of this work rather than growing a
956-line file further.

### 7. Two pre-existing PATCH defects to fix while we are in there

- **The two departure detectors disagree.** The `deactivated_at` stamp (`:265`) fires on
  `existingUser.status === 'active'`; the B2 admin alert (`:448`) fires on
  `existingUser.status !== body.status`. `suspended → inactive` re-alerts but does **not**
  re-stamp. Unify on one predicate.
- **`getDirectReports` has no status filter** (`lib/auth/team-scope.ts:21-23`).
  Deactivating `elharm` today would alert *"6 reports"* — **5 of whom are already
  inactive**. The count the admin acts on is inflated 5×. Filter to active reports.

---

## The handover taxonomy

Five buckets. The fifth did not exist before this research and is the reason the review
list can honour its promise.

### 🔵 WORK — live work; must be handed over or the business loses it

The admin decides per item. **Open/closed predicates below are verified against real
data**, not assumed.

| source | open predicate | reassign path |
|---|---|---|
| `pyra_sales_leads.assigned_to` | `archived_at IS NULL AND stage_id NOT IN (terminal)` | ✅ `POST /api/dashboard/sales/leads/bulk` action=`assign` — **cap 50 ids per call**, blocks archived, gates `sales_leads.manage` + `leads.assign` + `isAssignableUser`. Chunk. |
| `pyra_sales_follow_ups.assigned_to` | `status IN ('pending','overdue')` | ❌ **NONE — must be built.** `dashboard/sales/follow-ups/route.ts:138` destructures `{ id, status, title, notes, due_at }`; `assigned_to` is absent, and no PATCH exists under `/api/crm/follow-ups/`. **youssef's 105 open follow-ups are un-reassignable by any endpoint in the system today.** |
| `pyra_task_assignees.username` | `t.is_archived = false AND bc.is_done_column = false` | ⚠️ per-task `POST`/`DELETE /api/tasks/[id]/assignees` — loop |
| `pyra_whatsapp_conversations.assigned_to` | `status = 'open'` | ✅ `whatsapp/conversations/bulk` action=`assign` — no cap, **no `isAssignableUser`** (unlike leads bulk); validate the target ourselves |
| `pyra_lead_tasks.assigned_to` | `status <> 'completed'` | ⚠️ per-task `PATCH /api/crm/leads/[id]/tasks/[taskId]` |
| `pyra_users.manager_username` | direct reports, **active only** | re-parent to a chosen manager |

🔴 **Terminal lead stages MUST be derived from `pyra_pipeline_stages`, never hardcoded.**
`stg_closed_won` **does not exist** — real distribution is `stg_discovery_call` 418,
`stg_new_inquiry` 121, `stg_proposal_sent` 11, `stg_negotiation` 10, `stg_closed_lost` 5,
plus **two custom `ps_*` stages holding 7 leads**. Custom stages are a shipped feature
(`5233782`). A literal id list silently misclassifies every custom won/lost stage.

### 🆕 EXTERNAL-DEPENDENCY — leaves with the person; no database operation can fix it

**All 32 of 32 `pyra_task_attachments` rows have `storage_path IS NULL` and
`file_id IS NULL`.** There is not one storage-backed task attachment in the database.
Every row is an external link:

| uploaded_by | host | n |
|---|---|---|
| **wael.hany** (active) | drive.google.com / f.io / frame.io | **19** |
| abdelrahman.morshedy | drive.google.com | 7 |
| elharm | drive.google.com | 6 |

Reassigning `uploaded_by` would falsify the record *and* rescue nothing. The handover item
is a real-world action — *retrieve the files before the account dies* — with no database
representation. The modal renders it as a **warning + checklist item**, recorded in
`handover`, never as a reassign control.

This is the only person-bound external-file column in the schema (a 39-column sweep of
every `url`/`path`/`link` column confirms it; `pyra_whatsapp_messages.media_url` is an
expiring WhatsApp CDN, not person-bound; all 176 `pyra_project_files.file_path` rows are
storage-relative and safe). **wael.hany — active — is the largest holder.** This is a
live, growing condition, not a leaver artifact.

### 🟠 ACCESS — removed automatically, no decision

`pyra_board_members.username` · `pyra_team_members.username` ·
`pyra_agent_whatsapp_settings.agent_username` · `pyra_whatsapp_instances.agent_username` ·
`pyra_ignored_numbers.agent_username` · `pyra_favorites.username`

`pyra_auth_mapping` is **not** removed — its FK CASCADE fires only on a `pyra_users` row
DELETE, and this design never deletes. Identity revocation is explicit (the ban), which is
exactly what the incident proved.

### ⚪ AUDIT — never touched, never shown in the decision list

`pyra_activity_log.username` · `pyra_task_stage_history.moved_by` · `pyra_attendance.username` ·
`pyra_salary_history.changed_by` · `pyra_task_comments.author_username` ·
`pyra_task_activity.username` · `pyra_tasks.created_by` · `pyra_error_logs.user_id` ·
all `*_display_name` denormalised copies (there are **nine**, not one).

Reassigning any of these falsifies history. `pyra_task_stage_history.moved_by` is
load-bearing: `lib/production/metrics.ts` derives every productivity number from it.

### HR — the leaver's own records; stay with them

Payroll items, employee payments, employee documents, leave, timesheets, evaluations.
This is what `EVIDENCE_TABLES` already enumerates and what the DELETE 409 guard protects.

### Fail-CLOSED is mandatory

Supabase JS resolves `{ error }` rather than throwing. A wrong column name reads as
**"no rows to hand over"**, and the admin approves an exit that silently strands the work.
Every read in the handover builder must inspect its error and abort the modal with a
visible failure. Inherited doctrine from `app/api/users/[username]/route.ts:557-573`.

---

## The settlement

### The math — `lib/hr/final-settlement.ts` (new, pure, unit-tested)

```ts
export interface FinalSettlementInput {
  salary: number;            // pyra_users.salary — monthly total package
  currency: string;          // pyra_users.salary_currency
  hireDate: string;          // YYYY-MM-DD
  lastWorkingDay: string;    // YYYY-MM-DD
  deductibleAbsenceDays: number;
}
export interface FinalSettlement {
  daily_rate: number;
  days_employed: number;     // CALENDAR days, inclusive
  gross: number;
  absence_days: number;
  absence_deduction: number;
  net: number;               // floored at 0
  currency: string;
}
export function computeFinalSettlement(input: FinalSettlementInput): FinalSettlement
```

**The derivation, stated explicitly so it is never re-invented:**

```
daily_rate    = salary / DEDUCTION_DAYS_PER_MONTH        // 30 — the owner-locked basis
days_employed = calendar days from hireDate to lastWorkingDay, INCLUSIVE
                (weekly rest days ARE included and ARE paid)
gross         = daily_rate × days_employed
deduction     = daily_rate × deductibleAbsenceDays
net           = max(0, gross − deduction)
```

For abdelrahman: `14000/30 = 466.67` · 13 calendar days (2026-07-02..07-14) ·
`466.67 × 13 = 6,066.67` · 2 absences (07-09, 07-10) · `−933.33` · **net 5,133.33 EGP**.

⚠️ **Why the weekly rest day is paid.** `lib/hr/attendance-policy.ts:13-16` states the /30
divisor exists precisely because *"the monthly salary covers every day incl. the paid
weekly rest day"*. Counting only work days **and** dividing by 30 would withhold pay for
rest days the divisor already assumes are paid.

⚠️ **A coincidence that must not mislead a future reader.** An independent verification
pass reconstructed 5,133.33 as `11 work days × 466.67` (Sundays excluded, absences *not*
deducted) — the same number, by a different and **incorrect** route. It matches only
because for this employee `#rest-days (2) == #absence-days (2)`. Had he been absent 3
days the two methods would diverge. **The derivation above is authoritative.**

**Reuse `countDeductibleAbsences`, but call it with `todayKey = lastWorkingDay`.**
It has no departure cap. Called with the real today it returns **3** for abdelrahman —
counting 2026-07-15, a day after he left. Passing `lastWorkingDay` returns **2**.
`__tests__/attendance-policy.test.ts:79` only passes because it pins a mid-tenure
`todayKey`; it has never exercised a post-departure date.

**Do NOT use `hireProrationFactor`.** It has no departure leg and is payroll-run-shaped.

### The record — `pyra_employee_payments`

- New `source_type = 'final_settlement'` added to `VALID_SOURCE_TYPES`
  (`app/api/dashboard/employee-payments/route.ts:14`) and the status constants.
- `status = 'pending'`, `currency = employee's salary_currency`, `source_id = offboarding_id`.
- `settlement` jsonb on the offboarding row stores the full breakdown — the audit of the math.

🔴 **The exit needs its own insert path; the existing POST cannot do this.**
`app/api/dashboard/employee-payments/route.ts:122-132` inserts
`id, username, source_type, description, amount, currency, status` — **`source_id` is
never set.** Without it there is no idempotency guard, and pressing the button twice
records two settlements. (The evaluation-bonus guard at `evaluations/[id]/route.ts:272`
works precisely *because* it can write `source_id`.) Either plumb `source_id` through the
POST or insert directly from the exit route.

🔴 **`calculate-item.ts` MUST learn about `final_settlement`, or money vanishes silently.**
`lib/payroll/calculate-item.ts:45-46` sums by **exact `source_type` match**; an
unrecognised type contributes to **no** bucket. But
`app/api/dashboard/payroll/[id]/calculate/route.ts:253` consumes **every** fetched
payment into `linkedPaymentIds` — setting `payroll_id` and later flipping it to `paid`.

The gates (`employees.status='active'` at `:73`; `payments.status='approved' AND
payroll_id IS NULL` at `:104-108`) hold **only** because v1 flips the status in the same
request as the settlement insert — the leaver is inactive before the row exists, so no
payroll run can reach it. **That is a single line of defence resting on request ordering.**
Any future change that separates the two — a future-dated exit, a scheduled flip, a
settlement recorded for someone still active, a manual `final_settlement` row — reopens it:
approve the settlement, run that month's payroll, and the row is consumed
(`payroll_id` set), later flipped to `paid`, and contributes **0** to `net_pay`. The money
is closed as paid without ever being paid, silently.

**Teach `calculate-item.ts` the type anyway.** It costs one line and it is what makes the
future-dated-exit deferral safe to lift later. Do not rely on the ordering alone.

### The settlement cannot notify the leaver — by design

CLAUDE.md, "Inactive-recipient gate (LOCKED 2026-07-15)", verbatim:

> *Not a bug, do not "fix": money/offboarding paths (final settlement, payslip, HR docs)
> DO notify departed employees, and the gate drops those rows. That is correct — they
> cannot log in to read the bell, so the row was never deliverable. Reach them out-of-band.*

The settlement is recorded *after* the status flip, so any `notify()` to the leaver is
dropped. **The settlement is an admin-facing artifact.** Do not build a notification path
for it; do not "fix" the gate. Abou confirmed he understands the leaver is told out-of-band.

---

## Prerequisites (before implementation)

1. 🔴 **Push `32e1fc1`.** One unpushed commit ahead of `origin/main` on
   `integrate-pending-fixes`, which auto-deploys. The DELETE-orphan fix is the baseline
   this design assumes; building on top of code prod is not running is a trap.
   **Pushing this branch deploys production — confirm with Abou first.**
2. ✅ **`GOTRUE_JWT_EXP` = 3600s — CONFIRMED 2026-07-15, measured, not assumed.**
   The value is not in the repo (`supabase/` holds only `migrations/`; no `config.toml`)
   and not in the DB (`pg_db_role_setting` for `authenticator` carries no `pgrst.*`), and
   the Coolify container env was not reachable. It was instead **derived empirically from
   token-rotation intervals**: supabase-js auto-refreshes shortly before expiry and each
   refresh writes a new `auth.refresh_tokens` row, so consecutive per-user `created_at`
   deltas approximate the TTL from below.
   ```sql
   -- n=1975 gaps (60s..12h window):  min 68 | median 3528 | p95 4007 | max 43029
   ```
   The median sits at **3528s = 3600 − ~72s** of refresh margin, and the mode is a tight
   3510–3530 band. A 7200s TTL would have clustered at ~7100. The long tail is idle
   sessions refreshing on wake, not TTL evidence.
   **The residual post-ban window is therefore ≤1 hour.** Re-measure with this query if
   the GoTrue container is ever reconfigured.
3. ✅ **The payroll departure-proration task is STOPPED** (Abou, 2026-07-15) — see Sequencing.
   Re-scope it after migration 039 lands, once `last_working_day` exists and carries real
   data. It may reduce to nothing.

## Sequencing

1. **Baseline on `32e1fc1`.** The notify gate (`3a46ab0`) and the DELETE fix (`32e1fc1`)
   are shipped code, not in-flight work. Design against the code as it reads now — both
   task titles describe bugs that no longer exist.
2. **Offboarding claims `last_working_day` and migration `039`.**
3. ✅ **The payroll departure-proration task is STOPPED** (Abou's call, 2026-07-15). It is
   downstream, not parallel — and may be the wrong tool. It solves *payroll-run*
   pro-ration; this settlement rides the *employee-payments* rail. They collide in code
   (`hireProrationFactor`, `calculatePayrollItem`, the calculate route's employee select,
   the same new column) but **do not overlap in purpose**. Running it first would have
   meant inventing `last_working_day`, guessing its semantics, and having no writer for it.
   **Re-scope after 039 lands** — with a real column to read and real data in it, it may
   reduce to nothing.

## Rollout order

1. Migration 039 + `types/database.ts` + `lib/constants/offboarding.ts`.
2. `lib/hr/lock-account.ts` + unit tests.
3. `lib/hr/final-settlement.ts` + unit tests (pure — TDD).
4. The PATCH hook (transition-gated) + `reactivateEmployeeUser` unlock + the two
   pre-existing PATCH defects.
5. `/api/cron/access-reconcile` + n8n trigger. **Its first run is the regression test** —
   it must find zero corrections, because all six were locked by hand on 2026-07-15.
6. The handover builder (server) + the follow-ups reassign endpoint (the one WORK source
   with no path).
7. `POST /api/users/[username]/exit`.
8. `ExitWizard` + the users-client surgery (remove the Select, extract the dialog).
9. Sidebar / module-guide / i18n / RBAC per the CLAUDE.md checklist.

## Testing

- `__tests__/final-settlement.test.ts` — the abdelrahman case (5,133.33) pinned exactly;
  zero absences; absences ≥ days employed (net floors at 0); a same-day hire-and-leave;
  a hire and last-working-day in different months.
- `__tests__/lock-account.test.ts` — resolves the mapping; idempotent; never throws on a
  GoTrue error; returns `{locked:false, error}`.
- `__tests__/handover.test.ts` — terminal stages derived from a stage list including a
  custom `ps_*` stage; open/closed predicates; a read error aborts (fail-closed).
- Manual: an exit with GoTrue unreachable → status still flips, `locked:false` surfaced,
  the cron corrects it next run.

## Deferred / follow-ups (NOT this project)

- **Gap #3 Phase 2** — the ≤1h token window, and the 27 session-client `pyra_users`
  readers. The offboarding lock shuts the door on every *future* leaver; this closes the
  window where an already-issued token can still walk through it.
- ✅ **`increment_share_access` — FIXED 2026-07-15, migration `038_function_execute_acl`.**
  It was SECURITY DEFINER, superuser-owned, unpinned `search_path`, and EXECUTE-able by
  `anon` (i.e. by the public key in the client bundle) — because Gap #3 Phase 0 revoked
  default privileges for *tables and sequences* from `anon`, **not functions**. A live,
  pre-existing hole of exactly the shape this design refused to add: shipping
  `revoke_user_sessions(uuid)` under the same default ACL would have handed any anonymous
  caller an auth-nuke primitive, strictly worse than the ≤1h window it closes.
  Fixed: `search_path` pinned + schema-qualified; EXECUTE revoked from PUBLIC/anon/
  authenticated and granted to `service_role` only (its sole caller,
  `app/api/shares/download/[token]/route.ts:105`, uses the service-role client);
  `check_path_access` narrowed to authenticated + service_role; and — the systemic half —
  `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon` for **both**
  grantor roles (`supabase_admin`, which runs migrations, and `postgres`, which the
  Supabase Studio SQL editor runs as; `pg_default_acl` carries a row per grantor, and
  fixing only one leaves the other minting exposed functions).
- **Migration 036 was never applied** — `pyra_push_subscriptions` does not exist;
  `db:check-drift` does not fail on order gaps (Phase 14.2 §13, advisory only).
- ✅ **`pyra_evaluations.evaluator_username` — FIXED 2026-07-15.** It was in
  `CLEANUP_TABLES`, so hard-deleting a manager destroyed the **evaluated employees'**
  performance records — a third party's HR evidence, filed as "ephemera", 15 lines below
  `pyra_evaluations.employee_username` in `EVIDENCE_TABLES`. Removed from the cleanup
  list; the row now survives with an orphan `evaluator_username`, which this schema
  tolerates by design (no FK on username columns; orphans already exist in prod).
  ⚠️ **Still open, same shape, not yet judged:** `pyra_kpi_targets.username`,
  `pyra_leave_balances_v2.username`, `pyra_timesheet_periods.username` are all in
  `CLEANUP_TABLES`. Unlike the evaluator case these are the *leaver's own* records, so
  deleting them is defensible — but leave balances may represent an unpaid liability.
  Worth a deliberate ruling rather than inheritance.
- **`pyra_lead_transfers` is a 0-row dead table** — the dedicated handover-audit table has
  never been written to, despite a bulk-reassign endpoint existing. Do not build the review
  list on it without first verifying a writer.
- **`pyra_task_attachments` external-file exposure** is a live product problem, not an exit
  problem — wael.hany (active) holds 19. Either store the bytes or accept the loss, but
  decide it deliberately.
- **Exit document PDF**, asset register, exit interview, gratuity — the module Abou
  declined for v1.
- **Orphan usernames in prod**: `'admin'` (pyra_clients ×2, pyra_projects ×1), `'system'`
  (pyra_boards ×1, pyra_payments ×1), a raw UUID in `pyra_suppliers.created_by` ×2,
  `'ahmed'` (1 open task), `'lydia'` (pyra_team_members). The handover list must not
  assume every username resolves to a `pyra_users` row.
