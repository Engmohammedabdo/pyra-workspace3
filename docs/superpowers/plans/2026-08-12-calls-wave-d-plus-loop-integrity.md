# Pyra Calls — موجة د+ · الموجة الأولى: سلامة الحلقة (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a connected call always end in a scheduled next step, turn the
"going cold" nudge from noise into a short daily list, surface the leads nobody
has ever called, and stop reps abandoning a number after 1.6 attempts.

**Architecture:** Four features, one shippable wave. Every business rule lands in
a **pure, unit-tested module** (`lib/**` on the server, `core/**` in the app) and
the route/screen only wires it — the pattern waves ب/ج established, and the reason
their audits caught real bugs. The one genuinely new mechanism is
**version-gated enforcement**: the server may not start rejecting requests the
live app cannot satisfy, so the new required field is enforced only for
`x-app-version >= 11`.

**Tech Stack:** Next.js 15 route handlers + Supabase (service role) · Vitest ·
Kotlin/Compose + JUnit · WorkManager.

## Global Constraints

- **Server deploys BEFORE the app.** Never the reverse. (`docs/CALL-TRACKING.md`)
- **`NEXT_STEP_ENFORCED_FROM_VERSION = 11`.** The next-step requirement is
  enforced only when the device reports `x-app-version >= 11`. The live fleet is
  on **versionCode 10** — enforcing unconditionally takes both phones offline.
- **Attempt policy (owner decision, 2026-08-12): 4 attempts over 10 days**, at
  day offsets `[0, 2, 5, 10]` from the first attempt, each at a **different hour**.
- **Idle nudge policy (owner decisions, 2026-08-12):** eligible only if the lead
  has had a **prior connected call**, capped at **10 per agent per day**, and
  ordered **least-recently-nudged first** so every eligible lead gets a turn.
  **REVISED mid-execution** — the original text here said *most-recently-spoken-to
  first*, and the Task 5 review proved that starves 85% of the pool for ever: the
  cron writes its own `idle_warning` row, that row is the newest activity on **619
  of 772 (80%)** eligible leads, and `lastTouched` counted it — so a nudged lead
  came back after the 7-day dedup holding the freshest possible timestamp and
  re-won the cap indefinitely. `lastTouched` must therefore EXCLUDE `idle_warning`
  exactly as it excludes `call_attempt`, so the signal stays human.
- **A dropped/blocked row is never `status: 'error'`** on any mobile response —
  that value freezes the device cursor (`SyncPlanner.nextCursor`).
- **Never `INSERT INTO pyra_notifications` directly** — always `notify()`.
- **Arabic in SQL goes through a UTF-8 file** via `pnpm db:query <file.sql>`, never
  inline. Re-read rows after any Arabic write.
- **Arabic strings persisted to the DB stay Arabic** with a `// i18n-exempt:` note
  (Phase 8 rule). UI strings go through `messages/`.
