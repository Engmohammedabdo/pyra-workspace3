# Employee Offboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deliberate "إنهاء خدمة" (exit) action that revokes a leaver's access for real (GoTrue ban + a daily reconcile cron), hands over their live work, records a final settlement as a pending obligation, and writes a permanent `pyra_offboarding` record that survives a re-hire.

**Architecture:** A migration adds `pyra_offboarding` + a `pyra_users.last_working_day` column. A shared `lib/hr/lock-account.ts` bans/unbans at the GoTrue identity layer and is called from three places (the users PATCH deactivation hook, the onboarding-cancel path via the same hook, and a new reconcile cron). A pure `lib/hr/final-settlement.ts` computes the settlement math; a pure/near-pure `lib/hr/handover.ts` builds and executes the handover. A `POST /api/users/[username]/exit` orchestrator ties them together in a fixed order (lock → flip status ALWAYS → execute handover → record settlement → write the offboarding row). The UI is a 3-step `ExitWizard` reached from the user-detail page; the status `Select` in the edit dialog is removed and replaced by three explicit buttons.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgREST + GoTrue self-hosted), `@supabase/supabase-js@2.95.3`, React Query, Tailwind + shadcn/ui, next-intl, Vitest.

## Global Constraints

- **Baseline:** branch `integrate-pending-fixes`, HEAD `3e274ab` (tracks `origin/main`; a bare push deploys prod — confirm before pushing to main).
- **Migration number: `040`** (`039_app_releases` is the highest applied + recorded; `040` is free). ⚠️ `036_push_subscriptions` is an unapplied ledger gap — `pnpm db:check-drift` will flag it; that is pre-existing, not introduced here.
- **DB writes:** `pnpm db:query path/to/file.sql` (ASCII inline only; **any Arabic or any `%` MUST go through a UTF-8 `.sql` file** — cmd.exe eats `%VAR%` and mojibakes Arabic). Apply → verify schema by query → `pnpm db:record 040_pyra_offboarding --by=elharm --notes="..."`. READ-ONLY verification before record.
- **Permission gate:** reuse `hr.manage` for every offboarding route. It already exists (`PERMISSIONS.HR_MANAGE`); admin holds it via the `*` wildcard. **No new permission, no DB-role update needed.**
- **i18n:** `app/dashboard/hr/**`, `app/dashboard/users/**`, `app/api/users/**`, `app/api/hr/**`, `components/hr/**` are ALL in `MIGRATED_PATHS` — a raw Arabic literal there FAILS `pnpm i18n:check`. UI/response Arabic comes from the `hr` namespace (`messages/{ar,en}/hr.json`, add an `offboarding` sub-object). Persisted/notification Arabic uses a trailing `// i18n-exempt: <reason>` comment. Status labels come from `useStatusLabels('offboarding')` (`messages/{ar,en}/statuses.json`), NOT a code map.
- **Data layer:** NEVER raw `fetch()` in components — `fetchAPI`/`mutateAPI` from `@/hooks/api-helpers` (both already unwrap `json.data`). Mutations invalidate their query keys.
- **API conventions:** `requireApiPermission('hr.manage')` from `@/lib/api/auth`; `apiSuccess`/`apiError`/`apiValidationError`/`apiServerError` from `@/lib/api/response`; `logActivity` from `@/lib/api/activity` with `action_type = \`${ENTITY_TYPES.OFFBOARDING}_${ACTIVITY_ACTIONS.X}\`` + flavour in `details.source`; `logError` from `@/lib/observability/log-error` in catches; `notify`/`notifyMany`/`notifyBatch` from `@/lib/notifications/notify`.
- **Fail-CLOSED:** Supabase JS resolves `{ error }`, it does not throw. Every read whose emptiness would silently strand work MUST inspect `error` and abort with `apiServerError`, never treat an error as "no rows".
- **Ordering doctrine (LOCKED):** lock is attempted BEFORE the status flip; the status flip ALWAYS happens even if the lock failed; the response carries `{ locked, lock_error? }`. Never a green toast over a failed lock. No transactions (backup-rollback doctrine) — each step records its own outcome.
- **Page size:** keep files <300 lines. `users-client.tsx` (957) and `app/api/users/[username]/route.ts` (684) are already over — do not grow them; extract where the plan says to.
- **The settlement never notifies the leaver** — the inactive-recipient gate drops it by design. It is an admin-facing artifact. Do not build a notify path to the leaver; do not touch the gate.

---

## File Structure

**Create:**
- `supabase/migrations/040_pyra_offboarding.sql` — the table + the `last_working_day` column.
- `lib/constants/offboarding.ts` — `OFFBOARDING_STATUS`, `EXIT_REASONS`, `EXIT_REASON_KEYS`.
- `lib/hr/lock-account.ts` — `lockAccount` / `unlockAccount` (ban only).
- `lib/hr/final-settlement.ts` — `computeFinalSettlement` (pure) + `deriveDeductibleAbsenceDays` (pure).
- `lib/hr/handover.ts` — `buildHandover` (fail-closed read) + `executeHandover` (service-role writes).
- `app/api/cron/access-reconcile/route.ts` — daily ban/unban reconciliation.
- `app/api/users/[username]/exit/route.ts` — GET (preview) + POST (execute).
- `hooks/useOffboarding.ts` — `useExitPreview` + `useSubmitExit` + `useSetUserStatus`.
- `components/hr/offboarding/ExitWizard.tsx` + `ExitStepDetails.tsx` + `ExitStepHandover.tsx` + `ExitStepConfirm.tsx` + `exit-wizard-helpers.ts` + `ExitWizardSteps.tsx` (barrel).
- `components/users/UserEditDialog.tsx` — extracted edit dialog (removes the status Select).
- `__tests__/lock-account.test.ts`, `__tests__/final-settlement.test.ts`, `__tests__/handover.test.ts`, `__tests__/calculate-item-settlement.test.ts`.

**Modify:**
- `types/database.ts` — add `PyraOffboarding` interface.
- `lib/constants/statuses.ts` — add `EMPLOYEE_PAYMENT_STATUS` note only if needed (no change — `pending` already exists); add nothing to it for source_type (source-types are inline).
- `app/api/dashboard/employee-payments/route.ts:14` — add `'final_settlement'` to `VALID_SOURCE_TYPES` (so a future manual entry validates) — but the exit route inserts directly (see Task 8).
- `app/api/dashboard/payroll/[id]/calculate/route.ts` — exclude `source_type='final_settlement'` from the payments fetch (the money-doesn't-vanish defense).
- `app/api/users/[username]/route.ts` — the deactivation lock hook + unify the `deactivated_at` predicate.
- `lib/auth/team-scope.ts` — filter `getDirectReports` to active reports.
- `lib/hr/create-employee.ts` — `reactivateEmployeeUser` calls `unlockAccount`.
- `lib/api/activity.ts` — add `OFFBOARDING: 'offboarding'` to `ENTITY_TYPES`.
- `lib/notifications/notify.ts` — add offboarding members to `NotificationType`.
- `app/dashboard/users/users-client.tsx` — swap the inline edit dialog for `<UserEditDialog>`.
- `app/dashboard/users/[username]/user-detail-client.tsx` — add the 3 status buttons + the `<ExitWizard>` trigger.
- `messages/ar/hr.json` + `messages/en/hr.json` — `offboarding.*` sub-object.
- `messages/ar/statuses.json` + `messages/en/statuses.json` — `offboarding.*` status labels.
- `lib/config/module-guide.ts` + `app/dashboard/guide/page.tsx` — a guide entry.

---

### Task 1: Migration 040 + types + constants

**Files:**
- Create: `supabase/migrations/040_pyra_offboarding.sql`
- Modify: `types/database.ts` (append `PyraOffboarding`)
- Create: `lib/constants/offboarding.ts`

**Interfaces:**
- Produces: table `pyra_offboarding`; column `pyra_users.last_working_day date NULL`; TS `PyraOffboarding`; `OFFBOARDING_STATUS`, `EXIT_REASONS`, `EXIT_REASON_KEYS`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/040_pyra_offboarding.sql` (ASCII only — no Arabic in this file):

```sql
-- =============================================================
-- Migration 040: Employee Offboarding
-- =============================================================
-- One permanent record per employee exit. Survives a re-hire (no unique
-- constraint on employee_username, exactly like pyra_onboarding). Adds the
-- last_working_day column on pyra_users as a denormalised convenience for
-- payroll/settlement; the pyra_offboarding row is the source of truth.
-- Risk tier: 1 (additive — new table + one nullable column).
-- Forward-only (Phase 14.2).
-- =============================================================

CREATE TABLE IF NOT EXISTS pyra_offboarding (
  id                    varchar(24) PRIMARY KEY,
  employee_username     varchar NOT NULL,
  status                varchar(20) NOT NULL DEFAULT 'completed',
  last_working_day      date NOT NULL,
  exit_reason           varchar(30) NOT NULL,
  exit_notes            text,
  handover              jsonb NOT NULL DEFAULT '{}'::jsonb,
  settlement            jsonb NOT NULL DEFAULT '{}'::jsonb,
  settlement_payment_id varchar(24),
  locked                boolean NOT NULL DEFAULT false,
  lock_error            text,
  started_by            varchar NOT NULL,
  started_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offboarding_employee ON pyra_offboarding(employee_username);
CREATE INDEX IF NOT EXISTS idx_offboarding_status   ON pyra_offboarding(status);

ALTER TABLE pyra_users
  ADD COLUMN IF NOT EXISTS last_working_day date NULL;

-- Verification (run after applying):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'pyra_offboarding' ORDER BY ordinal_position;
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'pyra_users' AND column_name = 'last_working_day';

-- -- DOWN (informational only):
-- -- ALTER TABLE pyra_users DROP COLUMN IF EXISTS last_working_day;
-- -- DROP TABLE IF EXISTS pyra_offboarding;
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm db:query supabase/migrations/040_pyra_offboarding.sql`
Expected: `[]` (no error).

- [ ] **Step 3: Verify the schema landed**

Run:
```bash
pnpm db:query "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'pyra_offboarding' ORDER BY ordinal_position"
```
Expected: 13 columns matching the DDL (`id`, `employee_username`, `status`, `last_working_day`, `exit_reason`, `exit_notes`, `handover`, `settlement`, `settlement_payment_id`, `locked`, `lock_error`, `started_by`, `started_at`).

Run:
```bash
pnpm db:query "SELECT column_name FROM information_schema.columns WHERE table_name = 'pyra_users' AND column_name = 'last_working_day'"
```
Expected: one row, `last_working_day`.

- [ ] **Step 4: Record the migration**

Run: `pnpm db:record 040_pyra_offboarding --by=elharm --notes="offboarding table + pyra_users.last_working_day column"`
Expected: `✅ Recorded` with `version: 040_pyra_offboarding`.

- [ ] **Step 5: Add the TypeScript type**

Append to `types/database.ts` (after the `PyraOnboarding` interface):

```ts
export interface PyraOffboarding {
  id: string;
  employee_username: string;
  status: string; // 'completed' | 'reversed'
  last_working_day: string; // YYYY-MM-DD
  exit_reason: string; // 'resigned' | 'terminated' | 'contract_ended' | 'other'
  exit_notes: string | null;
  handover: Record<string, unknown>;
  settlement: Record<string, unknown>;
  settlement_payment_id: string | null;
  locked: boolean;
  lock_error: string | null;
  started_by: string;
  started_at: string;
}
```

- [ ] **Step 6: Create the constants file**

Create `lib/constants/offboarding.ts`:

```ts
export const OFFBOARDING_STATUS = {
  COMPLETED: 'completed',
  REVERSED: 'reversed', // reserved: an exit undone by mistake (not written in v1)
} as const;

export type OffboardingStatus =
  typeof OFFBOARDING_STATUS[keyof typeof OFFBOARDING_STATUS];

// Stored verbatim in pyra_offboarding.exit_reason. ASCII enum keys (NOT Arabic) —
// the dropdown LABEL is translated via t(`offboarding.exitReasons.${key}`).
export const EXIT_REASONS = [
  'resigned',
  'terminated',
  'contract_ended',
  'other',
] as const;

export type ExitReason = typeof EXIT_REASONS[number];
export const EXIT_REASON_KEYS = EXIT_REASONS; // alias for the parallel-key convention
```

- [ ] **Step 7: Verify types compile**

Run: `pnpm run check`
Expected: `i18n:check ✓ clean` and no tsc errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/040_pyra_offboarding.sql types/database.ts lib/constants/offboarding.ts
git commit -m "feat(offboarding): migration 040 + pyra_offboarding type + constants"
```

---

### Task 2: `lib/hr/lock-account.ts` — the ban primitive

**Files:**
- Create: `lib/hr/lock-account.ts`
- Test: `__tests__/lock-account.test.ts`

**Interfaces:**
- Consumes: `resolveAuthUserId(serviceClient, username): Promise<string | null>` from `@/lib/auth/auth-mapping`; `logError` from `@/lib/observability/log-error`.
- Produces: `lockAccount(serviceClient, username): Promise<{ locked: boolean; error?: string }>`; `unlockAccount(serviceClient, username): Promise<{ unlocked: boolean; error?: string }>`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lock-account.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/auth-mapping', () => ({
  resolveAuthUserId: vi.fn(),
}));
vi.mock('@/lib/observability/log-error', () => ({ logError: vi.fn() }));

