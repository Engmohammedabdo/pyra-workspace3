# HR Batch A — Fixes + Notifications (Implementation Plan)

**Goal:** Fix the broken timesheet-approval query, close the entry-approval scope
gap, and wire the missing HR notifications so workflows stop stalling silently.

**Scope:** Batch A of the 5-batch HR gap-remediation effort (A→C→B→D→E). UAE
compliance (gratuity/WPS/exports) is explicitly deferred.

**Verification:** `pnpm run check` + `pnpm build` must pass; adversarial review
workflow; migration run + recorded. All notifications go through the central
`notify()`/`notifyBatch()` helper (never a raw insert).

---

## Task 1 — Migration 027: expired-alert flag

- `supabase/migrations/027_document_expired_alert_flag.sql`:
  `ALTER TABLE pyra_employee_documents ADD COLUMN IF NOT EXISTS expiry_alert_expired_sent boolean NOT NULL DEFAULT false;`
- Run via pg/query, verify column, `pnpm db:record 027`.

## Task 2 — Timesheet column bug (alias in API, no client changes)

- `app/api/approvals/team/route.ts`: SELECT `period_start, period_end` →
  `start_date, end_date`; map `period_start: t.start_date, period_end: t.end_date`.
- `app/api/my-work/route.ts`: same SELECT fix; `.order('period_end')` →
  `.order('end_date')`; same map aliasing.
- Client field names (`period_start`/`period_end`) are unchanged (aliased in the map).

## Task 3 — Entry-approval scope gate

- `app/api/timesheet/[id]/route.ts`: on `status ∈ {approved, rejected}`, after the
  `timesheet.approve` permission check + self-approval guard, add
  `canApproveFor(supabase, auth.pyraUser.username, auth.pyraUser.role, existing.username)`
  → 403 if not allowed. Mirrors the period-approval pattern.

## Task 4 — Notification types

- `lib/notifications/notify.ts` `NotificationType` union: add `payroll_paid`,
  `employee_payment_approved`, `employee_payment_paid`, `evaluation_submitted`,
  `evaluation_acknowledged`, `document_uploaded`. (`timesheet_pending`,
  `document_expired` already exist.)

## Task 5 — Wire notifications

| Event | File | Recipient | Type |
|---|---|---|---|
| period submit | dashboard/timesheet-periods/[id] | `getManagerOf(period.username)` | `timesheet_pending` |
| payroll paid | dashboard/payroll/[id] (pay branch) | each item.username (`notifyBatch`) | `payroll_paid` |
| payment approved | dashboard/employee-payments/[id] | payment.username | `employee_payment_approved` |
| payment paid | dashboard/employee-payments/[id] | payment.username | `employee_payment_paid` |
| eval submitted | dashboard/evaluations/[id] | evaluation.employee_username | `evaluation_submitted` |
| eval acknowledged | dashboard/evaluations/[id] | evaluation.evaluator_username | `evaluation_acknowledged` |
| HR doc uploaded | hr/documents (POST) | employee_username | `document_uploaded` |
| doc expired | cron/document-expiry-check | employee_username | `document_expired` |

- Cron: add Q2 (`expiry_date < today AND expiry_alert_expired_sent=false`) → notify
  `document_expired`, flip flag (idempotency: flip regardless of notify outcome).

## Out of scope (noted, not done in A)

- Evaluations route still uses raw `pyra_activity_log` inserts (not part of the
  item-1 logActivity conversion) — separate small follow-up.