- **RTL logical properties only** (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`).
- **UI copy is simplified standard Arabic — NOT Egyptian dialect** (owner
  decision, 2026-08-12, applies to the app AND the system). Write «حدّد الخطوة
  التالية», never «اختار الخطوة الجاية»; «متى» not «امتى»; «انتهت» not «خلصت»;
  «سجّل» not «علّم». Two reps read this today and neither is the only audience the
  product will ever have. Copy already written in dialect elsewhere in the app is
  a separate cleanup — do not widen a task to chase it.
- Gates before any push: `pnpm run check` + `pnpm build` + `pnpm test`, and for the
  app `./gradlew testDebugUnitTest lintDebug`.
- **Never log in as `youssef` or `cosette`** — it revokes the device key on a real
  company phone. Use `test.sales` / `test.admin` (`.env.test.local`).
- Test filtering: `pnpm exec vitest run <path>` — `pnpm test -- <path>` does NOT filter.

---

## File Structure

**Server — new**
- `lib/crm/idle-eligibility.ts` — who deserves a "going cold" nudge, and the cap.
- `lib/calls/attempt-cadence.ts` — the 4-attempts-over-10-days schedule.
- `__tests__/idle-eligibility.test.ts`, `__tests__/attempt-cadence.test.ts`

**Server — modified**
- `lib/mobile/outcome-validation.ts` — optional `requireNextStep` rule.
- `app/api/mobile/call-outcome/route.ts` — reads `x-app-version`, passes the flag.
- `app/api/cron/lead-idle-check/route.ts` — consumes `selectIdleNudges`.
- `app/api/mobile/my-day/route.ts` — adds `never_contacted` + `attempts` fields.

**App — new**
- `app/src/test/java/cloud/pyramedia/calls/core/NextStepFormTest.kt`

**App — modified**
- `core/OutcomeForm.kt` — `nextStepSatisfied()`.
- `core/MyDayView.kt` — four tabs instead of three.
- `ui/CallOutcomeActivity.kt` — Save blocked until a next step is picked.
- `ui/MyDayScreen.kt` — the «لسه ما اتكلمناش» tab.
- `core/Payloads.kt` — `never_contacted` + `attempts_made` fields.
- `res/values/strings.xml` — new Arabic labels.
- `app/build.gradle.kts` — versionCode 11 / versionName 1.8.0.

---

### Task 1: The pure next-step rule in the app

**Files:**
- Modify: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/OutcomeForm.kt`
- Test: `pyra-calls-app/app/src/test/java/cloud/pyramedia/calls/core/NextStepFormTest.kt`

**Interfaces:**
- Consumes: `OutcomeForm.allowsFollowUp(outcome)` (already exists).
- Produces: `OutcomeForm.nextStepSatisfied(outcome: String?, presetDays: Int?): Boolean`
  — Task 4 gates the Save button on `reasonSatisfied(...) && nextStepSatisfied(...)`.

- [ ] **Step 1: Write the failing test**

Create `pyra-calls-app/app/src/test/java/cloud/pyramedia/calls/core/NextStepFormTest.kt`:

```kotlin
package cloud.pyramedia.calls.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Wave د+ #01. 88% of connected calls ended with nothing scheduled (123
 * follow-ups from 998 connected calls, measured 2026-08-12) — this rule is what
 * changes that, so it is pinned here rather than left in a Composable.
 */
class NextStepFormTest {

    @Test
    fun `interested without a next step is not satisfied`() {
        assertFalse(OutcomeForm.nextStepSatisfied("interested", null))
    }

    @Test
    fun `interested with a next step is satisfied`() {
        assertTrue(OutcomeForm.nextStepSatisfied("interested", 3))
    }

    @Test
    fun `call again without a next step is not satisfied`() {
        assertFalse(OutcomeForm.nextStepSatisfied("call_again", null))
    }

    @Test
    fun `not interested IS the next step, so no date is needed`() {
        // Scheduling a call for someone just marked not-interested is a
        // contradiction — allowsFollowUp already hides the presets.
        assertTrue(OutcomeForm.nextStepSatisfied("not_interested", null))
    }

    @Test
    fun `an unpicked outcome stays satisfied so the existing error owns the message`() {
        // Same reasoning as reasonSatisfied: a dead Save button explains nothing,
        // the inline «اختر نتيجة المكالمة» error does.
        assertTrue(OutcomeForm.nextStepSatisfied(null, null))
    }

    @Test
    fun `a stale date on not interested is ignored, never treated as a plan`() {
        assertTrue(OutcomeForm.nextStepSatisfied("not_interested", 7))
        // and it never leaves the sheet:
        assertTrue(OutcomeForm.effectiveFollowUpDays("not_interested", 7) == null)
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd pyra-calls-app && ./gradlew testDebugUnitTest --tests "*NextStepFormTest*"
```

Expected: compilation failure — `Unresolved reference: nextStepSatisfied`.

- [ ] **Step 3: Add the rule**

In `core/OutcomeForm.kt`, directly after `allowsFollowUp`:

```kotlin
    /**
     * Wave د+ #01 — a connected call must leave a scheduled next step.
     *
     * Measured 2026-08-12: of 998 connected calls in 30 days, 477 moved a stage
     * and 511 wrote a note, but only 123 (12%) scheduled a follow-up. The
     * customer then leaves the radar entirely, which is why 1,141 of 1,258 live
     * leads sit in one stage.
     *
     * Two deliberate `true`s, both matching [reasonSatisfied]'s reasoning:
     *  - `not_interested` IS the decision, so it needs no date.
     *  - A null outcome keeps the sheet's own «اختر نتيجة المكالمة» error, which
     *    tells the rep what to do — a Save button that is merely dead does not.
     */
    fun nextStepSatisfied(outcome: String?, presetDays: Int?): Boolean {
        if (outcome == null) return true
        if (!allowsFollowUp(outcome)) return true
        return presetDays != null
    }
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd pyra-calls-app && ./gradlew testDebugUnitTest --tests "*NextStepFormTest*"
```

Expected: `BUILD SUCCESSFUL`, 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/OutcomeForm.kt pyra-calls-app/app/src/test/java/cloud/pyramedia/calls/core/NextStepFormTest.kt
git commit -F- <<'MSG'
feat(app): the next-step rule, pure and pinned

88% of connected calls ended with nothing scheduled (123 follow-ups from 998
connected calls, measured 2026-08-12). The rule lives in OutcomeForm beside
reasonSatisfied so it is testable without Compose, and so the two "deliberately
returns true" cases carry their reasoning: not_interested IS the next step, and a
null outcome leaves the message to the existing inline error rather than to a
dead Save button.

No behaviour change yet — Task 4 wires it to the button.
MSG
```

---

### Task 2: The server-side rule, version-gated

**Files:**
- Modify: `lib/mobile/outcome-validation.ts`
- Test: `__tests__/outcome-validation.test.ts` (exists — extend it)

**Interfaces:**
- Consumes: nothing new.
- Produces: `validateOutcomeRequest(body: unknown, options?: { requireNextStep?: boolean })`
  — the second parameter is **optional and defaults to off**, so every existing
  caller and every existing test keeps compiling and passing unchanged. Task 3
  passes it.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/outcome-validation.test.ts`:

```ts
describe('validateOutcomeRequest — required next step (wave د+ #01)', () => {
  const base = { lead_id: 'sl_1', outcome: 'interested', note: 'كلمته' };

  it('accepts a missing next step when enforcement is OFF (the live fleet)', () => {
    // versionCode 10 is in the field and cannot send this field. Enforcing for
    // it would 422 every outcome the two real phones save.
    const out = validateOutcomeRequest(base);
    expect(out.ok).toBe(true);
  });

  it('rejects a missing next step when enforcement is ON', () => {
    const out = validateOutcomeRequest(base, { requireNextStep: true });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toContain('الخطوة الجاية');
  });

  it('accepts a present next step when enforcement is ON', () => {
    const out = validateOutcomeRequest(
      { ...base, next_follow_up_at: '2026-08-15T09:00:00.000Z' },
      { requireNextStep: true },
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.nextFollowUpAtIso).toBe('2026-08-15T09:00:00.000Z');
  });

  it('exempts not_interested even when enforcement is ON', () => {
    // The decision IS the next step. Demanding a callback date for someone who
    // just said no would be a contradiction the app cannot even express.
    const out = validateOutcomeRequest(
      { lead_id: 'sl_1', outcome: 'not_interested', not_interested_reason: 'السعر عالي' },
      { requireNextStep: true },
    );
    expect(out.ok).toBe(true);
  });

  it('reports the INVALID date, not the missing step, when both are wrong', () => {
    // Order matters: telling a rep "pick a next step" when they picked a broken
    // one sends them looking in the wrong place.
    const out = validateOutcomeRequest(
      { ...base, next_follow_up_at: 'بكرة' },
      { requireNextStep: true },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toContain('next_follow_up_at');
  });
});
```

- [ ] **Step 2: Run them and watch two fail**

```bash
pnpm exec vitest run __tests__/outcome-validation.test.ts
```

Expected: the "rejects a missing next step" test FAILS (`expected true to be false`);
the others pass because the parameter is ignored.

- [ ] **Step 3: Implement**

In `lib/mobile/outcome-validation.ts`, add above `validateOutcomeRequest`:

```ts
export interface OutcomeValidationOptions {
  /**
   * Require a scheduled next step for any outcome other than `not_interested`.
   *
   * OFF by default, and that default is load-bearing: the caller turns it on
   * from the device's reported `x-app-version`, because a fleet running an older
   * build physically cannot send `next_follow_up_at` and would take a 422 on
   * every saved outcome. See NEXT_STEP_ENFORCED_FROM_VERSION in the route.
   */
  requireNextStep?: boolean;
}
```

Change the signature and add the check immediately **after** the
`next_follow_up_at` parse block (so an invalid date still reports itself first):

```ts
export function validateOutcomeRequest(
  body: unknown,
  options: OutcomeValidationOptions = {},
): OutcomeValidation {
```

```ts
  // Wave د+ #01 — placed AFTER the parse above on purpose: a rep who picked a
  // broken date should hear that, not "pick a next step".
  if (options.requireNextStep && outcome !== 'not_interested' && !nextFollowUpAtIso) {
    // i18n-exempt: API response message, `api` namespace migration is Phase 8
    return { ok: false, message: 'لازم تحدد الخطوة الجاية قبل الحفظ' };
  }
```

- [ ] **Step 4: Run the whole file and watch it pass**

```bash
pnpm exec vitest run __tests__/outcome-validation.test.ts
```

Expected: all tests pass, including every pre-existing one (proof the default is
backward-compatible).

- [ ] **Step 5: Commit**

```bash
git add lib/mobile/outcome-validation.ts __tests__/outcome-validation.test.ts
git commit -F- <<'MSG'
feat(mobile): optional required-next-step rule in outcome validation

The flag defaults to OFF and that is the whole design. versionCode 10 is live on
both handsets and cannot send next_follow_up_at, so enforcing unconditionally
would 422 every outcome the real phones save — server-first deployment means the
server must tolerate the app that is already out there.

Placed after the date parse so an unparseable date reports itself rather than
being reported as a missing step. not_interested is exempt: the decision IS the
next step.

Every pre-existing test in the file passes untouched, which is the backward
compatibility claim made executable.
MSG
```

---

### Task 3: Wire the route to the device's version

**Files:**
- Modify: `app/api/mobile/call-outcome/route.ts`
- Test: `__tests__/outcome-version-gate.test.ts` (create)

**Interfaces:**
- Consumes: `validateOutcomeRequest(body, { requireNextStep })` from Task 2.
- Produces: nothing for later tasks — this is the last server piece of #01.

- [ ] **Step 1: Write the failing test**

Create `__tests__/outcome-version-gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldRequireNextStep, NEXT_STEP_ENFORCED_FROM_VERSION } from '@/lib/mobile/next-step-gate';

/**
 * The gate that keeps a server-first deploy from breaking the live fleet.
 * versionCode 10 was on both handsets when this shipped.
 */
describe('shouldRequireNextStep', () => {
  it('is OFF for the fleet that cannot send the field', () => {
    expect(shouldRequireNextStep('10')).toBe(false);
  });

  it('is ON from the version that can', () => {
    expect(shouldRequireNextStep(String(NEXT_STEP_ENFORCED_FROM_VERSION))).toBe(true);
    expect(shouldRequireNextStep('12')).toBe(true);
  });

  it('fails OPEN on a missing or unreadable header', () => {
    // An unknown client is treated as old. Failing closed here would reject
    // real work over a header problem, and the app enforces this in its UI
    // anyway — the server gate is a backstop, not the primary control.
    expect(shouldRequireNextStep(null)).toBe(false);
    expect(shouldRequireNextStep('')).toBe(false);
    expect(shouldRequireNextStep('abc')).toBe(false);
    expect(shouldRequireNextStep('-1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm exec vitest run __tests__/outcome-version-gate.test.ts
```

Expected: FAIL — cannot resolve `@/lib/mobile/next-step-gate`.

- [ ] **Step 3: Create the gate and use it**

Create `lib/mobile/next-step-gate.ts`:

```ts
/**
 * When the required-next-step rule applies.
 *
 * The device reports its build in `x-app-version` (already parsed by
 * requireDeviceAuth for the fleet-visibility stamp). Enforcement starts at the
 * build that can actually satisfy the rule.
 */
export const NEXT_STEP_ENFORCED_FROM_VERSION = 11;

export function shouldRequireNextStep(headerValue: string | null): boolean {
  const code = parseInt(headerValue ?? '', 10);
  // Fails OPEN: an unknown client is treated as old. The blocking UI in the app
  // is the primary control; this is the backstop that stops a NEW app from
  // silently regressing, not a gate worth rejecting real work over.
  if (!Number.isInteger(code) || code <= 0) return false;
  return code >= NEXT_STEP_ENFORCED_FROM_VERSION;
}
```

In `app/api/mobile/call-outcome/route.ts`, import it and change the validation call:

```ts
import { shouldRequireNextStep } from '@/lib/mobile/next-step-gate';
```

```ts
    const validation = validateOutcomeRequest(body, {
      requireNextStep: shouldRequireNextStep(request.headers.get('x-app-version')),
    });
```

- [ ] **Step 4: Run the test and the whole suite**

```bash
pnpm exec vitest run __tests__/outcome-version-gate.test.ts && pnpm run check
```

Expected: 3 tests pass; `check` clean.

- [ ] **Step 5: Commit**

```bash
git add lib/mobile/next-step-gate.ts __tests__/outcome-version-gate.test.ts app/api/mobile/call-outcome/route.ts
git commit -F- <<'MSG'
feat(mobile): gate the next-step requirement on the device's reported build

Extracted rather than inlined so the fail-open decision is testable: an absent or
unreadable x-app-version is treated as an OLD client and enforcement stays off.
Failing closed would reject a rep's real work over a header problem, and the
blocking UI in the app is the primary control — this is the backstop that stops a
future app build from silently regressing, nothing more.

The header is already read a few lines earlier by requireDeviceAuth for the
app_version_code stamp, so no new client contract.
MSG
```

---

### Task 4: Block Save until the rep picks a next step

**Files:**
- Modify: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/CallOutcomeActivity.kt`
- Modify: `pyra-calls-app/app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `OutcomeForm.nextStepSatisfied(outcome, presetDays)` (Task 1).
- Produces: the app now always sends `next_follow_up_at` for non-`not_interested`
  outcomes — which is what makes Task 3's version gate meaningful.

- [ ] **Step 1: Read the sheet's current gating**

```bash
grep -n "reasonSatisfied\|enabled =\|presetDays\|effectiveFollowUpDays" pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/CallOutcomeActivity.kt
```

Note the exact `enabled =` expression on the Save button and the state variable
holding the chosen preset — the next step edits both.

- [ ] **Step 2: Add the strings**

In `res/values/strings.xml`:

```xml
    <!-- Wave د+ #01 — the next step is required, so the sheet must say why. -->
    <string name="next_step_required">اختار الخطوة الجاية</string>
    <string name="next_step_hint">كل مكالمة لازم تنتهي بخطوة — امتى نكلمه تاني؟</string>
    <string name="next_step_tomorrow">بكرة</string>
    <string name="next_step_3days">بعد ٣ أيام</string>
    <string name="next_step_week">أسبوع</string>
```

- [ ] **Step 3: Gate the button and explain the block**

Change the Save button's `enabled` to include the new rule, and render the reason
when it blocks. The bottom bar must always explain a disabled Save — the wave-ج
audit's round-3 finding was that a silently dead button is worse than no button:

```kotlin
val nextStepOk = OutcomeForm.nextStepSatisfied(outcomeKey, presetDays)
val reasonOk = OutcomeForm.reasonSatisfied(outcomeKey, reasonText)

// ... on the Save button:
enabled = !saving && reasonOk && nextStepOk,

// ... in the bottom bar, beside the existing reason message:
if (outcomeKey != null && !nextStepOk) {
    Text(
        text = stringResource(R.string.next_step_required),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodySmall,
    )
}
```

Make the presets visually required when nothing is picked: show
`R.string.next_step_hint` above the preset row whenever
`OutcomeForm.allowsFollowUp(outcomeKey) && presetDays == null`.

- [ ] **Step 4: Build, test, lint**

```bash
cd pyra-calls-app && ./gradlew testDebugUnitTest lintDebug
```

Expected: `BUILD SUCCESSFUL`. Fix any `UseKtx`/unused-resource lint before moving on.

- [ ] **Step 5: Commit**

```bash
git add pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/CallOutcomeActivity.kt pyra-calls-app/app/src/main/res/values/strings.xml
git commit -F- <<'MSG'
feat(app): Save stays disabled until the call has a next step

The owner chose blocking over a default (2026-08-12), and the quick presets are
what make blocking affordable: one tap, not a form. The risk of blocking is a rep
who stops opening the sheet at all, so the cost of compliance had to stay at one
tap.

The bottom bar always says WHY Save is disabled — the wave-ج audit's round-3
finding was a silently dead button teaching reps the app is broken. Same reason
the hint appears above the presets rather than only after a failed tap.
MSG
```

---

### Task 5: The idle nudge becomes a short, earned list

**Files:**
- Create: `lib/crm/idle-eligibility.ts`
- Create: `__tests__/idle-eligibility.test.ts`
- Modify: `app/api/cron/lead-idle-check/route.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `selectIdleNudges(candidates: IdleCandidate[], capPerAgent?: number): IdleCandidate[]`
  and `IDLE_DAILY_CAP_PER_AGENT = 10`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/idle-eligibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  selectIdleNudges,
  IDLE_DAILY_CAP_PER_AGENT,
  type IdleCandidate,
} from '@/lib/crm/idle-eligibility';

const lead = (over: Partial<IdleCandidate> = {}): IdleCandidate => ({
  leadId: 'sl_1',
  agentUsername: 'youssef',
  lastTouchedMs: 1_000,
  hasConnectedCall: true,
  ...over,
});

describe('selectIdleNudges', () => {
  it('drops leads nobody has ever actually spoken to', () => {
    // Measured 2026-08-12: the old rule warned on 1,189 of 1,258 leads — 95% of
    // the book — so the nudge meant nothing. A lead that never answered is not
    // "going cold"; it was never warm.
    const out = selectIdleNudges([
      lead({ leadId: 'sl_spoke', hasConnectedCall: true }),
      lead({ leadId: 'sl_never', hasConnectedCall: false }),
    ]);
    expect(out.map((c) => c.leadId)).toEqual(['sl_spoke']);
  });

  it('caps each agent independently', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      lead({ leadId: `sl_y${i}`, agentUsername: 'youssef', lastTouchedMs: i }),
    ).concat(
      Array.from({ length: 25 }, (_, i) =>
        lead({ leadId: `sl_c${i}`, agentUsername: 'cosette', lastTouchedMs: i }),
      ),
    );
    const out = selectIdleNudges(many, 10);
    expect(out.filter((c) => c.agentUsername === 'youssef')).toHaveLength(10);
    expect(out.filter((c) => c.agentUsername === 'cosette')).toHaveLength(10);
  });

  it('prefers the MOST recently spoken-to lead, not the oldest', () => {
    // A conversation 8 days ago is recoverable; one from 90 days ago is a
    // different job. Sorting oldest-first would fill the daily cap with the
    // least recoverable leads in the book, every single day.
    const out = selectIdleNudges(
      [
        lead({ leadId: 'sl_ancient', lastTouchedMs: 100 }),
        lead({ leadId: 'sl_recent', lastTouchedMs: 900 }),
        lead({ leadId: 'sl_mid', lastTouchedMs: 500 }),
      ],
      2,
    );
    expect(out.map((c) => c.leadId)).toEqual(['sl_recent', 'sl_mid']);
  });

  it('is deterministic when two leads share a timestamp', () => {
    // Same reasoning as the calls duplicate-key tiebreak: an unordered read
    // makes the daily list shuffle for no reason and makes bugs unreproducible.
    const a = lead({ leadId: 'sl_a', lastTouchedMs: 500 });
    const b = lead({ leadId: 'sl_b', lastTouchedMs: 500 });
    expect(selectIdleNudges([a, b], 1)).toEqual(selectIdleNudges([b, a], 1));
  });

  it('defaults to the agreed cap', () => {
    expect(IDLE_DAILY_CAP_PER_AGENT).toBe(10);
    const many = Array.from({ length: 40 }, (_, i) => lead({ leadId: `sl_${i}`, lastTouchedMs: i }));
    expect(selectIdleNudges(many)).toHaveLength(10);
  });

  it('returns an empty list for an empty input rather than throwing', () => {
    expect(selectIdleNudges([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm exec vitest run __tests__/idle-eligibility.test.ts
```

Expected: FAIL — cannot resolve `@/lib/crm/idle-eligibility`.

- [ ] **Step 3: Implement**

Create `lib/crm/idle-eligibility.ts`:

```ts
/**
 * Who earns a "your customer went quiet" nudge, and how many per day.
 *
 * ## Why this exists
 *
 * Measured 2026-08-12: the idle cron wrote 2,454 warnings in 30 days across
 * 1,189 of 1,258 live leads. A nudge that fires on 95% of the book is not a
 * signal — it is the largest source of activity in the system, larger than all
 * human work combined, and the rep has correctly learned to ignore it. Which
 * means the lead that genuinely needs attention is lost inside it.
 *
 * Owner decision (2026-08-12): eligible only with a prior CONNECTED call, and
 * capped per agent per day.
 */

export const IDLE_DAILY_CAP_PER_AGENT = 10;

export interface IdleCandidate {
  leadId: string;
  agentUsername: string;
  /** max(latest non-attempt activity, last_contact_at) in ms — the cron's own `lastTouched`. */
  lastTouchedMs: number;
  /** Has this lead ever had a call that was answered? `isConnectedCall` semantics. */
  hasConnectedCall: boolean;
}

/**
 * Sorted most-recently-spoken-to FIRST, then capped per agent.
 *
 * The sort direction is a deliberate reversal of the obvious one. Oldest-first
 * would hand each rep the ten deadest leads in their book every morning, for
 * ever, and they would stop reading the list within a week. A conversation eight
 * days old is recoverable; one from ninety days ago is a re-prospecting job, not
 * a nudge.
 *
 * `leadId` breaks ties so the same input always produces the same list — an
 * unordered read makes the daily nudge shuffle for no reason and makes a bug
 * report impossible to reproduce.
 */
export function selectIdleNudges(
  candidates: IdleCandidate[],
  capPerAgent: number = IDLE_DAILY_CAP_PER_AGENT,
): IdleCandidate[] {
  const eligible = candidates.filter((c) => c.hasConnectedCall);
  const byAgent = new Map<string, IdleCandidate[]>();

  for (const c of eligible) {
    const list = byAgent.get(c.agentUsername);
    if (list) list.push(c);
    else byAgent.set(c.agentUsername, [c]);
  }

  const out: IdleCandidate[] = [];
  for (const list of byAgent.values()) {
    list.sort((a, b) =>
      b.lastTouchedMs - a.lastTouchedMs || a.leadId.localeCompare(b.leadId),
    );
    out.push(...list.slice(0, capPerAgent));
  }
  return out;
}
```

- [ ] **Step 4: Run and watch it pass**

```bash
pnpm exec vitest run __tests__/idle-eligibility.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Wire the cron**

In `app/api/cron/lead-idle-check/route.ts`: the loop already computes
`lastTouched` per lead and pushes idle leads into a per-agent structure. Build an
`IdleCandidate[]` there instead, and add one query before it that marks which
candidate leads have ever had a connected call:

```ts
import { selectIdleNudges, type IdleCandidate } from '@/lib/crm/idle-eligibility';
import { chunk } from '@/lib/utils/chunk';
```

```ts
    // Which of these leads has ever been ANSWERED? Chunked because the
    // candidate set is unbounded and a bare .in() on it once 414'd this very
    // cron (see the chunk() helper's own doc).
    const connectedLeadIds = new Set<string>();
    for (const batch of chunk(candidateLeadIds, 150)) {
      const { data, error } = await supabase
        .from('pyra_agent_calls')
        .select('lead_id')
        .in('lead_id', batch)
        .neq('direction', 'missed')
        .gt('duration_seconds', 0);
      if (error) {
        // Fail CLOSED for this batch: sending a nudge we cannot justify is what
        // this change exists to stop. Skipping one batch costs one day.
        console.error('[lead-idle-check] connected-call lookup failed:', error.message);
        continue;
      }
      for (const row of data ?? []) if (row.lead_id) connectedLeadIds.add(row.lead_id);
    }
```

Then replace the "notify everything idle" step with:

```ts
    const selected = selectIdleNudges(
      idleCandidates.map<IdleCandidate>((c) => ({
        leadId: c.leadId,
        agentUsername: c.agentUsername,
        lastTouchedMs: c.lastTouchedMs,
        hasConnectedCall: connectedLeadIds.has(c.leadId),
      })),
    );
```

and write activities + notify only for `selected`. Keep the existing 7-day
per-lead dedup exactly as it is — it is what stops a capped-out lead being
re-nudged tomorrow.

- [ ] **Step 6: Verify against production data, read-only**

Write the SQL to a file (it contains no Arabic, but the file route is the habit):

```bash
cat > /tmp/idle-preview.sql <<'SQL'
WITH connected AS (
  SELECT DISTINCT lead_id FROM pyra_agent_calls
  WHERE direction <> 'missed' AND duration_seconds > 0 AND lead_id IS NOT NULL
)
SELECT l.assigned_to, count(*) AS would_nudge
FROM pyra_sales_leads l
JOIN connected c ON c.lead_id = l.id
WHERE l.archived_at IS NULL AND l.is_converted IS NOT TRUE
  AND coalesce(l.last_contact_at, l.created_at) < now() - interval '7 days'
GROUP BY 1 ORDER BY 2 DESC;
SQL
pnpm db:query /tmp/idle-preview.sql
```

Expected: a number far below the current 1,189 — this is the "did the rule
actually narrow" check. Record the number in the commit message.

- [ ] **Step 7: Commit**

```bash
git add lib/crm/idle-eligibility.ts __tests__/idle-eligibility.test.ts app/api/cron/lead-idle-check/route.ts
git commit -F- <<'MSG'
feat(crm): the going-cold nudge becomes earned and capped

Measured 2026-08-12: 2,454 warnings in 30 days across 1,189 of 1,258 live leads.
A nudge on 95% of the book is not a signal — it was the largest source of
activity in the whole system, bigger than all human work combined, and the reps
had correctly learned to ignore it.

Two rules, both the owner's call: a lead must have been ANSWERED at least once
(one that never picked up was never warm), and each agent gets at most 10 a day.

The sort is deliberately the reverse of the obvious one — most recently
spoken-to first. Oldest-first would hand each rep the ten deadest leads in their
book every morning for ever, which is how a capped list still becomes noise.
leadId breaks ties so the same input always yields the same list.

The connected-call lookup is chunked and fails CLOSED per batch: sending a nudge
we cannot justify is exactly what this change removes.
MSG
```

---

### Task 6: Surface the leads nobody has ever called

**Files:**
- Modify: `app/api/mobile/my-day/route.ts`
- Modify: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/Payloads.kt`
- Modify: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/MyDayView.kt`
- Test: `pyra-calls-app/app/src/test/java/cloud/pyramedia/calls/core/MyDayViewTest.kt` (exists — extend)

**Interfaces:**
- Consumes: the existing `MyDayCounts` / `myDayTabs` contract.
- Produces: `my-day` response gains `never_contacted: MyDayLead[]` and
  `never_contacted_count: number`; `myDayTabs` gains a `neverContactedCount` input
  and a `fourTabs: Boolean` output.

- [ ] **Step 1: Extend the server response**

In `app/api/mobile/my-day/route.ts`, after the going-cold section, add:

```ts
    // ── Never contacted: the cheapest sales in the company ────────────────
    // Measured 2026-08-12: 350 live leads have never been spoken to at all —
    // 271 of cosette's and 76 of youssef's — and 180 of them arrived in the
    // last 30 days. They are invisible today because every existing section
    // keys on a date that does not exist for them.
    //
    // Oldest FIRST, unlike the going-cold list: an untouched lead only decays,
    // and the one that has waited longest is the one closest to being wasted.
    const { data: neverContactedRows, error: neverContactedErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, phone, created_at')
      .eq('assigned_to', agentUsername)
      .is('archived_at', null)
      .is('last_contact_at', null)
      .not('is_converted', 'is', true)
      .not('phone', 'is', null)
      .order('created_at', { ascending: true })
      .limit(50);
    if (neverContactedErr) {
      // Best-effort, like every other section here: the app falls back to
      // fewer tabs. Never take the screen down for one list.
      console.error('[my-day] never-contacted lookup failed:', neverContactedErr.message);
    }
```

Include in the response payload:

```ts
      never_contacted: (neverContactedRows ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        created_at: r.created_at,
      })),