import { resolveAuthUserId } from '@/lib/auth/auth-mapping';
import { lockAccount, unlockAccount } from '@/lib/hr/lock-account';

const makeClient = (updateResult: { error: { message: string } | null }) =>
  ({ auth: { admin: { updateUserById: vi.fn().mockResolvedValue(updateResult) } } } as never);

describe('lockAccount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bans the resolved auth user and returns locked:true', async () => {
    (resolveAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue('uid-123');
    const client = makeClient({ error: null });
    const res = await lockAccount(client, 'sayed');
    expect(res).toEqual({ locked: true });
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith('uid-123', { ban_duration: '876000h' });
  });

  it('returns locked:false when the mapping cannot be resolved, without calling GoTrue', async () => {
    (resolveAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const client = makeClient({ error: null });
    const res = await lockAccount(client, 'ghost');
    expect(res.locked).toBe(false);
    expect(res.error).toBe('no_auth_mapping');
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('returns locked:false with the message when GoTrue errors, never throws', async () => {
    (resolveAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue('uid-123');
    const client = makeClient({ error: { message: 'gotrue down' } });
    const res = await lockAccount(client, 'sayed');
    expect(res).toEqual({ locked: false, error: 'gotrue down' });
  });

  it('unlockAccount lifts the ban with ban_duration none', async () => {
    (resolveAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue('uid-123');
    const client = makeClient({ error: null });
    const res = await unlockAccount(client, 'sayed');
    expect(res).toEqual({ unlocked: true });
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith('uid-123', { ban_duration: 'none' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run __tests__/lock-account.test.ts`
Expected: FAIL — cannot resolve `@/lib/hr/lock-account`.

- [ ] **Step 3: Write the implementation**

Create `lib/hr/lock-account.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAuthUserId } from '@/lib/auth/auth-mapping';
import { logError } from '@/lib/observability/log-error';

// ~100 years. GoTrue accepts a Go duration string.
const BAN_DURATION = '876000h';

/**
 * Ban the GoTrue identity so the user can neither log in NOR refresh a token.
 * Ban-only by necessity: session/refresh-token revocation is unreachable from
 * app code (the auth schema is not exposed to PostgREST; service_role holds no
 * grants on auth.*; admin.signOut needs the user's OWN jwt). The residual
 * window is one access-token TTL (measured 3600s). Never throws — returns the
 * outcome so callers can flip status regardless. MUST be given a service-role
 * client (resolveAuthUserId's fallback uses auth.admin).
 */
export async function lockAccount(
  serviceClient: SupabaseClient,
  username: string,
): Promise<{ locked: boolean; error?: string }> {
  try {
    const authId = await resolveAuthUserId(serviceClient, username);
    if (!authId) return { locked: false, error: 'no_auth_mapping' };
    const { error } = await serviceClient.auth.admin.updateUserById(authId, {
      ban_duration: BAN_DURATION,
    });
    if (error) {
      logError({ error, metadata: { fn: 'lockAccount', username } });
      return { locked: false, error: error.message };
    }
    return { locked: true };
  } catch (err) {
    logError({ error: err, metadata: { fn: 'lockAccount', username } });
    return { locked: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Lift the ban (reactivation / re-hire). Idempotent — unbanning an unbanned user is a no-op. */
export async function unlockAccount(
  serviceClient: SupabaseClient,
  username: string,
): Promise<{ unlocked: boolean; error?: string }> {
  try {
    const authId = await resolveAuthUserId(serviceClient, username);
    if (!authId) return { unlocked: false, error: 'no_auth_mapping' };
    const { error } = await serviceClient.auth.admin.updateUserById(authId, {
      ban_duration: 'none',
    });
    if (error) {
      logError({ error, metadata: { fn: 'unlockAccount', username } });
      return { unlocked: false, error: error.message };
    }
    return { unlocked: true };
  } catch (err) {
    logError({ error: err, metadata: { fn: 'unlockAccount', username } });
    return { unlocked: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run __tests__/lock-account.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/hr/lock-account.ts __tests__/lock-account.test.ts
git commit -m "feat(offboarding): lockAccount/unlockAccount GoTrue ban primitive (ban-only)"
```

---

### Task 3: `lib/hr/final-settlement.ts` — the settlement math (TDD)

**Files:**
- Create: `lib/hr/final-settlement.ts`
- Test: `__tests__/final-settlement.test.ts`

**Interfaces:**
- Consumes: `DEDUCTION_DAYS_PER_MONTH` (= 30) + `countDeductibleAbsences` from `@/lib/hr/attendance-policy`.
- Produces: `computeFinalSettlement(input: FinalSettlementInput): FinalSettlement`; `deriveDeductibleAbsenceDays(input: DeriveInput): number`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/final-settlement.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeFinalSettlement, deriveDeductibleAbsenceDays } from '@/lib/hr/final-settlement';

describe('computeFinalSettlement', () => {
  it('reproduces the abdelrahman case exactly (5,133.33 EGP)', () => {
    const s = computeFinalSettlement({
      salary: 14000, currency: 'EGP',
      hireDate: '2026-07-02', lastWorkingDay: '2026-07-14',
      deductibleAbsenceDays: 2,
    });
    expect(s.daily_rate).toBe(466.67);
    expect(s.days_employed).toBe(13);
    expect(s.gross).toBe(6066.67);
    expect(s.absence_deduction).toBe(933.33);
    expect(s.net).toBe(5133.33);
    expect(s.currency).toBe('EGP');
  });

  it('zero absences → net === gross', () => {
    const s = computeFinalSettlement({
      salary: 14000, currency: 'EGP',
      hireDate: '2026-07-02', lastWorkingDay: '2026-07-14',
      deductibleAbsenceDays: 0,
    });
    expect(s.net).toBe(6066.67);
    expect(s.net).toBe(s.gross);
  });

  it('absences >= days employed → net floors at 0', () => {
    const s = computeFinalSettlement({
      salary: 3000, currency: 'AED',
      hireDate: '2026-07-01', lastWorkingDay: '2026-07-03', // 3 days
      deductibleAbsenceDays: 10,
    });
    expect(s.net).toBe(0);
  });

  it('same-day hire and leave → 1 calendar day', () => {
    const s = computeFinalSettlement({
      salary: 3000, currency: 'AED',
      hireDate: '2026-07-02', lastWorkingDay: '2026-07-02',
      deductibleAbsenceDays: 0,
    });
    expect(s.days_employed).toBe(1);
    expect(s.net).toBe(100); // 3000/30 * 1
  });

  it('spans two calendar months (inclusive calendar days)', () => {
    const s = computeFinalSettlement({
      salary: 3000, currency: 'AED',
      hireDate: '2026-06-28', lastWorkingDay: '2026-07-05',
      deductibleAbsenceDays: 0,
    });
    expect(s.days_employed).toBe(8); // Jun 28,29,30 + Jul 1,2,3,4,5
  });
});

describe('deriveDeductibleAbsenceDays', () => {
  it('abdelrahman single month → 2 (07-09 late, 07-10 no-show), capped at last working day', () => {
    const n = deriveDeductibleAbsenceDays({
      hireDateKey: '2026-07-02',
      lastWorkingDayKey: '2026-07-14',
      workDays: [1, 2, 3, 4, 5, 6],
      startHHMM: '11:00',
      onTimeDates: ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-11', '2026-07-13', '2026-07-14'],
      firstAttendanceDateKey: '2026-07-06',
    });
    expect(n).toBe(2);
  });

  it('does NOT count days after the last working day', () => {
    // Same inputs but pretend the run is evaluated well past the exit — the cap must hold.
    const n = deriveDeductibleAbsenceDays({
      hireDateKey: '2026-07-02',
      lastWorkingDayKey: '2026-07-11', // earlier last day
      workDays: [1, 2, 3, 4, 5, 6],
      startHHMM: '11:00',
      onTimeDates: ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-11'],
      firstAttendanceDateKey: '2026-07-06',
    });
    expect(n).toBe(2); // 07-09 + 07-10 only; 07-13/07-14 are past the cap
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run __tests__/final-settlement.test.ts`
Expected: FAIL — cannot resolve `@/lib/hr/final-settlement`.

- [ ] **Step 3: Write the implementation**

Create `lib/hr/final-settlement.ts`:

```ts
import { DEDUCTION_DAYS_PER_MONTH, countDeductibleAbsences } from '@/lib/hr/attendance-policy';

const round2 = (n: number) => Math.round(n * 100) / 100;

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

function calendarDaysInclusive(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Final settlement = (salary/30) × (calendar days employed − deductible absences),
 * floored at 0. The /30 basis is owner-locked: the monthly salary covers every
 * calendar day incl. the paid weekly rest day (lib/hr/attendance-policy.ts:13-16).
 *
 * Net is derived from the UNROUNDED daily rate so the authoritative payable
 * matches the hand-verified 5,133.33 EGP. gross/absence_deduction are each
 * rounded for display and may differ from net by <= 1 cent (a known, harmless
 * independent-rounding artifact at numeric(12,2)).
 */
export function computeFinalSettlement(input: FinalSettlementInput): FinalSettlement {
  const rawDaily = input.salary / DEDUCTION_DAYS_PER_MONTH;
  const days_employed = calendarDaysInclusive(input.hireDate, input.lastWorkingDay);
  const payableDays = Math.max(0, days_employed - input.deductibleAbsenceDays);
  return {
    daily_rate: round2(rawDaily),
    days_employed,
    gross: round2(rawDaily * days_employed),
    absence_days: input.deductibleAbsenceDays,
    absence_deduction: round2(rawDaily * input.deductibleAbsenceDays),
    net: round2(rawDaily * payableDays),
    currency: input.currency,
  };
}

export interface DeriveInput {
  hireDateKey: string;                    // YYYY-MM-DD
  lastWorkingDayKey: string;              // YYYY-MM-DD (the cap)
  workDays: number[];                     // e.g. [1,2,3,4,5,6]; 0 = Sunday
  startHHMM: string;                      // schedule start, e.g. '11:00'
  onTimeDates: string[];                  // dates the employee clocked in on time
  firstAttendanceDateKey: string | null;  // startCountingFrom (don't punish pre-tracking days)
  leaveDates?: string[];
  excusedDates?: string[];
  grace?: number;
}

/**
 * Sum deductible absences across every calendar month the employee was employed,
 * capping the count at lastWorkingDayKey (countDeductibleAbsences has no departure
 * cap of its own — its only bound is todayKey, so we feed it lastWorkingDayKey).
 * nowUaeMinutes = 1440 (end of day): every evaluated date is at or before a past
 * last-working-day, so the "today's grace hasn't elapsed" skip never applies.
 */
export function deriveDeductibleAbsenceDays(input: DeriveInput): number {
  const startMonth = input.hireDateKey.slice(0, 7);   // YYYY-MM
  const endMonth = input.lastWorkingDayKey.slice(0, 7);
  let total = 0;
  let [y, m] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${monthKey}-${String(lastDayOfMonth).padStart(2, '0')}`;
    const todayKey = monthEnd < input.lastWorkingDayKey ? monthEnd : input.lastWorkingDayKey;
    total += countDeductibleAbsences({
      monthKey,
      todayKey,
      workDays: input.workDays,
      startHHMM: input.startHHMM,
      nowUaeMinutes: 1440,
      onTimeDates: input.onTimeDates,
      leaveDates: input.leaveDates,
      excusedDates: input.excusedDates,
      hireDateKey: input.hireDateKey,
      startCountingFrom: input.firstAttendanceDateKey ?? undefined,
      grace: input.grace,
    });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return total;
}
```

> Note: confirm the exact optional-param names of `countDeductibleAbsences` against `lib/hr/attendance-policy.ts` (`monthKey, todayKey, workDays, startHHMM, nowUaeMinutes, onTimeDates, leaveDates?, excusedDates?, hireDateKey?, startCountingFrom?, grace?`). If `startCountingFrom` expects `string | undefined`, the `?? undefined` above is correct.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run __tests__/final-settlement.test.ts`
Expected: PASS (7 tests). If `deriveDeductibleAbsenceDays` returns the wrong count, re-check the param names against the real `countDeductibleAbsences` signature.

- [ ] **Step 5: Commit**

```bash
git add lib/hr/final-settlement.ts __tests__/final-settlement.test.ts
git commit -m "feat(offboarding): pure final-settlement math + deductible-absence derivation"
```

---

### Task 4: Teach the money rails about `final_settlement`

**Files:**
- Modify: `app/api/dashboard/employee-payments/route.ts:14` (validation allowlist)
- Modify: `app/api/dashboard/payroll/[id]/calculate/route.ts` (exclude from the run fetch)
- Test: `__tests__/calculate-item-settlement.test.ts`

**Interfaces:**
- Produces: `'final_settlement'` recognised by the employee-payments POST validation; guaranteed NOT consumed by a payroll run.

**Why the exclusion (not "add it as a payroll bucket"):** the spec's goal is "money must not vanish." `calculate-item.ts` sums by exact `source_type` match, so `final_settlement` contributes 0 to `net_pay` — but the calculate ROUTE consumes **every fetched payment** into `linkedPaymentIds` and stamps `payroll_id`, marking it paid. Adding it as a net_pay bucket would DOUBLE-pay it (once via the run, once via the manual mark-paid). The correct, minimal fix is to **exclude `final_settlement` rows from the run's payments fetch** so a run never touches them; the settlement is paid off-cycle only.

- [ ] **Step 1: Write the failing test (route-level guard is integration-shaped; assert the filter constant instead)**

Create `__tests__/calculate-item-settlement.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculatePayrollItem } from '@/lib/payroll/calculate-item';

// Guard: a final_settlement payment must contribute 0 to net_pay even if it
// somehow reaches the pure calc (defense in depth behind the route exclusion).
describe('calculatePayrollItem ignores final_settlement', () => {
  it('does not fold a final_settlement row into any bucket', () => {
    const withSettlement = calculatePayrollItem({
      baseSalary: 10000, hourlyRate: 0, hireDate: null,
      payments: [{ source_type: 'final_settlement', amount: 5133.33 }],
      overtimeTimesheets: [], unpaidLeave: [],
    } as never);
    const without = calculatePayrollItem({
      baseSalary: 10000, hourlyRate: 0, hireDate: null,
      payments: [], overtimeTimesheets: [], unpaidLeave: [],
    } as never);
    expect(withSettlement.net_pay).toBe(without.net_pay);
  });
});
```

> Confirm the exact `PayrollItemInput` shape from `lib/payroll/calculate-item.ts` (fields `baseSalary`, `hourlyRate`, `hireDate`, `payments`, `overtimeTimesheets`, `unpaidLeave`, and the `prorationFactor?`). Adjust the test object to match; the assertion (equal net_pay with/without the row) is the invariant.

- [ ] **Step 2: Run test to verify it passes already OR fails**

Run: `pnpm test -- --run __tests__/calculate-item-settlement.test.ts`
Expected: PASS immediately — `calculatePayrollItem` already ignores unknown source_types. This test **pins** that behavior so a later "add final_settlement to a bucket" change can't silently double-pay.

- [ ] **Step 3: Add `final_settlement` to the employee-payments validation allowlist**

In `app/api/dashboard/employee-payments/route.ts`, line 14, change:

```ts
const VALID_SOURCE_TYPES = ['task', 'overtime', 'bonus', 'deduction', 'commission'];
```
to:
```ts
const VALID_SOURCE_TYPES = ['task', 'overtime', 'bonus', 'deduction', 'commission', 'final_settlement'];
```

- [ ] **Step 4: Exclude `final_settlement` from the payroll run's payments fetch**

In `app/api/dashboard/payroll/[id]/calculate/route.ts`, locate the employee-payments fetch (around lines 100-108, the query selecting `pyra_employee_payments` with `.eq('status','approved')` and the `payroll_id IS NULL` filter). Add a `.neq('source_type', 'final_settlement')` to that query builder, with a comment:

```ts
      // A final_settlement is an off-cycle obligation paid manually — never
      // swept into a monthly run (which would mark it paid without paying it).
      .neq('source_type', 'final_settlement')
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm run check` → clean. Run: `pnpm test -- --run __tests__/calculate-item-settlement.test.ts` → PASS.

```bash
git add app/api/dashboard/employee-payments/route.ts "app/api/dashboard/payroll/[id]/calculate/route.ts" __tests__/calculate-item-settlement.test.ts
git commit -m "feat(offboarding): recognise final_settlement source_type; exclude it from payroll runs"
```

---

### Task 5: Deactivation lock hook + the two PATCH defects + re-hire unlock

**Files:**
- Modify: `app/api/users/[username]/route.ts` (the B2 block region, ~450-483)
- Modify: `lib/auth/team-scope.ts` (`getDirectReports` active filter)
- Modify: `lib/hr/create-employee.ts` (`reactivateEmployeeUser` unlock)

**Interfaces:**
- Consumes: `lockAccount`, `unlockAccount` from `@/lib/hr/lock-account`.
- Produces: every `active → inactive|suspended` transition through the users PATCH bans the GoTrue user; every reactivation unbans; `getDirectReports` returns active reports only.

- [ ] **Step 1: Filter `getDirectReports` to active reports**

In `lib/auth/team-scope.ts`, the `getDirectReports` body (~lines 14-31) selects `pyra_users` where `manager_username = managerUsername`. Add `.eq('status', 'active')` to that query. Confirmed current code has no status filter. After the change the query reads:

```ts
    .from('pyra_users')
    .select('username')
    .eq('manager_username', managerUsername)
    .eq('status', 'active');
```

- [ ] **Step 2: Add the lock hook to the users PATCH B2 block**

In `app/api/users/[username]/route.ts`, the B2 block (lines 450-483) already fires on `(body.status === 'inactive' || body.status === 'suspended') && existingUser.status !== body.status` and already constructs `const deactServiceClient = createServiceRoleClient();` (line 459). Import `lockAccount` at the top (near the other `@/lib/hr` / auth imports):

```ts
import { lockAccount } from '@/lib/hr/lock-account';
```

Inside the `try` of the B2 block, BEFORE the `getDirectReports` call, add the ban and record its outcome for the alert:

```ts
        // Lock the identity layer. Deactivation alone does NOT revoke access —
        // GoTrue knows nothing about pyra_users.status, so an unbanned inactive
        // user can mint a fresh token and reach PostgREST directly (Gap #3).
        const lockResult = await lockAccount(deactServiceClient, username);
        if (!lockResult.locked) {
          logError({
            error: new Error(lockResult.error ?? 'lock failed'),
            metadata: { fn: 'PATCH /api/users deactivation lock', username },
          });
        }
```

(`logError` is already imported at line 18.) The B2 block is non-blocking by doctrine — a lock failure is logged; the status flip already committed at line ~418. The daily reconcile cron (Task 6) is the retry path. Leave the existing `getDirectReports` + admin-alert code below it unchanged (it now reports active reports only, from Step 1).

> This covers BOTH the users PATCH deactivation AND — because the onboarding-cancel path at `app/api/hr/onboarding/[id]/route.ts:238` writes `status:'inactive'` via a **service-role** client that bypasses this route — it does NOT cover onboarding-cancel. That gap is closed by the reconcile cron (Task 6), which is why the cron is mandatory, not optional.

- [ ] **Step 3: Unify the `deactivated_at` predicate (defect fix)**

In the status block (lines 273-277), the stamp fires on `existingUser.status === 'active'`, but the B2 alert fires on `existingUser.status !== body.status`, so `suspended → inactive` re-alerts but does not re-stamp. Change line 273 from:

```ts
      if ((body.status === 'inactive' || body.status === 'suspended') && existingUser.status === 'active') {
```
to:
```ts
      if ((body.status === 'inactive' || body.status === 'suspended') && existingUser.status !== body.status) {
```

This stamps `deactivated_at` on any real transition into an inactive state (including `suspended → inactive`), matching the B2 predicate. (Cleared to `null` on `→ active` stays unchanged at line 275-276.)

- [ ] **Step 4: Unlock on reactivation / re-hire**

In `lib/hr/create-employee.ts`, `reactivateEmployeeUser` writes `status: 'active'` (line 332) and resets the password (~374-383) but never clears `banned_until`. After the password-reset block, add the unlock. Import at the top (near line 24):

```ts
import { unlockAccount } from '@/lib/hr/lock-account';
```

After the `serviceClient.auth.admin.updateUserById(authId, { password })` call, add:

```ts
    // Lift any offboarding ban so the re-hired user can actually log in.
    // (create-employee only reset the password; the ban is separate.)
    const unlock = await unlockAccount(serviceClient, cleanUsername);
    if (!unlock.unlocked) {
      // Non-fatal: the reconcile cron will lift it on its next run.
      console.error('[reactivateEmployeeUser] unlock failed:', unlock.error);
    }
```

- [ ] **Step 5: Verify**

Run: `pnpm run check` → clean. Run: `pnpm test -- --run` → all green (no test regressions).

- [ ] **Step 6: Manual smoke (documented, not automated)**

This is verified end-to-end via the cron in Task 6. For now confirm the code compiles and the existing users-route tests (if any) pass.

- [ ] **Step 7: Commit**

```bash
git add "app/api/users/[username]/route.ts" lib/auth/team-scope.ts lib/hr/create-employee.ts
git commit -m "feat(offboarding): ban on deactivate + unban on re-hire; fix getDirectReports status filter + deactivated_at predicate"
```

---

### Task 6: `/api/cron/access-reconcile` — the safety net

**Files:**
- Create: `app/api/cron/access-reconcile/route.ts`

**Interfaces:**
- Consumes: `getExternalAuth` from `@/lib/api/external-auth`; `createServiceRoleClient`; `lockAccount`/`unlockAccount`; `notifyMany`; `logError`; `apiSuccess`/`apiError`/`apiServerError`.
- Produces: a daily idempotent reconciliation. Asserts every non-active user is banned and every active user is not banned.

- [ ] **Step 1: Write the route**

Create `app/api/cron/access-reconcile/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { lockAccount, unlockAccount } from '@/lib/hr/lock-account';
import { notifyMany } from '@/lib/notifications/notify';
import { logError } from '@/lib/observability/log-error';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401); // i18n-exempt: external cron response
    const perms = ctx.apiKey.permissions as string[];
    if (!perms.includes('cron.access-reconcile') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.access-reconcile', 403); // i18n-exempt: external cron response
    }

    const supabase = createServiceRoleClient();

    // Join pyra_users → mapping → auth.users is not reachable via PostgREST
    // (auth schema not exposed). So: read all users + their auth_user_id from
    // pyra_auth_mapping, then check banned_until per user is not feasible either
    // (auth.users not exposed). Reconciliation therefore ASSERTS the desired
    // ban state unconditionally via GoTrue admin (idempotent): re-banning a
    // banned user and re-unbanning an active user are both no-ops.
    const { data: users, error } = await supabase
      .from('pyra_users')
      .select('username, status');
    if (error) {
      logError({ error, request, metadata: { fn: 'cron/access-reconcile', step: 'fetch users' } });
      return apiServerError();
    }

    let banned = 0, unbanned = 0;
    const failures: string[] = [];
    for (const u of users ?? []) {
      if (u.status !== 'active') {
        const r = await lockAccount(supabase, u.username);
        if (r.locked) banned += 1;
        else failures.push(`${u.username}:lock:${r.error}`);
      } else {
        const r = await unlockAccount(supabase, u.username);
        if (r.unlocked) unbanned += 1;
        else failures.push(`${u.username}:unlock:${r.error}`);
      }
    }

    // A non-empty failures list means a write path bypassed the PATCH hook —
    // surface it to active admins so it doesn't rot silently.
    if (failures.length > 0) {
      const { data: admins } = await supabase
        .from('pyra_users')
        .select('username')
        .eq('role', 'admin')
        .eq('status', 'active');
      await notifyMany(
        supabase,
        (admins ?? []).map((a: { username: string }) => a.username),
        {
          type: 'system',
          title: 'تعذّر ضبط قفل بعض الحسابات', // i18n-exempt: notification content (Phase 8)
          message: `فشل ضبط ${failures.length} حساب أثناء المطابقة اليومية`, // i18n-exempt: notification content (Phase 8)
          link: '/dashboard/users',
          from: { username: 'system' },
        },
      );
    }

    return apiSuccess({ banned, unbanned, failures });
  } catch (err) {
    logError({ error: err, request, metadata: { fn: 'cron/access-reconcile' } });
    console.error('[cron/access-reconcile] threw:', err);
    return apiServerError();
  }
}
```

> **Design note on idempotency-by-assertion:** because `auth.users.banned_until` is not readable via PostgREST, the cron cannot "check then fix" — it unconditionally asserts the desired ban state every run. `lockAccount`/`unlockAccount` are idempotent at GoTrue, so re-asserting is safe (a no-op on already-correct rows). This means every run makes one GoTrue call per user (~7 today); acceptable at this scale. If the user count grows large, v1.1 can add a readable ban-state cache. Documented so it isn't mistaken for a bug.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm run check` → clean.

- [ ] **Step 3: Regression test — the first live run must find zero lock failures**

All six inactive users were locked by hand on 2026-07-15. Trigger the cron with the scoped cron key (the `'Integration'` `*` key, per Phase D). Run (replace `$KEY` with the cron API key from operational config — do NOT hardcode it in the repo):

```bash
curl -s -X POST "https://workspace.pyramedia.cloud/api/cron/access-reconcile" -H "x-api-key: $KEY" | python -m json.tool
```
Expected: `{ "data": { "banned": <count of inactive users>, "unbanned": <count of active users>, "failures": [] } }` — **`failures` MUST be empty.** A non-empty list means a username has no `pyra_auth_mapping` row (investigate that user).

- [ ] **Step 4: Wire the n8n daily trigger (operational, documented)**

Add an HTTP Request node to the **PyraHR_Cron** n8n workflow (`AeXwITpSmaZ5jg9V`): daily 06:00 UTC (10:00 Dubai), `POST https://workspace.pyramedia.cloud/api/cron/access-reconcile`, header `x-api-key: <scoped cron key>`. This is a manual n8n step — record it in the commit body, do not attempt it from code.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/access-reconcile/route.ts
git commit -m "feat(offboarding): daily access-reconcile cron (assert every inactive user is banned, every active user is not)"
```

---

### Task 7: `lib/hr/handover.ts` — build + execute the handover

**Files:**
- Create: `lib/hr/handover.ts`
- Test: `__tests__/handover.test.ts`

**Interfaces:**
- Consumes: `isAssignableUser` from `@/lib/auth/lead-scope`; `notifyBatch` from `@/lib/notifications/notify`; `PIPELINE_FINAL_STAGES` from `@/lib/constants/statuses`.
- Produces: `isOpenLeadStage(stageId): boolean` (pure); `buildHandover(serviceClient, username): Promise<HandoverList>` (fail-closed); `executeHandover(serviceClient, username, decisions, actor): Promise<HandoverResult>`.

- [ ] **Step 1: Write the failing test (the pure terminal-stage derivation + the fail-closed contract)**

Create `__tests__/handover.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isOpenLeadStage } from '@/lib/hr/handover';

describe('isOpenLeadStage', () => {
  it('treats the codebase terminal stages (closed_won/closed_lost) as NOT open', () => {
    expect(isOpenLeadStage('stg_closed_won')).toBe(false);
    expect(isOpenLeadStage('stg_closed_lost')).toBe(false);
  });
  it('treats active + custom (ps_*) + null stages as open (safe over-inclusion)', () => {
    expect(isOpenLeadStage('stg_discovery_call')).toBe(true);
    expect(isOpenLeadStage('stg_new_inquiry')).toBe(true);
    expect(isOpenLeadStage('ps_85AlKP8d7mA7HAO9')).toBe(true); // custom stage — safe to show for handover
    expect(isOpenLeadStage(null)).toBe(true);
  });
});
```

> **CORRECTED APPROACH (verified against the live DB 2026-07-20):** the plan
> originally proposed deriving terminal stages from a `pyra_pipeline_stages`
> table with `is_won`/`is_lost` columns. **That is WRONG — that table is EMPTY
> (0 rows) and has no such columns** (its real columns are `id, pipeline_id,
> stage, status, ...`). The codebase already defines the canonical terminal set
> as the constant **`PIPELINE_FINAL_STAGES = ['stg_closed_won', 'stg_closed_lost']`**
> in `lib/constants/statuses.ts`. Use it. A lead is OPEN for handover when
> `archived_at IS NULL AND stage_id NOT IN PIPELINE_FINAL_STAGES` (a NULL or
> custom `ps_*` stage counts as open — safe over-inclusion; the admin can pick
> "leave"). Do NOT read `pyra_pipeline_stages`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run __tests__/handover.test.ts`
Expected: FAIL — cannot resolve `@/lib/hr/handover`.

- [ ] **Step 3: Write the implementation**

Create `lib/hr/handover.ts`. Adapt column names to the confirmed schema from Step 1:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAssignableUser } from '@/lib/auth/lead-scope';
import { notifyBatch } from '@/lib/notifications/notify';
import { PIPELINE_FINAL_STAGES } from '@/lib/constants/statuses';

/** A lead needs handover unless it is archived or in a codebase-terminal stage.
 *  NULL/custom stages count as open (safe over-inclusion — admin can pick "leave"). */
export function isOpenLeadStage(stageId: string | null): boolean {
  if (stageId === null) return true;
  return !(PIPELINE_FINAL_STAGES as readonly string[]).includes(stageId);
}

export interface HandoverItem { id: string; label: string }
export interface HandoverList {
  leads: HandoverItem[];
  follow_ups: HandoverItem[];
  tasks: HandoverItem[];
  whatsapp: HandoverItem[];
  lead_tasks: HandoverItem[];
  direct_reports: HandoverItem[];        // active reports whose manager is the leaver
  external_files: { count: number; hosts: string[] };  // EXTERNAL-DEPENDENCY — warn only
  access: { board_members: number; team_members: number; wa_settings: number; favorites: number };
}

class HandoverReadError extends Error {}

async function orThrow<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, ctx: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new HandoverReadError(`${ctx}: ${error.message}`);
  return (data ?? []) as unknown as T;
}

/**
 * Read every WORK/ACCESS/EXTERNAL source still tied to `username`. FAIL-CLOSED:
 * any read error throws HandoverReadError so the caller aborts the exit rather
 * than showing an empty list (Supabase returns {error}, not a throw, so a bad
 * column would otherwise read as "nothing to hand over").
 */
export async function buildHandover(serviceClient: SupabaseClient, username: string): Promise<HandoverList> {
  // Terminal stages come from the codebase constant PIPELINE_FINAL_STAGES (via
  // isOpenLeadStage) — pyra_pipeline_stages is empty and has no won/lost columns.
  // A NULL or custom (ps_*) stage counts as open (safe over-inclusion; admin
  // picks "leave").
  const leadRows = (await orThrow(
    serviceClient.from('pyra_sales_leads')
      .select('id, name, stage_id')
      .eq('assigned_to', username)
      .is('archived_at', null),
    'leads',
  )) as { id: string; name: string | null; stage_id: string | null }[];
  const leads = leadRows.filter((l) => isOpenLeadStage(l.stage_id));

  const followUps = (await orThrow(
    serviceClient.from('pyra_sales_follow_ups').select('id, title, status').eq('assigned_to', username).in('status', ['pending', 'overdue']),
    'follow_ups',
  )) as { id: string; title: string | null }[];

  // Board tasks — two explicit reads (avoids a fragile nested-join alias):
  // 1) task_ids assigned to the leaver, 2) which of those are OPEN.
  const assignRows = (await orThrow(
    serviceClient.from('pyra_task_assignees').select('task_id').eq('username', username),
    'task_assignees',
  )) as { task_id: string }[];
  const assignedTaskIds = assignRows.map((a) => a.task_id);
  let openTasks: { id: string; title: string | null }[] = [];
  if (assignedTaskIds.length) {
    const taskRows = (await orThrow(
      serviceClient.from('pyra_tasks')
        .select('id, title, is_archived, column_id, pyra_board_columns!inner(is_done_column)')
        .in('id', assignedTaskIds)
        .eq('is_archived', false),
      'tasks',
    )) as { id: string; title: string | null; pyra_board_columns: { is_done_column: boolean } | null }[];
    openTasks = taskRows
      .filter((t) => !t.pyra_board_columns?.is_done_column)
      .map((t) => ({ id: t.id, title: t.title }));
  }
  // NOTE: confirm the FK alias `pyra_board_columns` on pyra_tasks.column_id via
  // the schema (SELECT ... information_schema). If the embed name differs, adjust
  // the select + the .filter accessor; the two-step shape stays the same.

  const waConvs = (await orThrow(
    serviceClient.from('pyra_whatsapp_conversations').select('id, contact_name, status').eq('assigned_to', username).eq('status', 'open'),
    'whatsapp',
  )) as { id: string; contact_name: string | null }[];

  const leadTasks = (await orThrow(
    serviceClient.from('pyra_lead_tasks').select('id, title, status').eq('assigned_to', username).neq('status', 'completed'),
    'lead_tasks',
  )) as { id: string; title: string | null }[];

  const reports = (await orThrow(
    serviceClient.from('pyra_users').select('username, display_name').eq('manager_username', username).eq('status', 'active'),
    'direct_reports',
  )) as { username: string; display_name: string }[];

  const attachments = (await orThrow(
    serviceClient.from('pyra_task_attachments').select('file_url').eq('uploaded_by', username),
    'attachments',
  )) as { file_url: string | null }[];
  const hosts = [...new Set(attachments.map((a) => {
    try { return new URL(a.file_url ?? '').hostname; } catch { return 'unknown'; }
  }))];

  const [bm, tm, was, fav] = await Promise.all([
    orThrow(serviceClient.from('pyra_board_members').select('id').eq('username', username), 'board_members'),
    orThrow(serviceClient.from('pyra_team_members').select('id').eq('username', username), 'team_members'),
    orThrow(serviceClient.from('pyra_agent_whatsapp_settings').select('id').eq('agent_username', username), 'wa_settings'),
    orThrow(serviceClient.from('pyra_favorites').select('id').eq('username', username), 'favorites'),
  ]) as { id: string }[][];

  return {
    leads: leads.map((l) => ({ id: l.id, label: l.name ?? l.id })),
    follow_ups: followUps.map((f) => ({ id: f.id, label: f.title ?? f.id })),
    whatsapp: waConvs.map((c) => ({ id: c.id, label: c.contact_name ?? c.id })),
    lead_tasks: leadTasks.map((t) => ({ id: t.id, label: t.title ?? t.id })),
    direct_reports: reports.map((r) => ({ id: r.username, label: r.display_name })),
    tasks: openTasks.map((t) => ({ id: t.id, label: t.title ?? t.id })),
    external_files: { count: attachments.length, hosts },
    access: { board_members: bm.length, team_members: tm.length, wa_settings: was.length, favorites: fav.length },
  };
}

export interface HandoverDecisions {
  leads?: { action: 'reassign' | 'leave'; to?: string };
  follow_ups?: { action: 'reassign' | 'leave'; to?: string };
  tasks?: { action: 'reassign' | 'archive' | 'leave'; to?: string };
  whatsapp?: { action: 'reassign' | 'leave'; to?: string };
  lead_tasks?: { action: 'reassign' | 'leave'; to?: string };
  direct_reports?: { action: 'reparent' | 'leave'; to?: string };
  external_files_acknowledged?: boolean;
}
export interface HandoverResult { errors: string[]; applied: Record<string, unknown> }

/**
 * Execute the admin's decisions with service-role writes. Reassign targets are
 * validated via isAssignableUser (the writes bypass RLS, so we self-enforce).
 * ACCESS rows are always removed. AUDIT rows are never touched. Best-effort:
 * per-source errors are collected, not thrown — the exit continues and records
 * the outcome (no transaction, backup-rollback doctrine).
 */
export async function executeHandover(
  serviceClient: SupabaseClient,
  username: string,
  decisions: HandoverDecisions,
  actor: { username: string; display_name: string },
): Promise<HandoverResult> {
  const errors: string[] = [];
  const applied: Record<string, unknown> = {};

  async function validate(to: string | undefined, ctx: string): Promise<string | null> {
    if (!to) { errors.push(`${ctx}: no target`); return null; }
    if (!(await isAssignableUser(serviceClient, to))) { errors.push(`${ctx}: target not assignable`); return null; }
    return to;
  }

  // Leads
  if (decisions.leads?.action === 'reassign') {
    const to = await validate(decisions.leads.to, 'leads');
    if (to) {
      const { data: leadRows } = await serviceClient.from('pyra_sales_leads').select('id, name').eq('assigned_to', username).is('archived_at', null);
      const ids = (leadRows ?? []).map((l: { id: string }) => l.id);
      if (ids.length) {
        const { error } = await serviceClient.from('pyra_sales_leads').update({ assigned_to: to, updated_at: new Date().toISOString() }).in('id', ids);
        if (error) errors.push(`leads: ${error.message}`);
        else {
          applied.leads = { reassigned_to: to, count: ids.length };
          await notifyBatch(serviceClient, (leadRows ?? []).map((l: { id: string; name: string | null }) => ({
            to, type: 'lead_transferred',
            title: 'تم تحويل Lead لك', // i18n-exempt: notification content (Phase 8)
            message: `${actor.display_name} حوّل Lead "${l.name ?? 'بدون اسم'}" إليك`, // i18n-exempt: notification content (Phase 8)
            link: `/dashboard/crm/leads/${l.id}`,
            entity: { type: 'lead', id: l.id },
            from: { username: actor.username, displayName: actor.display_name },
          })));
        }
      }
    }
  }

  // Follow-ups (no existing endpoint — direct write is the fix for the gap)
  if (decisions.follow_ups?.action === 'reassign') {
    const to = await validate(decisions.follow_ups.to, 'follow_ups');
    if (to) {
      const { data, error } = await serviceClient.from('pyra_sales_follow_ups').update({ assigned_to: to, updated_at: new Date().toISOString() }).eq('assigned_to', username).in('status', ['pending', 'overdue']).select('id');
      if (error) errors.push(`follow_ups: ${error.message}`);
      else applied.follow_ups = { reassigned_to: to, count: (data ?? []).length };
    }
  }

  // WhatsApp
  if (decisions.whatsapp?.action === 'reassign') {
    const to = await validate(decisions.whatsapp.to, 'whatsapp');
    if (to) {
      const { data, error } = await serviceClient.from('pyra_whatsapp_conversations').update({ assigned_to: to }).eq('assigned_to', username).eq('status', 'open').select('id');
      if (error) errors.push(`whatsapp: ${error.message}`);
      else applied.whatsapp = { reassigned_to: to, count: (data ?? []).length };
    }
  }

  // Lead tasks
  if (decisions.lead_tasks?.action === 'reassign') {
    const to = await validate(decisions.lead_tasks.to, 'lead_tasks');
    if (to) {
      const { data, error } = await serviceClient.from('pyra_lead_tasks').update({ assigned_to: to }).eq('assigned_to', username).neq('status', 'completed').select('id');
      if (error) errors.push(`lead_tasks: ${error.message}`);
      else applied.lead_tasks = { reassigned_to: to, count: (data ?? []).length };
    }
  }

  // Board tasks: reassign = repoint the pyra_task_assignees row to the target;
  // archive = set pyra_tasks.is_archived. Operates on the leaver's OPEN task ids.
  if (decisions.tasks && decisions.tasks.action !== 'leave') {
    const { data: assigns } = await serviceClient.from('pyra_task_assignees').select('task_id').eq('username', username);
    const taskIds = (assigns ?? []).map((a: { task_id: string }) => a.task_id);
    if (taskIds.length) {
      if (decisions.tasks.action === 'archive') {
        const { error } = await serviceClient.from('pyra_tasks').update({ is_archived: true }).in('id', taskIds);
        if (error) errors.push(`tasks: ${error.message}`);
        else applied.tasks = { archived: true, count: taskIds.length };
      } else if (decisions.tasks.action === 'reassign') {
        const to = await validate(decisions.tasks.to, 'tasks');
        if (to) {
          const { error } = await serviceClient.from('pyra_task_assignees').update({ username: to }).eq('username', username).in('task_id', taskIds);
          if (error) errors.push(`tasks: ${error.message}`);
          else applied.tasks = { reassigned_to: to, count: taskIds.length };
        }
      }
    }
  }

  // Direct reports re-parent
  if (decisions.direct_reports?.action === 'reparent') {
    const to = await validate(decisions.direct_reports.to, 'direct_reports');
    if (to) {
      const { data, error } = await serviceClient.from('pyra_users').update({ manager_username: to }).eq('manager_username', username).eq('status', 'active').select('username');
      if (error) errors.push(`direct_reports: ${error.message}`);
      else applied.direct_reports = { reparented_to: to, count: (data ?? []).length };
    }
  }

  // ACCESS — always removed (best-effort; a failure is logged, not fatal)
  for (const [table, col] of [
    ['pyra_board_members', 'username'],
    ['pyra_team_members', 'username'],
    ['pyra_agent_whatsapp_settings', 'agent_username'],
    ['pyra_favorites', 'username'],
  ] as const) {
    const { error } = await serviceClient.from(table).delete().eq(col, username);
    if (error) errors.push(`${table}: ${error.message}`);
  }

  applied.external_files = { acknowledged: decisions.external_files_acknowledged === true };
  return { errors, applied };
}
```

> This file is large and touches many tables. Split into `handover-build.ts` + `handover-execute.ts` if it exceeds ~300 lines. Several joins (board tasks) need the confirmed FK/alias shapes — verify each `.from(...).select(...)` against the real schema before running, and populate the `tasks` list + board-task execution accordingly. The `deriveTerminalStageIds` unit test is the only automated gate here; the rest is verified by the manual dry-run in Task 8.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run __tests__/handover.test.ts`
Expected: PASS (2 tests). Run `pnpm run check` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib/hr/handover.ts __tests__/handover.test.ts
git commit -m "feat(offboarding): handover build (fail-closed) + execute (service-role reassign/remove)"
```

---

### Task 8: `POST /api/users/[username]/exit` — the orchestrator (+ GET preview)

**Files:**
- Create: `app/api/users/[username]/exit/route.ts`
- Modify: `lib/api/activity.ts` (add `OFFBOARDING`)
- Modify: `lib/notifications/notify.ts` (add offboarding `NotificationType` members)

**Interfaces:**
- Consumes: everything from Tasks 2, 3, 7; `requireApiPermission`; `createServiceRoleClient`; `computeFinalSettlement`/`deriveDeductibleAbsenceDays`; `buildHandover`/`executeHandover`; `lockAccount`; `logActivity`; `generateId`.
- Produces: `GET` → `{ employee, handover, settlement_preview }`; `POST` → `{ offboarding_id, locked, lock_error?, settlement, handover_results }`.

- [ ] **Step 1: Add the entity type + notification types**

In `lib/api/activity.ts`, add to `ENTITY_TYPES` (after `EVALUATION: 'evaluation',`):

```ts
  OFFBOARDING: 'offboarding',
```

In `lib/notifications/notify.ts`, add to the `NotificationType` union (the `type` field also accepts a raw string, but follow convention): add `| 'offboarding_completed'`.

- [ ] **Step 2: Write the GET preview handler**

Create `app/api/users/[username]/exit/route.ts`. The GET builds the handover + a settlement preview (using the same derivation the POST will use, so the number the admin confirms is the number that gets recorded):

```ts
import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, apiValidationError, apiServerError } from '@/lib/api/response';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { generateId } from '@/lib/utils/id';
import { lockAccount } from '@/lib/hr/lock-account';
import { buildHandover, executeHandover, type HandoverDecisions } from '@/lib/hr/handover';
import { computeFinalSettlement, deriveDeductibleAbsenceDays } from '@/lib/hr/final-settlement';
import { isOnTimeClockIn } from '@/lib/hr/attendance-policy';
import { dubaiDayKey } from '@/lib/utils/format';

type RouteParams = { params: Promise<{ username: string }> };

// Derive the settlement inputs (deductible-absence days) from attendance + schedule,
// capped at lastWorkingDay. Shared by GET (preview) and POST (record).
async function computeSettlement(
  supabase: ReturnType<typeof createServiceRoleClient>,
  user: { salary: number | null; salary_currency: string | null; hire_date: string | null; work_schedule_id: string | null; username: string },
  lastWorkingDay: string,
) {
  const salary = Number(user.salary ?? 0);
  const currency = user.salary_currency ?? 'AED';
  const hireDate = (user.hire_date ?? lastWorkingDay).slice(0, 10);

  // Schedule (fall back to the default schedule if unset)
  let workDays = [1, 2, 3, 4, 5, 6];
  let startHHMM = '11:00';
  if (user.work_schedule_id) {
    const { data: sched } = await supabase.from('pyra_work_schedules').select('work_days, start_time').eq('id', user.work_schedule_id).maybeSingle();
    if (sched?.work_days) workDays = sched.work_days as number[];
    if (sched?.start_time) startHHMM = String(sched.start_time).slice(0, 5);
  }

  // Attendance between hire and last working day → on-time date set
  const { data: att } = await supabase.from('pyra_attendance').select('date, clock_in').eq('username', user.username).gte('date', hireDate).lte('date', lastWorkingDay);
  const rows = (att ?? []) as { date: string; clock_in: string | null }[];
  const onTimeDates = rows.filter((r) => r.clock_in && isOnTimeClockIn(r.clock_in, startHHMM)).map((r) => r.date.slice(0, 10));
  const firstAttendanceDateKey = rows.length ? rows.map((r) => r.date.slice(0, 10)).sort()[0] : null;

  const deductibleAbsenceDays = deriveDeductibleAbsenceDays({
    hireDateKey: hireDate, lastWorkingDayKey: lastWorkingDay,
    workDays, startHHMM, onTimeDates, firstAttendanceDateKey,
  });

  return computeFinalSettlement({ salary, currency, hireDate, lastWorkingDay, deductibleAbsenceDays });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireApiPermission('hr.manage');
  if (isApiError(auth)) return auth;
  try {
    const { username } = await params;
    const supabase = createServiceRoleClient();
    const { data: user, error } = await supabase.from('pyra_users')
      .select('username, display_name, status, salary, salary_currency, hire_date, work_schedule_id')
      .eq('username', username).maybeSingle();
    if (error) { logError({ error, request, metadata: { fn: 'GET exit', username } }); return apiServerError(); }
    if (!user) return apiError('المستخدم غير موجود', 404); // i18n-exempt: handled by client catalog
    if (user.status !== 'active') return apiValidationError('الموظف غير نشط بالفعل'); // i18n-exempt

    const lastWorkingDay = dubaiDayKey(new Date()); // preview uses "today"; POST uses the admin's chosen date
    const handover = await buildHandover(supabase, username);
    const settlement_preview = await computeSettlement(supabase, user, lastWorkingDay);
    return apiSuccess({ employee: { username: user.username, display_name: user.display_name, salary: user.salary, currency: user.salary_currency, hire_date: user.hire_date }, handover, settlement_preview });
  } catch (err) {
    logError({ error: err, request, metadata: { fn: 'GET exit' } });
    return apiServerError();
  }
}
```

> `buildHandover` throws `HandoverReadError` on any read failure — the outer `catch` turns that into a 500, which is the fail-closed behavior the wizard needs (it shows an error, not an empty list).

- [ ] **Step 3: Write the POST handler (append to the same file)**

```ts
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireApiPermission('hr.manage');
  if (isApiError(auth)) return auth;
  try {
    const { username } = await params;
    const body = await request.json();
    const lastWorkingDay = typeof body.last_working_day === 'string' ? body.last_working_day.slice(0, 10) : '';
    const exitReason = typeof body.exit_reason === 'string' ? body.exit_reason : '';
    const decisions: HandoverDecisions = body.handover ?? {};
    const today = dubaiDayKey(new Date());

    if (!lastWorkingDay || lastWorkingDay > today) return apiValidationError('آخر يوم عمل يجب أن يكون اليوم أو قبله'); // i18n-exempt
    if (!exitReason) return apiValidationError('سبب الخروج مطلوب'); // i18n-exempt

    const supabase = createServiceRoleClient();
    const { data: user, error: uErr } = await supabase.from('pyra_users')
      .select('username, display_name, status, salary, salary_currency, hire_date, work_schedule_id')
      .eq('username', username).maybeSingle();
    if (uErr) { logError({ error: uErr, request, metadata: { fn: 'POST exit', username } }); return apiServerError(); }
    if (!user) return apiError('المستخدم غير موجود', 404); // i18n-exempt
    if (user.status !== 'active') return apiValidationError('الموظف غير نشط بالفعل'); // i18n-exempt

    // Actor (for handover notifications). requireApiPermission returns the caller.
    const actor = { username: auth.pyraUser.username, display_name: auth.pyraUser.display_name ?? auth.pyraUser.username };

    // 1. Settlement (compute BEFORE the flip so attendance reads are clean)
    const settlement = await computeSettlement(supabase, { ...user, salary: user.salary }, lastWorkingDay);

    // 2. Execute handover (reassign/remove) — collects per-source outcomes, never throws
    const handoverResult = await executeHandover(supabase, username, decisions, actor);

    // 3. LOCK before flip
    const lockResult = await lockAccount(supabase, username);

    // 4. Flip status ALWAYS (even if the lock failed)
    const offboardingId = generateId('ofb');
    const { error: flipErr } = await supabase.from('pyra_users').update({
      status: 'inactive',
      deactivated_at: new Date().toISOString(),
      last_working_day: lastWorkingDay,
    }).eq('username', username);
    if (flipErr) { logError({ error: flipErr, request, metadata: { fn: 'POST exit flip', username } }); return apiServerError(); }

    // 5. Settlement row (pending employee-payment) — idempotent on source_id
    let settlementPaymentId: string | null = null;
    if (settlement.net > 0) {
      const { data: existing } = await supabase.from('pyra_employee_payments').select('id').eq('source_type', 'final_settlement').eq('source_id', offboardingId).limit(1);
      if (!existing || existing.length === 0) {
        const paymentId = generateId('ep');
        const { error: payErr } = await supabase.from('pyra_employee_payments').insert({
          id: paymentId,
          username,
          source_type: 'final_settlement',
          source_id: offboardingId,
          description: `تسوية نهائية — ${user.display_name ?? username}`, // i18n-exempt: stored payment description
          amount: settlement.net,
          currency: settlement.currency,
          status: 'pending',
        });
        if (payErr) handoverResult.errors.push(`settlement: ${payErr.message}`);
        else settlementPaymentId = paymentId;
      }
    }

    // 6. Record the permanent offboarding row
    const { error: obErr } = await supabase.from('pyra_offboarding').insert({
      id: offboardingId,
      employee_username: username,
      status: 'completed',
      last_working_day: lastWorkingDay,
      exit_reason: exitReason,
      exit_notes: typeof body.exit_notes === 'string' ? body.exit_notes : null,
      handover: handoverResult.applied,
      settlement,
      settlement_payment_id: settlementPaymentId,
      locked: lockResult.locked,
      lock_error: lockResult.error ?? null,
      started_by: actor.username,
    });
    if (obErr) { logError({ error: obErr, request, metadata: { fn: 'POST exit record', username } }); return apiServerError(); }

    // 7. Audit
    logActivity(actor.username, actor.display_name, `${ENTITY_TYPES.OFFBOARDING}_${ACTIVITY_ACTIONS.CREATE}`, `/dashboard/users/${username}`, {
      source: 'exit', offboarding_id: offboardingId, last_working_day: lastWorkingDay,
      locked: lockResult.locked, settlement_net: settlement.net, handover_errors: handoverResult.errors,
    });

    // 8. Alert admins if the lock failed or handover had errors
    if (!lockResult.locked || handoverResult.errors.length > 0) {
      logError({ error: new Error('exit partial failure'), request, metadata: { username, locked: lockResult.locked, errors: handoverResult.errors } });
    }

    return apiSuccess({ offboarding_id: offboardingId, locked: lockResult.locked, lock_error: lockResult.error, settlement, handover_results: handoverResult });
  } catch (err) {
    logError({ error: err, request, metadata: { fn: 'POST exit' } });
    return apiServerError();
  }
}
```

> Confirm `auth.pyraUser` shape from `requireApiPermission`'s return (the codebase uses `auth.pyraUser.username` / `.display_name` elsewhere). `generateId('ofb')` is the fresh offboarding prefix (verified unused).

- [ ] **Step 4: Verify**

Run: `pnpm run check` → clean. Run: `pnpm build` → "Compiled successfully" (the new route appears in the route list).

- [ ] **Step 5: Manual dry-run against a disposable test user (documented)**

Because this mutates real data, do NOT run it against a real employee. If a staging/test user exists, POST a small exit and confirm: status flipped to inactive, `banned_until` set, a `pyra_offboarding` row exists, and a pending `final_settlement` employee-payment row exists. Otherwise defer live verification to the user with a real exit. Record which path was taken in the commit body.

- [ ] **Step 6: Commit**

```bash
git add "app/api/users/[username]/exit/route.ts" lib/api/activity.ts lib/notifications/notify.ts
git commit -m "feat(offboarding): exit orchestrator (GET preview + POST execute) — lock, flip, handover, settlement, record"
```

---

### Task 9: `hooks/useOffboarding.ts`

**Files:**
- Create: `hooks/useOffboarding.ts`

**Interfaces:**
- Consumes: `fetchAPI`, `mutateAPI` from `@/hooks/api-helpers`.
- Produces: `useExitPreview(username)`; `useSubmitExit()`; `useSetUserStatus()`.

- [ ] **Step 1: Write the hook file**

Create `hooks/useOffboarding.ts` (model on `hooks/useOnboarding.ts`):

```ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';
import type { HandoverList, HandoverDecisions } from '@/lib/hr/handover';
import type { FinalSettlement } from '@/lib/hr/final-settlement';

export interface ExitPreview {
  employee: { username: string; display_name: string; salary: number | null; currency: string | null; hire_date: string | null };
  handover: HandoverList;
  settlement_preview: FinalSettlement;
}

export function useExitPreview(username: string | undefined) {
  return useQuery<ExitPreview>({
    queryKey: ['exit-preview', username],
    queryFn: () => fetchAPI(`/api/users/${username}/exit`),
    enabled: !!username,
    staleTime: 30_000,
  });
}

export interface SubmitExitInput {
  username: string;
  last_working_day: string;
  exit_reason: string;
  exit_notes?: string;
  handover: HandoverDecisions;
}

export function useSubmitExit() {
  const qc = useQueryClient();
  return useMutation<{ offboarding_id: string; locked: boolean; lock_error?: string; settlement: FinalSettlement }, Error, SubmitExitInput>({
    mutationFn: ({ username, ...body }) => mutateAPI(`/api/users/${username}/exit`, 'POST', body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', vars.username] });
    },
  });
}

// For the suspend / reactivate buttons — a plain status PATCH (the existing route).
export function useSetUserStatus() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { username: string; status: 'active' | 'suspended' }>({
    mutationFn: ({ username, status }) => mutateAPI(`/api/users/${username}`, 'PATCH', { status }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', vars.username] });
    },
  });
}
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm run check` → clean.

```bash
git add hooks/useOffboarding.ts
git commit -m "feat(offboarding): useExitPreview + useSubmitExit + useSetUserStatus hooks"
```

---

### Task 10: `ExitWizard` component

**Files:**
- Create: `components/hr/offboarding/exit-wizard-helpers.ts`
- Create: `components/hr/offboarding/ExitStepDetails.tsx`
- Create: `components/hr/offboarding/ExitStepHandover.tsx`
- Create: `components/hr/offboarding/ExitStepConfirm.tsx`
- Create: `components/hr/offboarding/ExitWizardSteps.tsx` (barrel)
- Create: `components/hr/offboarding/ExitWizard.tsx`

**Interfaces:**
- Consumes: `useExitPreview`, `useSubmitExit` from `@/hooks/useOffboarding`; `useLeadCapableUsers` from `@/hooks/useLeadCapableUsers`; `toast` from `sonner`; shadcn `Dialog`/`AlertDialog`/`Select`/`Input`/`Button`/`FormLabel`.
- Produces: `<ExitWizard open username onClose />`.

**Reference:** model the shell exactly on `components/hr/onboarding/NewHireWizard.tsx` (281 lines — read it): local `Stepper`, `const [step, setStep] = useState(0)`, `STEP_KEYS`, per-step `validateStep`, `isLast = step === STEP_KEYS.length - 1`, `next()`/`back()`, translated step labels via `useTranslations('hr.offboarding')`, and the barrel `ExitWizardSteps.tsx` re-exporting the three step panels.

- [ ] **Step 1: Write the helpers**

Create `components/hr/offboarding/exit-wizard-helpers.ts`:

```ts
import type { HandoverDecisions } from '@/lib/hr/handover';

export const EXIT_STEP_KEYS = ['details', 'handover', 'confirm'] as const;
export type ExitStep = typeof EXIT_STEP_KEYS[number];

export interface ExitForm {
  last_working_day: string; // YYYY-MM-DD
  exit_reason: string;      // one of EXIT_REASONS
  exit_notes: string;
  handover: HandoverDecisions;
}

export function defaultExitForm(todayKey: string): ExitForm {
  return { last_working_day: todayKey, exit_reason: 'resigned', exit_notes: '', handover: {} };
}

// Returns an i18n key under hr.offboarding.errors.* or null.
export function validateExitStep(step: ExitStep, form: ExitForm, todayKey: string): string | null {
  if (step === 'details') {
    if (!form.last_working_day) return 'errors.lastDayRequired';
    if (form.last_working_day > todayKey) return 'errors.lastDayFuture';
    if (!form.exit_reason) return 'errors.reasonRequired';
  }
  return null;
}
```

- [ ] **Step 2: Write the three step panels + barrel**

- `ExitStepDetails.tsx`: a date `Input type="date"` bound to `form.last_working_day` (max = today), a `Select` for `exit_reason` whose options come from `EXIT_REASONS` with labels `t(\`exitReasons.${r}\`)`, and a notes `Textarea`.
- `ExitStepHandover.tsx`: renders `preview.handover` grouped by bucket. For each WORK bucket with items, show the count + a `Select` (target = `useLeadCapableUsers().leadCapable` for leads/follow-ups/whatsapp/lead_tasks/direct_reports; use `.all` filtered to active for board tasks) + action radio (reassign / archive where applicable / leave). Show a "سلّم الكل لـ" shortcut that sets every reassignable bucket's target at once. Render `external_files` as a **warning box** (`t('externalFilesWarning', { count })`) with an acknowledge checkbox bound to `form.handover.external_files_acknowledged`. Render `access` as an informational "سيتم إزالتها تلقائياً" line (no control).
- `ExitStepConfirm.tsx`: render `preview.settlement_preview` breakdown (daily_rate, days_employed, gross, absence_deduction, **net** in bold, currency) via `formatCurrency(net, currency)`. Note under it: `t('settlementAdminNote')` = "المبلغ يُسجَّل كمستحق للدفع — الموظف لا يُخطر تلقائياً".
- `ExitWizardSteps.tsx`: `export { ExitStepDetails } from './ExitStepDetails'; ...` barrel.

Each step file ≤220 lines. Use `ms-`/`me-`/`ps-`/`pe-` (RTL), pair `dark:` variants, no raw `fetch`.

- [ ] **Step 3: Write the wizard shell**

Create `components/hr/offboarding/ExitWizard.tsx` modelled on `NewHireWizard.tsx`. Key wiring:
- `const preview = useExitPreview(open ? username : undefined);`
- `const submit = useSubmitExit();`
- `const [form, setForm] = useState(() => defaultExitForm(dubaiDayKey(new Date())));`
- Loading → `<Skeleton>`; `preview.isError` → an EmptyState-style error ("تعذّر تحميل بيانات إنهاء الخدمة") — this is the **fail-closed surface**: if the server aborted the handover read, the wizard shows an error and does NOT let the admin confirm a blind exit.
- The confirm step's final button opens an `AlertDialog` ("تأكيد إنهاء خدمة {name}؟") → on confirm calls `submit.mutate(...)`.
- `onSuccess`: if `data.locked` → `toast.success(t('exitDoneLocked'))`; else `toast.warning(t('exitDoneLockFailed'))` (the honest lock-failed message). Then `onClose()`.

- [ ] **Step 4: Verify + commit**

Run: `pnpm run check` → clean (this will FAIL until the i18n keys exist — do Task 12's `hr.offboarding.*` keys first if `useTranslations` complains, OR add the keys inline here and finish the catalog in Task 12). Recommended: add the `hr.offboarding` catalog block (Task 12 Step 1) BEFORE this step so `pnpm i18n:check` passes.

```bash
git add components/hr/offboarding/
git commit -m "feat(offboarding): ExitWizard (details → handover → confirm) with fail-closed preview"
```

---

### Task 11: users-client surgery — remove the status Select, add the 3 buttons

**Files:**
- Create: `components/users/UserEditDialog.tsx`
- Modify: `app/dashboard/users/users-client.tsx`
- Modify: `app/dashboard/users/[username]/user-detail-client.tsx`

- [ ] **Step 1: Extract the edit dialog**

Create `components/users/UserEditDialog.tsx` holding the current inline edit-dialog JSX (`users-client.tsx` lines 566-910) **minus the status Select (lines 580-590)**. It receives as props everything the sub-sections read: `open`, `onOpenChange`, `selectedUser`, `formData`, `setFormData`, `extraPermissions`, `setExtraPermissions`, `showExtraPermissions`, `setShowExtraPermissions`, `roles`, `users`, `workSchedules`, the label translators, and `onSubmit`/`isSubmitting`. Do NOT include `editStatus`/`setEditStatus` — status is no longer edited here.

- [ ] **Step 2: Wire it into users-client**

In `app/dashboard/users/users-client.tsx`: remove the `editStatus` state (line 141), the `setEditStatus(user.status || 'active')` seed (line 296), and `status: editStatus` from the `handleEdit` payload (line 248). Replace the inline `<Dialog open={showEditDialog}>...` block with `<UserEditDialog open={showEditDialog} onOpenChange={setShowEditDialog} ... onSubmit={handleEdit} isSubmitting={editMutation.isPending} />`. The PATCH payload no longer carries `status`, so an edit-dialog save never triggers a status transition — status changes go exclusively through the new buttons.

- [ ] **Step 3: Add the 3 status buttons + ExitWizard to the detail page**

In `app/dashboard/users/[username]/user-detail-client.tsx`, the Quick Actions cluster (lines 199-212) currently holds the onboarding link + back button. Add (gated on `usePermission('hr.manage')`, and only when the target is not the current admin):
- If `user.status === 'active'`: **إنهاء خدمة** (opens `<ExitWizard open username onClose />` via local `useState`), and **إيقاف مؤقت** (`AlertDialog` → `useSetUserStatus().mutate({ username, status: 'suspended' })`).
- If `user.status !== 'active'`: **إعادة تفعيل** (`useSetUserStatus().mutate({ username, status: 'active' })`).

Import `ExitWizard` from `@/components/hr/offboarding/ExitWizard`, `useSetUserStatus` from `@/hooks/useOffboarding`, `usePermission` from `@/hooks/usePermission`, `AlertDialog` family, `toast`.

- [ ] **Step 4: Verify**

Run: `pnpm run check` → clean. Run: `pnpm build` → compiles. Manually confirm (reading the diff) that `status` no longer appears in the edit-dialog PATCH payload and that the Select is gone.

- [ ] **Step 5: Commit**

```bash
git add components/users/UserEditDialog.tsx app/dashboard/users/users-client.tsx "app/dashboard/users/[username]/user-detail-client.tsx"
git commit -m "feat(offboarding): remove status Select; add exit/suspend/reactivate buttons on user detail"
```

---

### Task 12: i18n + status labels + module guide + final verification

**Files:**
- Modify: `messages/ar/hr.json`, `messages/en/hr.json` (add `offboarding` sub-object)
- Modify: `messages/ar/statuses.json`, `messages/en/statuses.json` (add `offboarding` labels)
- Modify: `lib/config/module-guide.ts`, `app/dashboard/guide/page.tsx`

- [ ] **Step 1: Add the `hr.offboarding` catalog (AR + EN)**

In `messages/ar/hr.json`, add an `offboarding` key under the top-level `hr` object with every string the wizard + buttons use: `title`, `steps.details`/`steps.handover`/`steps.confirm`, `exitReasons.resigned`/`.terminated`/`.contract_ended`/`.other`, `fields.lastWorkingDay`/`.exitReason`/`.notes`, `handover.leadsCount`/`.followUpsCount`/`.tasksCount`/`.whatsappCount`/`.assignAllTo`/`.reassign`/`.archive`/`.leave`/`.accessAutoRemoved`, `externalFilesWarning` (with `{count}`), `settlementAdminNote`, `net`, `confirmTitle` (with `{name}`), `exitDoneLocked`, `exitDoneLockFailed`, `errors.lastDayRequired`/`.lastDayFuture`/`.reasonRequired`, buttons `exitEmployee`/`suspend`/`reactivate`. Extract the AR strings from the JSX you wrote (VERBATIM — the i18n rule is AR is extracted from code, never re-authored). Mirror the same keys in `messages/en/hr.json` with English values.

- [ ] **Step 2: Add offboarding status labels**

In `messages/ar/statuses.json` and `messages/en/statuses.json`, add an `offboarding` object: `{ "completed": "مكتمل", "reversed": "معكوس" }` (AR) / `{ "completed": "Completed", "reversed": "Reversed" }` (EN) — so `useStatusLabels('offboarding')` resolves.

- [ ] **Step 3: Add a module-guide entry**

In `lib/config/module-guide.ts`, add an entry keyed on the user-detail route (or a dedicated `offboarding` topic) mirroring the onboarding entry: `description`, `goal`, and 6-10 actionable Arabic tips (Phase 17 standard) covering: how to run an exit, what the handover buckets mean, that external Drive files must be retrieved manually, that the settlement is recorded as pending (paid out-of-band), and that the account is banned automatically + the reconcile cron. Add its `href` to the `SECTIONS` array in `app/dashboard/guide/page.tsx`.

- [ ] **Step 4: Full verification**

Run each and confirm:
```bash
pnpm run check        # tsc + i18n:check ✓ clean
pnpm test -- --run    # all tests pass (lock-account, final-settlement, handover, calculate-item-settlement + existing)
pnpm build            # Compiled successfully + all static pages generated
```

- [ ] **Step 5: Commit**

```bash
git add messages/ lib/config/module-guide.ts app/dashboard/guide/page.tsx
git commit -m "feat(offboarding): i18n catalog + status labels + module guide"
```

- [ ] **Step 6: Push (deploys prod — confirm with Abou first)**

```bash
git fetch origin && git push origin HEAD:main
```

---

## Post-implementation manual verification (with the user)

These require a real or disposable employee and are done WITH Abou, not automated:

1. **Reconcile cron dry-run** — `POST /api/cron/access-reconcile` → `failures: []`.
2. **A real exit** — run the wizard on the next actual leaver; confirm status flipped, `banned_until` set, `pyra_offboarding` row written, pending `final_settlement` payment created with the right net, handover reassignments landed, and the "lock failed" path shows the honest toast if GoTrue is down.
3. **A re-hire** — reactivate a banned inactive user via the button; confirm they can log in (ban lifted by `unlockAccount`).
