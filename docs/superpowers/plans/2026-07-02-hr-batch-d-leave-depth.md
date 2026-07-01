# HR Batch D — Leave System Depth (Implementation Plan)

**Goal:** Make the leave subsystem correct + complete: one source of truth,
accurate day-counting, honest cancel, automatic rollover, admin balance control,
and approver context. Also activates the (previously dead) unpaid-leave payroll
deduction.

**Verification:** `pnpm run check` + `pnpm build`; adversarial review; ship.
All balance tables were empty (0 rows) → v2 consolidation is a clean cutover.

## Locked policy decisions
- Day-count excludes **Sunday only** (`WEEKEND_DAYS=[0]`, company weekend).
- Rollover is an **automatic cron** using each type's `max_carry_over` cap
  (default 0 = reset to entitlement; admin sets a cap per type to allow carry).

## Unit 1 — data layer (v2 single source of truth)
- `lib/leave/days.ts` — `countLeaveDays()` weekend-excluding inclusive counter.
- `app/api/leave/route.ts` POST — day_count via countLeaveDays; v2-only balance
  check (enforced), skip for unpaid types, missing-row → default_days.
- `app/api/leave/[id]/route.ts` — approve deducts v2 only; cancel restores only
  UNUSED (future) days + notifies the manager (`leave_cancelled`).
- `lib/hr/create-employee.ts` — seed v2 only (both create + reactivate).
- `app/api/dashboard/route.ts` — self-service balance widget reads v2.
- `lib/notifications/notify.ts` — add `leave_cancelled` type.
- Migration 028 — seed `lt_unpaid` (is_paid=false) → activates payroll deduction.

## Unit 2 — cron + admin surface + approver context
- `app/api/cron/leave-balance-rollover/route.ts` — reuses `calculateCarryOver`
  then seeds any missing next-year rows for active employees. n8n yearly.
- `app/api/hr/leave-balances/route.ts` — GET (all employees × types for a year)
  + POST (adjust/upsert one balance). `leave.manage`.
- `hooks/useLeaveBalancesAdmin.ts`, `/dashboard/hr/leave-balances` page + client
  + AdjustBalanceDialog. Sidebar + module-guide + guide entries.
- `app/api/approvals/team/route.ts` + approvals-client — show requester's
  remaining balance (amber/red when < requested days). Batched, no N+1.

## Deferred (v1.1)
- Public-holidays exclusion in day-count (weekend-only for now).
- Drop the dead v1 `pyra_leave_balances` table + remove its dead references
  (leave/balance route fallback, user-delete cleanup entry) — harmless no-ops.
- Migrate the leave-client off raw fetch/useState onto React Query hooks.