```

- [ ] **Step 2: Write the failing app test**

Append to `MyDayViewTest.kt`:

```kotlin
    @Test
    fun `a fourth tab appears only when there are never-contacted leads`() {
        val without = myDayTabs(MyDayCounts(overdue = 3, today = 2, neverContacted = 0))
        assertFalse(without.fourTabs)

        val with = myDayTabs(MyDayCounts(overdue = 3, today = 2, neverContacted = 12))
        assertTrue(with.fourTabs)
        assertEquals(12, with.neverContactedCount)
    }

    @Test
    fun `an absent count from an older server does not invent a tab`() {
        // The field is additive; a server that has not deployed it yet sends
        // nothing, and a phantom empty tab would read as a broken screen.
        val out = myDayTabs(MyDayCounts(overdue = 1, today = 1, neverContacted = null))
        assertFalse(out.fourTabs)
        assertNull(out.neverContactedCount)
    }
```

- [ ] **Step 3: Run and watch it fail**

```bash
cd pyra-calls-app && ./gradlew testDebugUnitTest --tests "*MyDayViewTest*"
```

Expected: compilation failure on `neverContacted` / `fourTabs`.

- [ ] **Step 4: Extend the pure view core**

In `core/MyDayView.kt`, add `neverContacted: Int? = null` to `MyDayCounts`, add
`fourTabs: Boolean` and `neverContactedCount: Int?` to `MyDayTabs`, and set them:

```kotlin
    val neverContactedCount = counts.neverContacted
    val fourTabs = (neverContactedCount ?: 0) > 0
```

Add `never_contacted` to `Payloads.kt`'s `MyDayData` as a defaulted field:

```kotlin
    // Additive (wave د+ #03). Defaulted so an older server response — or a
    // rollback — decodes fine and simply shows no fourth tab.
    val never_contacted: List<MyDayLead> = emptyList(),
```

- [ ] **Step 5: Run and watch it pass**

```bash
cd pyra-calls-app && ./gradlew testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`, all tests green.

- [ ] **Step 6: Commit**

```bash
git add app/api/mobile/my-day/route.ts pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/MyDayView.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/Payloads.kt pyra-calls-app/app/src/test/java/cloud/pyramedia/calls/core/MyDayViewTest.kt
git commit -F- <<'MSG'
feat(mobile): a tab for the leads nobody has ever called

350 live leads have never been spoken to — 271 of cosette's, 76 of youssef's —
and 180 arrived in the last 30 days. They are invisible today for a structural
reason: every existing section keys on a date these leads do not have.

Oldest first, which is the opposite of the going-cold list and for the opposite
reason: an untouched lead only decays, so the one that has waited longest is
closest to being wasted, while a stale conversation is a re-prospecting job.

never_contacted is additive and defaulted on both sides, so a rollback or an
older server shows three tabs rather than a phantom empty one.
MSG
```

---

### Task 7: The attempt cadence — 4 over 10 days, at different hours

**Files:**
- Create: `lib/calls/attempt-cadence.ts`
- Create: `__tests__/attempt-cadence.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MAX_ATTEMPTS = 4`, `CADENCE_DAY_OFFSETS = [0, 2, 5, 10]`,
  `nextAttemptAt(firstAttemptMs, attemptsMade)`, `attemptsExhausted(attemptsMade)`.
  Task 8 renders these.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/attempt-cadence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  nextAttemptAt,
  attemptsExhausted,
  MAX_ATTEMPTS,
  CADENCE_DAY_OFFSETS,
} from '@/lib/calls/attempt-cadence';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
// 09:00 UTC = 13:00 Dubai — a normal hour for a first call.
const first = Date.parse('2026-08-12T09:00:00.000Z');

describe('attempt cadence', () => {
  it('matches the owner decision: 4 attempts spanning 10 days', () => {
    expect(MAX_ATTEMPTS).toBe(4);
    expect(CADENCE_DAY_OFFSETS).toEqual([0, 2, 5, 10]);
    expect(CADENCE_DAY_OFFSETS.length).toBe(MAX_ATTEMPTS);
  });

  it('schedules each next attempt on its cadence day, hour shift included', () => {
    // The hour shift is part of the answer, so it is asserted here rather than
    // left to the separate distinct-hours test — an exact-equality assertion
    // that ignored the shift would contradict the implementation and fail.
    expect(nextAttemptAt(first, 1)).toBe(first + 2 * DAY + 2 * HOUR);
    expect(nextAttemptAt(first, 2)).toBe(first + 5 * DAY - 2 * HOUR);
    expect(nextAttemptAt(first, 3)).toBe(first + 10 * DAY + 3 * HOUR);
  });

  it('keeps every attempt within 3 hours of the first, so none leaves the working day', () => {
    // The shifts move across the working day; they must not push a call into
    // the evening. Targeting the measured-best hours (15:00 Dubai answers 65%
    // vs 51% at 10:00) is wave 3's job — this only stops four identical calls.
    for (const n of [1, 2, 3]) {
      const drift = Math.abs(nextAttemptAt(first, n)! - first) % DAY;
      const hours = Math.min(drift, DAY - drift) / HOUR;
      expect(hours).toBeLessThanOrEqual(3);
    }
  });

  it('returns null once the attempts are spent', () => {
    // Null means "stop", and the caller turns that into «لا يرد» — not another
    // silent slot the rep will never see.
    expect(nextAttemptAt(first, 4)).toBeNull();
    expect(nextAttemptAt(first, 9)).toBeNull();
  });

  it('shifts the hour on every attempt', () => {
    // The measured spread is real: 65% answered at 15:00 Dubai vs 51% at 10:00.
    // Four calls at the same hour to someone who is never free at that hour is
    // one attempt repeated four times.
    const hours = [1, 2, 3].map((n) => new Date(nextAttemptAt(first, n)!).getUTCHours());
    expect(new Set(hours).size).toBe(hours.length);
  });

  it('treats attemptsMade of 0 as "call now"', () => {
    expect(nextAttemptAt(first, 0)).toBe(first);
  });

  it('reports exhaustion exactly at the cap', () => {
    expect(attemptsExhausted(3)).toBe(false);
    expect(attemptsExhausted(4)).toBe(true);
    expect(attemptsExhausted(5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm exec vitest run __tests__/attempt-cadence.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/calls/attempt-cadence.ts`:

```ts
/**
 * How many times we try a number before calling it dead, and when.
 *
 * ## Measured problem
 *
 * 2026-08-12: 258 leads were dialled and never reached — but only 24 of them
 * got 3 or more attempts, and 5 got five. The average is 1.6 dials. The lead
 * does not die on the first ring; somebody decides to stop.
 *
 * ## Owner decision (2026-08-12): 4 attempts over 10 days
 *
 * Deliberately lighter than the 6-over-20 industry default, and for a specific
 * reason: 812 new leads arrive every 30 days. A longer cadence would grow the
 * queue faster than the reps can close it, and a queue nobody can finish is the
 * same as no queue.
 *
 * The HOUR rotation matters as much as the count. Answer rate by Dubai hour
 * runs 51% (10:00) to 65% (15:00), so four calls at the same hour to somebody
 * never free at that hour is one attempt made four times.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const MAX_ATTEMPTS = 4;

/** Days after the FIRST attempt. Length must equal MAX_ATTEMPTS. */
export const CADENCE_DAY_OFFSETS = [0, 2, 5, 10] as const;

/**
 * Hour shift applied per attempt so consecutive tries never land at the same
 * time of day. Deliberately within ±3 hours, in both directions: a first call
 * placed at a sane hour keeps all four inside the working day, which a larger
 * drift would not. From 13:00 Dubai the four land at 13:00, 15:00, 11:00, 16:00.
 *
 * This only stops four identical calls. Actively TARGETING the measured-best
 * hour (15:00 Dubai answers 65% against 51% at 10:00) is wave 3 feature #09 —
 * doing it here would need the per-agent aggregate that wave builds.
 */
const CADENCE_HOUR_SHIFTS = [0, 2, -2, 3] as const;

/**
 * @param firstAttemptMs epoch ms of attempt #1
 * @param attemptsMade how many attempts have already happened
 * @returns epoch ms for the next attempt, or `null` when they are spent —
 *   which the caller turns into «لا يرد», never into another invisible slot.
 */
export function nextAttemptAt(firstAttemptMs: number, attemptsMade: number): number | null {
  if (attemptsMade >= MAX_ATTEMPTS) return null;
  const index = Math.max(0, attemptsMade);
  return (
    firstAttemptMs +
    CADENCE_DAY_OFFSETS[index] * DAY_MS +
    CADENCE_HOUR_SHIFTS[index] * HOUR_MS
  );
}

export function attemptsExhausted(attemptsMade: number): boolean {
  return attemptsMade >= MAX_ATTEMPTS;
}
```

- [ ] **Step 4: Run and watch it pass**

```bash
pnpm exec vitest run __tests__/attempt-cadence.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/calls/attempt-cadence.ts __tests__/attempt-cadence.test.ts
git commit -F- <<'MSG'
feat(calls): the attempt cadence, with its numbers pinned to a decision

258 leads were dialled and never reached, and only 24 of them got three or more
tries — average 1.6. The lead does not die on the first ring; somebody stops.

4 attempts over 10 days is the owner's call and is lighter than the 6-over-20
default on purpose: 812 new leads arrive every 30 days, so a longer cadence
grows the queue faster than it can be cleared, and a queue nobody can finish is
the same as no queue.

The hour rotation is not decoration. Answer rate runs 51% at 10:00 to 65% at
15:00, so four calls at the same hour to someone never free then is one attempt
made four times. A test asserts the hours are distinct rather than trusting the
table to stay that way.
MSG
```

---

### Task 8: Show the attempt count, and gate «لا يرد» behind it

**Files:**
- Modify: `app/api/mobile/my-day/route.ts` (add `attempts_made` to the cold rows)
- Modify: `pyra-calls-app/.../core/Payloads.kt`, `ui/components/LeadRow.kt`
- Modify: `pyra-calls-app/.../res/values/strings.xml`

**Interfaces:**
- Consumes: `MAX_ATTEMPTS`, `attemptsExhausted` (Task 7).
- Produces: nothing further — closes wave 1.

- [ ] **Step 1: Return the count**

In `app/api/mobile/my-day/route.ts`, after the going-cold rows are built and
before the response is assembled, count every dial per cold lead. Chunked for the
same reason Task 5's lookup is — an unbounded `.in()` list once 414'd a cron here:

```ts
import { chunk } from '@/lib/utils/chunk';
import { MAX_ATTEMPTS } from '@/lib/calls/attempt-cadence';
```

```ts
    // Attempts per cold lead. EVERY dial counts, answered or not: the cadence is
    // about how many times we have tried this number, and an unanswered dial is
    // precisely the kind of try a rep forgets they already made.
    const attemptsByLead = new Map<string, number>();
    const coldLeadIds = coldRows.map((r) => r.id);
    for (const batch of chunk(coldLeadIds, 150)) {
      const { data, error } = await supabase
        .from('pyra_agent_calls')
        .select('lead_id')
        .in('lead_id', batch);
      if (error) {
        // Best-effort like every other section here: a missing count renders as
        // no chip, which is the pre-wave behaviour. Never take the screen down.
        console.error('[my-day] attempt count failed:', error.message);
        break;
      }
      for (const row of data ?? []) {
        if (!row.lead_id) continue;
        attemptsByLead.set(row.lead_id, (attemptsByLead.get(row.lead_id) ?? 0) + 1);
      }
    }
```

Attach it to each cold row as `attempts_made: attemptsByLead.get(r.id) ?? 0`, and
add `attempts_made: Int = 0` to the app's cold-lead payload class in
`core/Payloads.kt` (defaulted, so an older server simply shows no chip).

- [ ] **Step 2: Add the strings**

```xml
    <!-- Wave د+ #04 -->
    <string name="attempts_of">محاولة %1$d من %2$d</string>
    <string name="attempts_spent">انتهت المحاولات — سجّله «لا يرد»</string>
```

- [ ] **Step 3: Render it on the row**

First read the row's current chip layout so the addition matches it:

```bash
grep -n "PyraChip\|FlowRow\|Row(\|stringResource" pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/components/LeadRow.kt
```

Then add one chip, driven by the count:

```kotlin
if (attemptsMade > 0) {
    val spent = attemptsMade >= MAX_ATTEMPTS
    PyraChip(
        text = if (spent) stringResource(R.string.attempts_spent)
               else stringResource(R.string.attempts_of, attemptsMade, MAX_ATTEMPTS),
        tone = if (spent) PyraChipTone.WARNING else PyraChipTone.NEUTRAL,
    )
}
```

`MAX_ATTEMPTS` is `4` and must come from a single Kotlin constant — add
`const val MAX_ATTEMPTS = 4` to `core/OutcomeForm.kt`'s companion area or a new
`core/AttemptPolicy.kt`, and reference it here. Do NOT inline `4` at the call
site: the number is an owner decision recorded in Global Constraints, and the
server has its own copy in `lib/calls/attempt-cadence.ts`.

**If this pushes the row to three or more chips, convert the container to
`FlowRow`.** A plain `Row` clipped chips at large font sizes — that was bug B-02,
found on a real handset after the build and tests were both green.

Match `PyraChip`'s real parameter names and tone enum to whatever the grep shows;
the names above are the expected shape, not a licence to skip reading the file.

- [ ] **Step 4: Build, test, lint**

```bash
cd pyra-calls-app && ./gradlew testDebugUnitTest lintDebug
```

- [ ] **Step 5: Commit**

```bash
git add app/api/mobile/my-day/route.ts pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/Payloads.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/components/LeadRow.kt pyra-calls-app/app/src/main/res/values/strings.xml
git commit -F- <<'MSG'
feat(app): the attempt count on the row, so stopping becomes a decision

A rep giving up after 1.6 tries is not making a choice — they have no idea which
try they are on. Showing "attempt 2 of 4" turns an invisible default into a
visible one, and "attempts spent" tells them what to do instead of leaving the
lead in limbo.

FlowRow rather than Row: this pushes the row to three or more chips, and a plain
Row clipped them at large font sizes, which was bug B-02.
MSG
```

---

### Task 9: Verify the wave, then release

**Files:**
- Modify: `pyra-calls-app/app/build.gradle.kts` (versionCode 11 / versionName 1.8.0)
- Modify: `docs/CALL-TRACKING-BACKLOG.md`, `docs/CALL-TRACKING.md`

- [ ] **Step 1: Full gates**

```bash
pnpm run check && pnpm test && pnpm build && pnpm lint
cd pyra-calls-app && ./gradlew testDebugUnitTest lintDebug
```

Expected: all green. `pnpm lint` must report **0 errors**.

- [ ] **Step 2: Deploy the server FIRST and confirm it landed**

```bash
git fetch origin && git push origin HEAD:main
curl -s https://workspace.pyramedia.cloud/api/health
```

Wait for `built_at` to move past the push. **The next-step rule is still dormant
at this point** — the fleet is on versionCode 10 and the gate is off, which is
the entire reason it can deploy safely ahead of the app.

- [ ] **Step 3: Prove the version gate on live production**

Using `test.sales` (never a real agent), mint a device key and confirm both sides
of the gate:

```bash
# with x-app-version: 10  → an outcome WITHOUT a next step must SUCCEED
# with x-app-version: 11  → the same body must be rejected with «الخطوة الجاية»
```

This is the check that proves the live phones cannot break.

- [ ] **Step 4: Confirm the idle cron narrowed, on the real 01:00 UTC run**

```bash
pnpm db:query "SELECT count(*) AS warnings, count(DISTINCT lead_id) AS leads FROM pyra_lead_activities WHERE activity_type='idle_warning' AND created_at > now() - interval '2 hours'"
```

Expected: at most 10 per active agent, versus the 1,189-lead baseline. Record the
number.

- [ ] **Step 5: Bump, build, publish**

```bash
cd pyra-calls-app && ./gradlew clean assembleRelease
cd .. && pnpm app:publish pyra-calls-app/app/build/outputs/apk/release/app-release.apk --by elharm
```

**No Arabic in `--notes`** — a Windows command line turns it into literal `?` and
`UpdateActivity` renders that text to the rep. Set the notes afterwards from a
UTF-8 `.sql` file via `pnpm db:query`, then read the row back.

- [ ] **Step 6: Device-test on the silver handset**

The owner has connected cosette's old silver phone for exactly this. Verify on
the device, not the emulator:

1. A connected call → the sheet → Save is **disabled** with «اختار الخطوة الجاية».
2. One tap on «بعد ٣ أيام» → Save enables → saves.
3. `pnpm db:query` shows the `pyra_sales_follow_ups` row with the right `due_at`.
4. «غير مهتم» + reason → Save enables with **no** date required.
5. The fourth tab shows the never-contacted leads, oldest first.
6. A going-cold row shows «محاولة N من 4».

- [ ] **Step 7: Record it**

Update `docs/CALL-TRACKING-BACKLOG.md` (new wave section, the four items closed,
the live version) and `docs/CALL-TRACKING.md` (the `call-outcome` contract gains a
conditionally-required field — document the version gate). Then commit and push.

---

## Self-Review

**Spec coverage.** Wave-1 features 01–04 each map to tasks: #01 → Tasks 1–4,
#02 → Task 5, #03 → Task 6, #04 → Tasks 7–8. Release + verification → Task 9.
Features 05–12 are **deliberately out of scope** — the owner chose wave-by-wave
with a release between, so waves 2 and 3 get their own plans once wave 1 is
measured in the field.

**Placeholder scan.** No TBD/TODO. Every code step carries real code. Task 8's
steps 1 and 3 describe edits against files whose exact current shape must be read
first — the grep in Task 4 Step 1 is the pattern to follow there.

**Type consistency.** `nextStepSatisfied(outcome: String?, presetDays: Int?)` is
used identically in Tasks 1 and 4. `IdleCandidate` fields match between the
module, its tests, and the cron mapping in Task 5. `MyDayCounts.neverContacted`
is `Int?` in both the test and the implementation. `nextAttemptAt` returns
`number | null` and every call site handles the null.

**One open risk, stated rather than hidden.** Task 5 changes who gets nudged, and
the only real proof is a cron cycle at 01:00 UTC — Task 9 Step 4 waits for it
instead of asserting success from the unit tests.
