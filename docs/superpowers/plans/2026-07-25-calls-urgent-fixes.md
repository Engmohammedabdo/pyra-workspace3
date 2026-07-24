# Calls/CRM Urgent Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop three live production defects in the call-tracking → CRM chain (unanswered dials recorded as real contact, the lead-idle cron dead 11 days, zero alerting when anything fails), clean the data those defects already corrupted, and unblock the two broken pipeline-filter paths.

**Architecture:** Four independent server-side changes plus one client-side filter fix. No Android work, no APK release, no user-visible downtime. One data backfill runs as a scripted, snapshot-first migration (backup-rollback doctrine — this codebase has no transactions).

**Tech Stack:** Next.js 15 App Router route handlers · Supabase (service-role) · Vitest for pure helpers · n8n (schedule triggers) · next-intl catalogs.

## Global Constraints

- Package manager is **pnpm** (never npm). Server verify: `pnpm run check` then `pnpm build`. Tests: `pnpm test`.
- Git: commit per task on branch `integrate-pending-fixes`; push with `git push origin HEAD:integrate-pending-fixes`. **NEVER push to `origin/main`** — that deploys production and happens only on Abdou's explicit «ادمج».
- **NEVER `git add -A` / `git add .`** — concurrent sessions leave unrelated dirty files in this tree. Stage exact paths only.
- DB access: `pnpm db:query "<sql>"` (read) from the repo root. **Any SQL containing Arabic or any non-ASCII MUST go through a UTF-8 `.sql` file** (`pnpm db:query path/to/file.sql`) — inline non-ASCII is transcoded to `?` by the Windows shell and is rejected by the runner.
- **NEVER put a `%` LIKE pattern in an inline `db:query`** — cmd.exe expands `%VAR%` and the query silently returns plausible WRONG results. Use exact match / `IN` / `split_part` / a `.sql` file.
- **Never guess column names.** `SELECT column_name FROM information_schema.columns WHERE table_name = 'pyra_X' ORDER BY ordinal_position` first.
- Supabase JS builders are lazy and resolve with `{ error }` (they do NOT throw): every query must be awaited AND its `error` inspected. `const q = supabase...; q.eq(...)` silently discards the filter — always `let q = ...; q = q.eq(...)`.
- Route handlers: gate first (`getExternalAuth` + permission check for crons), THEN `createServiceRoleClient()`. Responses via `apiSuccess()`/`apiError()`/`apiServerError()`. `logError()` in every catch.
- Notifications go through `notify()`/`notifyMany()` from `lib/notifications/notify.ts` — NEVER a raw insert into `pyra_notifications`. New notification types must be added to the `NotificationType` union.
- New cron endpoints follow the Phase D §7 pattern verbatim (see `app/api/cron/device-silent-check/route.ts`): `getExternalAuth` → permission `cron.<name>` or `*` → service-role client → per-job try/catch → `apiSuccess`.
- Dubai-day comparisons use `dubaiDayKey()` from `lib/utils/format.ts`. `.toISOString().slice(0,10)` is a regression smell.
- SDD ledger: append one line per task to `.superpowers/sdd/progress.md` (committed).

## Context an implementer must know

Verified 2026-07-24/25 against prod. Full audit: memory `calls-system-audit-2026-07-24.md`.

- **823 calls total; 289 of 773 outgoing are 0-second.** The "connected" gate is `direction !== 'missed'` with no duration check, so an unanswered dial writes a `call_logged` timeline row AND stamps `pyra_sales_leads.last_contact_at`. **257 fake `call_logged` rows** exist and **107 active leads** carry a `last_contact_at` that came from a call nobody answered.
- **`lead-idle-check` has failed 11 consecutive days** (2026-07-14 → 2026-07-24, 01:00Z) with PostgREST `URI too long`, stage `activities_select`. 754 lead ids ≈ 13.5 KB of query string. Last successful output: `idle_warning` rows dated 2026-07-12. **A second identical unbounded `.in()` exists at line 188** and will fail the same way once 134 is fixed.
- **`pyra_error_logs` has no alerting path at all.** 50 unresolved rows since 2026-06-30, zero ever marked resolved. `error-logs-cleanup` prunes at 90 days, so unnoticed failures erase their own evidence.
- Downstream consumers of the poisoned signal take `greatest(last_contact_at, latest pyra_lead_activities.created_at)` — see `app/api/crm/dashboard/deals-at-risk/route.ts:17` and `lead-idle-check` lines 160-168. This is why nulling a bogus `last_contact_at` is safe: the activity half still carries any genuine touch.
- Other writers of `last_contact_at`: `app/api/crm/leads/[id]/activities/route.ts:180` (every manual activity bumps it to now()), the lead PATCH whitelist (`app/api/crm/leads/[id]/route.ts:156`), and the WhatsApp webhook. The mobile sync bug is the only one that writes it for a call nobody answered.

**Task order is load-bearing.** Fix the gate (T1) → clean the data (T2) → only THEN re-enable the idle cron (T3). Re-enabling first would run it against poisoned `last_contact_at` and silently skip the ~107 leads that most need a warning.

---

### Task 1: Stop counting unanswered dials as contact

**Files:**
- Modify: `app/api/mobile/calls/sync/route.ts:131`
- Modify: `app/api/mobile/leads/route.ts:61`
- Create: `__tests__/calls-connected-gate.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: a shared exported predicate other tasks reuse — `isConnectedCall({ direction, duration_seconds }): boolean` in `lib/calls/match.ts` (that module is already the shared pure-helper home for call logic and is already unit-tested).

- [ ] **Step 1: Write the failing test**

Create `__tests__/calls-connected-gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isConnectedCall } from '@/lib/calls/match';

describe('isConnectedCall', () => {
  it('treats an answered outgoing call as connected', () => {
    expect(isConnectedCall({ direction: 'outgoing', duration_seconds: 42 })).toBe(true);
  });
  it('treats an answered incoming call as connected', () => {
    expect(isConnectedCall({ direction: 'incoming', duration_seconds: 7 })).toBe(true);
  });
  it('treats a 0-second outgoing dial as NOT connected (nobody picked up)', () => {
    expect(isConnectedCall({ direction: 'outgoing', duration_seconds: 0 })).toBe(false);
  });
  it('treats a 0-second incoming call as NOT connected', () => {
    expect(isConnectedCall({ direction: 'incoming', duration_seconds: 0 })).toBe(false);
  });
  it('treats a missed call as NOT connected regardless of duration', () => {
    expect(isConnectedCall({ direction: 'missed', duration_seconds: 30 })).toBe(false);
  });
  it('treats a negative/garbage duration as NOT connected', () => {
    expect(isConnectedCall({ direction: 'outgoing', duration_seconds: -1 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test calls-connected-gate`
Expected: FAIL — `isConnectedCall` is not exported from `lib/calls/match`.

- [ ] **Step 3: Implement the helper**

Append to `lib/calls/match.ts` (keep the file's existing doc-comment style):

```ts
/**
 * A call counts as real CONTACT only when someone actually picked up.
 *
 * The original gate was `direction !== 'missed'`, which classified a
 * 0-second unanswered outgoing dial as contact — writing a `call_logged`
 * timeline row and stamping `last_contact_at`. That poisoned every
 * recency-driven signal (health score, deals-at-risk, lead-idle-check) and
 * produced 257 fake activities + 107 falsely-fresh leads before it was
 * caught. Duration is the only honest signal the Android CallLog gives us.
 */
export function isConnectedCall(call: {
  direction: string;
  duration_seconds: number;
}): boolean {
  return call.direction !== 'missed' && call.duration_seconds > 0;
}
```

- [ ] **Step 4: Run the test again**

Run: `pnpm test calls-connected-gate`
Expected: PASS, 6/6.

- [ ] **Step 5: Use it at both call sites**

In `app/api/mobile/calls/sync/route.ts`, import `isConnectedCall` alongside the existing `buildLeadPhoneIndex`/`matchLeadByPhone` import from `@/lib/calls/match`, then replace line 131:

```ts
      const connected = isConnectedCall(call);
```

In `app/api/mobile/leads/route.ts` (`retroLinkCalls`), replace the line-61 condition:

```ts
    if (isConnectedCall(call)) {
```

Add the import there too. Leave everything else in both files byte-identical — the `pyra_agent_calls` row itself must still be inserted for 0-second calls (they are real dials and the calls report counts them); only the timeline activity + `last_contact_at` bump are suppressed.

- [ ] **Step 6: Verify nothing else regressed**

Run: `pnpm test` → all green.
Run: `pnpm run check` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add lib/calls/match.ts app/api/mobile/calls/sync/route.ts app/api/mobile/leads/route.ts __tests__/calls-connected-gate.test.ts
git commit -m "fix(calls): a 0-second dial is not contact - stop faking timeline rows and last_contact_at"
```

---

### Task 2: Backfill — undo the 257 fake activities and 107 poisoned timestamps

**Files:**
- Create: `scripts/sql/backfill-zero-duration-contact.sql` (measurement + snapshot, read/write, idempotent)
- Create: `scripts/backfill-zero-duration-contact.ts` (the runner, snapshot-first)
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: `isConnectedCall` semantics from Task 1 (a call is genuine iff `direction <> 'missed' AND duration_seconds > 0`).
- Produces: a snapshot file `backups/zero-duration-backfill-<runId>.json` containing every row mutated, so the change is reversible by hand.

**Decision (Abdou, 2026-07-25): full cleanup.** Delete the fake activities AND correct the timestamps. Reconstruction rule for each affected lead: `last_contact_at = MAX(called_at)` over that lead's GENUINE calls (`direction <> 'missed' AND duration_seconds > 0`); **NULL when the lead has none**. Nulling is safe because every downstream consumer takes `greatest(last_contact_at, latest activity created_at)` — a genuine WhatsApp/manual touch still registers through the activity half.

- [ ] **Step 1: Measure before touching anything**

Run each and record the output in the task report:

```bash
pnpm db:query "SELECT count(*) AS fake_activities FROM pyra_lead_activities a WHERE a.activity_type = 'call_logged' AND (a.metadata->>'duration_seconds')::int = 0"
```

```bash
pnpm db:query "SELECT count(DISTINCT l.id) AS poisoned_leads FROM pyra_sales_leads l JOIN pyra_agent_calls c ON c.lead_id = l.id WHERE c.duration_seconds = 0 AND c.direction <> 'missed' AND l.last_contact_at IS NOT NULL AND date_trunc('minute', l.last_contact_at) = date_trunc('minute', c.called_at)"
```

If the counts differ materially from 257 / 107, STOP and report — the shape of the corruption is not what the audit measured and the rule below may not fit.

- [ ] **Step 2: Confirm the reconstruction rule's blast radius**

```bash
pnpm db:query "SELECT count(*) FILTER (WHERE g.genuine_max IS NULL) AS would_become_null, count(*) FILTER (WHERE g.genuine_max IS NOT NULL) AS would_move_back FROM (SELECT l.id, max(c.called_at) FILTER (WHERE c.duration_seconds > 0 AND c.direction <> 'missed') AS genuine_max FROM pyra_sales_leads l JOIN pyra_agent_calls c ON c.lead_id = l.id WHERE l.last_contact_at IS NOT NULL GROUP BY l.id) g"
```

Record both numbers. A large `would_become_null` is expected and correct (those leads were never actually spoken to).

- [ ] **Step 3: Write the snapshot + backfill runner**

Create `scripts/backfill-zero-duration-contact.ts`. Follow `scripts/db-record-migration.ts` for the env-reading pattern: read `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` by **file read only** (never `process.env`, never CLI args, never logged).

Behaviour, in this exact order:

1. `--dry-run` is the DEFAULT. Mutations happen only with an explicit `--apply`.
2. SELECT the two affected sets:
   - fake activities: `pyra_lead_activities` where `activity_type = 'call_logged'` and `(metadata->>'duration_seconds')::int = 0` — select `id, lead_id, created_at, metadata`.
   - affected leads: every lead id referenced by those activities, UNION every lead whose `last_contact_at` matches a 0-second call (query from Step 1), each with its current `last_contact_at` and its computed `genuine_max`.
3. Write BOTH sets verbatim to `backups/zero-duration-backfill-<ISO-ish-runId>.json` **before any write**. Abort if the file cannot be written. (`runId` comes from a CLI arg or a timestamp computed in the script — this is a plain node script, not a workflow, so `Date.now()` is fine here.)
4. Print a summary table: fake activities to delete, leads to update, of which N → NULL and M → an earlier timestamp.
5. With `--apply`: delete the fake activities **in batches of 200 ids** (never one unbounded `.in()` — that is the exact defect Task 3 fixes), checking `{ error }` on every batch and aborting on the first failure. Then update the leads in batches of 200, same discipline.
6. Re-run the Step-1 measurement queries at the end and print before/after.

- [ ] **Step 4: Dry run**

Run: `npx tsx scripts/backfill-zero-duration-contact.ts`
Expected: the summary matches Step 1/2 numbers, the snapshot file exists under `backups/`, and NOTHING was mutated (verify by re-running the Step-1 query — counts unchanged).

- [ ] **Step 5: Apply**

Run: `npx tsx scripts/backfill-zero-duration-contact.ts --apply`
Expected: fake activities → 0; the poisoned-lead query → 0. Paste both outputs into the report.

- [ ] **Step 6: Spot-check three real leads**

Pick 3 lead ids from the snapshot (one that went to NULL, two that moved back) and for each run a small query showing `last_contact_at` plus that lead's genuine calls, confirming the new value equals the max genuine `called_at` (or NULL with no genuine calls). Paste the results.

- [ ] **Step 7: Commit**

```bash
git add scripts/backfill-zero-duration-contact.ts
git commit -m "chore(calls): snapshot-first backfill removing 0-second fake contact signals"
```

`backups/` is gitignored — the snapshot file stays local by design. Note its full path in the report.

---

### Task 3: Revive the lead-idle-check cron (batch both unbounded `.in()` calls)

**Files:**
- Modify: `app/api/cron/lead-idle-check/route.ts` (the `.in()` at line 134 and the one at line 188)
- Create: `lib/utils/chunk.ts` + `__tests__/chunk.test.ts` — **only if** no chunk/batch helper already exists; grep first (`grep -rn "function chunk" lib/`) and reuse if it does.

**Interfaces:**
- Consumes: clean `last_contact_at` data from Task 2 (load-bearing — see the ordering note).
- Produces: `chunk<T>(items: T[], size: number): T[][]` (only if newly created).

- [ ] **Step 1: TDD the chunk helper (skip entirely if one already exists)**

`__tests__/chunk.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chunk } from '@/lib/utils/chunk';

describe('chunk', () => {
  it('splits into full batches', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
  it('keeps the short trailing batch', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
  it('returns an empty array for empty input', () => {
    expect(chunk([], 10)).toEqual([]);
  });
  it('returns one batch when size exceeds length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });
});
```

Run: `pnpm test chunk` → FAIL. Then implement:

```ts
/** Split an array into fixed-size batches (last batch may be short). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be >= 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
```

Run: `pnpm test chunk` → PASS.

- [ ] **Step 2: Batch the activities SELECT (line 131-147)**

Replace the single query with a batched loop that preserves the existing fail-closed behaviour exactly (same `logError` metadata `stage: 'activities_select'`, same `apiServerError()` return — that fail-closed choice is deliberate and documented in the surrounding comment; do not soften it):

```ts
    // ── Q2: Most-recent activity per lead (across all activity types) ──
    // Batched: a single .in() with every lead id put ~13.5 KB in the query
    // string and PostgREST answered "URI too long" — the cron then failed
    // closed every day for 11 days (2026-07-14 → 2026-07-24) and nobody was
    // told. Batch size 150 keeps each URL well under the proxy's 8 KB header
    // buffer with room for the rest of the query.
    const LEAD_ID_BATCH = 150;
    const actRows: ActivityRow[] = [];
    for (const idBatch of chunk(leadIds, LEAD_ID_BATCH)) {
      const { data: actData, error: actErr } = await supabase
        .from('pyra_lead_activities')
        .select('lead_id, created_at')
        .in('lead_id', idBatch)
        .order('created_at', { ascending: false });
      if (actErr) {
        // A swallowed error here would leave lastActivityByLead empty, so leads
        // with a fresh note but null last_contact_at get mis-flagged idle → false
        // warnings that also poison the 7-day dedup. Fail closed instead.
        logError({
          error: actErr,
          request,
          metadata: { source: 'cron', job: 'lead-idle-check', stage: 'activities_select' },
        });
        console.error('[cron/lead-idle-check] activities SELECT failed:', actErr.message);
        return apiServerError();
      }
      actRows.push(...((actData ?? []) as unknown as ActivityRow[]));
    }
```

Then the existing map-building loop must iterate `actRows` instead of `actData ?? []`. **Ordering caveat:** each batch is DESC internally but the concatenation is not globally sorted — the existing `if (!lastActivityByLead.has(row.lead_id))` idiom still works because every row for a given lead lives in exactly one batch. Add a one-line comment saying so, or make it order-independent by keeping the max:

```ts
    const lastActivityByLead = new Map<string, string>();
    for (const row of actRows) {
      // Rows for a given lead all come from one batch (batches partition by
      // lead id), and each batch is DESC — but keep the max explicitly so this
      // stays correct if batching ever changes.
      const prev = lastActivityByLead.get(row.lead_id);
      if (!prev || row.created_at > prev) lastActivityByLead.set(row.lead_id, row.created_at);
    }
```

- [ ] **Step 3: Batch the dedup SELECT (line 185-201)**

Same treatment, preserving the `stage: 'idle_dedup_select'` metadata and the fail-closed return:

```ts
    const idleLeadIds = idleLeads.map((l) => l.id);
    const alreadyWarnedSet = new Set<string>();
    for (const idBatch of chunk(idleLeadIds, LEAD_ID_BATCH)) {
      const { data: recentWarnings, error: dedupErr } = await supabase
        .from('pyra_lead_activities')
        .select('lead_id')
        .in('lead_id', idBatch)
        .eq('activity_type', 'idle_warning')
        .gte('created_at', dedupCutoffIso);
      if (dedupErr) {
        logError({
          error: dedupErr,
          request,
          metadata: { source: 'cron', job: 'lead-idle-check', stage: 'idle_dedup_select' },
        });
        console.error('[cron/lead-idle-check] idle_warning dedup SELECT failed:', dedupErr.message);
        return apiServerError();
      }
      for (const r of (recentWarnings ?? []) as Array<{ lead_id: string }>) {
        alreadyWarnedSet.add(r.lead_id);
      }
    }
```

Delete the now-dead single-query version and its `recentWarnings`/`alreadyWarnedSet` construction below it. **Scan the whole file for any other `.in(` on an unbounded id array and batch it too** — grep the file before declaring done.

- [ ] **Step 4: Verify**

Run: `pnpm test` → all green. `pnpm run check` → 0 errors. `pnpm build` → success.

- [ ] **Step 5: Dry-fire against production and expect a backlog flood**

The endpoint is device/cron-authed. Get the wildcard key name from `pnpm db:query "SELECT id, name FROM pyra_api_keys WHERE is_active = true"`, then invoke the route on prod exactly as n8n would (POST with the `x-api-key` header). **The raw key value is not stored anywhere readable — if you cannot obtain it, do NOT invent one: report this step as blocked and hand it to Abdou.**

Expected first-run behaviour (state it in the report): a large one-off batch of `idle_warning` inserts, because the 7-day dedup window expired for every lead during the 12-day outage. Record `leads_checked`, `leads_idle`, `activities_inserted`, `agents_notified` from the response.

Then confirm the failures stopped:

```bash
pnpm db:query "SELECT count(*) AS failures_since_fix FROM pyra_error_logs WHERE metadata->>'job' = 'lead-idle-check' AND created_at > now() - interval '10 minutes'"
```

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/lead-idle-check/route.ts lib/utils/chunk.ts __tests__/chunk.test.ts
git commit -m "fix(cron): batch lead-idle-check id lookups - URI-too-long killed it for 11 days"
git push origin HEAD:integrate-pending-fixes
```

---

### Task 4: Daily failure digest — so nothing dies silently again

**Files:**
- Create: `app/api/cron/error-digest/route.ts`
- Modify: `lib/notifications/notify.ts` (add `'system_error_digest'` to the `NotificationType` union)
- Create: `scripts/sql/grant-cron-error-digest.sql`
- Modify: `docs/MIGRATIONS.md` (§Operations cron list) — append the new job

**Interfaces:**
- Consumes: `getExternalAuth`/`hasPermission` (`lib/api/external-auth.ts`), `notifyMany` (`lib/notifications/notify.ts`), `dubaiDayKey` (`lib/utils/format.ts`).
- Produces: `POST /api/cron/error-digest` → `apiSuccess({ window_hours, new_errors, unresolved_total, failing_jobs, admins_notified, skipped_no_news })`.

**Assumption stated for the record:** the digest is daily, goes to every ACTIVE admin, and is silent on a clean day (no news = no notification) so the bell stays meaningful. Threshold-free by design — one row is worth knowing about at this volume.

- [ ] **Step 1: Extend the notification type union**

In `lib/notifications/notify.ts`, add `'system_error_digest'` to the `NotificationType` union (alphabetical/grouped consistently with neighbours). Do not touch anything else in that file.

- [ ] **Step 2: Write the route**

`app/api/cron/error-digest/route.ts` — mirror `device-silent-check` structurally (read it first; copy its auth block, its service-role usage, its `logError` metadata shape, and its `notifyMany` loop style):

```ts
import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiError, apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';
import { notifyMany } from '@/lib/notifications/notify';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/error-digest
//
// Daily admin digest of pyra_error_logs. Exists because the table was
// write-only from the app's perspective: lead-idle-check failed 11 consecutive
// days (2026-07-14 → 2026-07-24) and nothing surfaced it — 50 rows accumulated
// since 2026-06-30 with not one ever marked resolved. error-logs-cleanup then
// prunes at 90 days, so an unnoticed failure eventually erases its own
// evidence. Silent on a clean day so the bell keeps meaning something.
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_HOURS = 24;

export async function POST(request: NextRequest) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.error-digest') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.error-digest', 403);
    }

    const supabase = createServiceRoleClient();
    const sinceIso = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const { data: recent, error: recentErr } = await supabase
      .from('pyra_error_logs')
      .select('id, severity, message, metadata, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(500);
    if (recentErr) {
      logError({ error: recentErr, request, metadata: { source: 'cron', job: 'error-digest', stage: 'recent_select' } });
      console.error('[cron/error-digest] recent SELECT failed:', recentErr.message);
      return apiServerError();
    }

    const { count: unresolvedTotal, error: unresolvedErr } = await supabase
      .from('pyra_error_logs')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', false);
    if (unresolvedErr) {
      logError({ error: unresolvedErr, request, metadata: { source: 'cron', job: 'error-digest', stage: 'unresolved_count' } });
      console.error('[cron/error-digest] unresolved count failed:', unresolvedErr.message);
      return apiServerError();
    }

    const rows = recent ?? [];
    // A failing cron is the loudest signal in the table — surface job names.
    const failingJobs = Array.from(
      new Set(
        rows
          .filter((r) => (r.metadata as Record<string, unknown> | null)?.source === 'cron')
          .map((r) => String((r.metadata as Record<string, unknown>)?.job ?? 'unknown')),
      ),
    );

    if (rows.length === 0) {
      return apiSuccess({
        window_hours: WINDOW_HOURS,
        new_errors: 0,
        unresolved_total: unresolvedTotal ?? 0,
        failing_jobs: [],
        admins_notified: 0,
        skipped_no_news: true,
      });
    }

    const { data: adminRows, error: adminsErr } = await supabase
      .from('pyra_users')
      .select('username')
      .eq('role', 'admin')
      .eq('status', 'active');
    if (adminsErr) {
      logError({ error: adminsErr, request, metadata: { source: 'cron', job: 'error-digest', stage: 'admins_select' } });
      console.error('[cron/error-digest] admins SELECT failed:', adminsErr.message);
      return apiServerError();
    }
    const adminUsernames = ((adminRows ?? []) as Array<{ username: string }>).map((a) => a.username);

    let adminsNotified = 0;
    if (adminUsernames.length > 0) {
      const jobsPart = failingJobs.length > 0 ? ` — مهام متوقفة: ${failingJobs.join('، ')}` : '';
      try {
        await notifyMany(supabase, adminUsernames, {
          type: 'system_error_digest',
          title: 'أخطاء جديدة في النظام',
          message: `${rows.length} خطأ جديد خلال آخر ${WINDOW_HOURS} ساعة (${unresolvedTotal ?? 0} غير محلول إجمالاً)${jobsPart}`,
          link: '/dashboard/admin/error-logs',
          entity: { type: 'error_digest', id: rows[0].id },
          from: { username: 'system' },
        });
        adminsNotified = adminUsernames.length;
      } catch (notifyErr) {
        console.error('[cron/error-digest] notify failed:', notifyErr);
      }
    }

    return apiSuccess({
      window_hours: WINDOW_HOURS,
      new_errors: rows.length,
      unresolved_total: unresolvedTotal ?? 0,
      failing_jobs: failingJobs,
      admins_notified: adminsNotified,
      skipped_no_news: false,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { source: 'cron', job: 'error-digest' } });
    console.error('[cron/error-digest] threw:', err);
    return apiServerError();
  }
}
```

Before finalizing: confirm `pyra_error_logs` actually has a `resolved` boolean and a `severity` column (`information_schema`), and confirm `notifyMany`'s exact signature by reading it — adapt rather than assume.

- [ ] **Step 3: Grant the permission**

`scripts/sql/grant-cron-error-digest.sql` (ASCII only — safe inline, but keep it a file for the record):

```sql
-- One-off grant: allow the scoped n8n cron API key to call /api/cron/error-digest.
-- Idempotent: the @> guard makes re-runs no-ops.
UPDATE pyra_api_keys
SET permissions = permissions || '["cron.error-digest"]'::jsonb
WHERE name = 'n8n PyraCRM_Cron'
  AND is_active = true
  AND NOT permissions @> '["cron.error-digest"]'::jsonb;
```

Run it: `pnpm db:query scripts/sql/grant-cron-error-digest.sql`, then verify with a SELECT of that key's permissions.

- [ ] **Step 4: Verify locally**

`pnpm run check` → 0 errors. `pnpm build` → success.

- [ ] **Step 5: Schedule it in n8n**

Use the n8n MCP tools. Add ONE Schedule Trigger (daily, 09:00 Dubai = 05:00 UTC) + ONE HTTP Request node (POST `https://workspace.pyramedia.cloud/api/cron/error-digest`, header `x-api-key` = the PyraCRM_Cron key) to the **PyraCRM_Cron** workflow.

**Two traps, both already burned us:** (1) `update_workflow` creates a DRAFT — you MUST call `publish_workflow` afterwards or the node never runs; (2) verify the published version actually contains the new node by re-reading the workflow and comparing `activeVersionId` to `versionId` — a prior wave shipped an access-reconcile node that lives in the draft only and has probably never fired. Report both ids.

**This step only takes effect after the route is deployed to production.** If `main` has not been merged yet, wire the nodes but expect the first manual test to 404 — say so explicitly in the report rather than reporting success.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/error-digest/route.ts lib/notifications/notify.ts scripts/sql/grant-cron-error-digest.sql docs/MIGRATIONS.md
git commit -m "feat(observability): daily admin error digest - nothing dies silently again"
git push origin HEAD:integrate-pending-fixes
```

---

### Task 5: Unblock the two dead pipeline-filter paths

**Files:**
- Modify: `components/crm/pipeline/pipeline-filter-bar.tsx:39` (SOURCE_VALUES)
- Modify: `messages/ar/crm.json` + `messages/en/crm.json` (`crm.pipeline.filterBar.sources.phone_call`)
- Modify: `app/dashboard/crm/pipeline/pipeline-client.tsx` (read the `filter` param around lines 144-147)

**Interfaces:**
- Consumes: the existing URL-state filter pattern in `pipeline-client.tsx` (`sp.get('search'|'assigned_to'|'source'|'priority')`).
- Produces: a working `?filter=at_risk` view and a selectable «مكالمة هاتفية» source option.

**Why:** `phone_call` is 427 of 881 leads (48%) and is unselectable in the UI although the API supports it. And three separate surfaces link to `?filter=at_risk` (`app/api/cron/lead-idle-check/route.ts:315`, `app/api/crm/dashboard/ai-insights/route.ts:128`, `components/crm/dashboard/dashboard-deals-at-risk.tsx:128`) but `pipeline-client.tsx` never reads a `filter` param — every one of those links dead-ends on an unfiltered 881-card board.

- [ ] **Step 1: Add the missing source option**

`components/crm/pipeline/pipeline-filter-bar.tsx:39`:

```ts
const SOURCE_VALUES = ['phone_call', 'whatsapp', 'website', 'referral', 'manual', 'ad', 'social'] as const;
```

Add to `messages/ar/crm.json` under `crm.pipeline.filterBar.sources`: `"phone_call": "مكالمة هاتفية"`, and to `messages/en/crm.json`: `"phone_call": "Phone call"`. **Keyed objects only — never a JSON array in a catalog** (arrays poison next-intl type inference).

- [ ] **Step 2: Make `?filter=at_risk` actually filter**

Read `app/dashboard/crm/pipeline/pipeline-client.tsx` around lines 140-160 to see exactly how the existing filters are applied (server query param vs client-side predicate) and follow that same mechanism — do NOT invent a second filtering path.

Definition of at-risk must match the existing one so the count the user clicked equals the count they land on: `deals-at-risk` uses `most_recent = greatest(last_contact_at, latest pyra_lead_activities.created_at)` older than its `days_threshold`. Read `app/api/crm/dashboard/deals-at-risk/route.ts` and reuse its threshold constant/default rather than hardcoding a new number. If the pipeline's lead rows do not carry the latest-activity timestamp, use `last_contact_at` alone and **state that approximation in the code comment and in your report** — with Task 2's backfill done, `last_contact_at` is finally trustworthy.

Also surface it: when `filter=at_risk` is active, the filter bar should show a removable chip (the bar already renders chips for the other filters — follow that pattern) so the user can tell why they are seeing a subset and can clear it.

- [ ] **Step 3: Verify both**

Run: `pnpm run check` → 0 errors. `pnpm i18n:check` → passes. `pnpm build` → success.
Then verify by reading the rendered behaviour, not by assumption: state in the report which file:line applies the at_risk predicate and which chip renders it.

- [ ] **Step 4: Commit**

```bash
git add components/crm/pipeline/pipeline-filter-bar.tsx app/dashboard/crm/pipeline/pipeline-client.tsx messages/ar/crm.json messages/en/crm.json
git commit -m "fix(crm): phone_call source filter + make ?filter=at_risk actually filter"
git push origin HEAD:integrate-pending-fixes
```

---

### Task 6: Closure — verify the whole chain, document, hand over

**Files:**
- Modify: `docs/CALL-TRACKING.md` (a short "known-good behaviour" note on the 0-second rule)
- Modify: `.superpowers/sdd/progress.md`
- Modify (outside the repo): `C:\Users\engmo\.claude\projects\C--xampp-htdocs-pyra-workspace-3\memory\calls-system-audit-2026-07-24.md` — mark what is now fixed

- [ ] **Step 1: End-to-end verification of the corrected chain**

Run and paste each:

```bash
pnpm db:query "SELECT count(*) AS fake_activities_remaining FROM pyra_lead_activities WHERE activity_type = 'call_logged' AND (metadata->>'duration_seconds')::int = 0"
```

```bash
pnpm db:query "SELECT count(*) AS idle_warnings_last_24h FROM pyra_lead_activities WHERE activity_type = 'idle_warning' AND created_at > now() - interval '24 hours'"
```

```bash
pnpm db:query "SELECT metadata->>'job' AS job, count(*) AS failures FROM pyra_error_logs WHERE metadata->>'source' = 'cron' AND created_at > now() - interval '24 hours' GROUP BY 1"
```

Expected: 0 fake activities; a non-zero idle-warning count (the backlog flood, if Task 3 Step 5 ran); zero new lead-idle-check failures.

- [ ] **Step 2: Documentation**

`docs/CALL-TRACKING.md`: add a short subsection under the sync contract stating that a call with `duration_seconds = 0` is stored in `pyra_agent_calls` (it is a real dial and the calls report counts it) but does NOT create a timeline activity and does NOT bump `last_contact_at` — with the one-line reason. Note the daily `error-digest` cron alongside the other jobs.

- [ ] **Step 3: Ledger + memory**

Append the wave's entry to `.superpowers/sdd/progress.md` (one line per task, with commit SHAs). Update the audit memory file: mark bugs 1/2/4 and the filter items as FIXED with today's date, and leave the still-open items (backups pending Abdou's Coolify check, the 4 unwired crons, WhatsApp auto-assign, the app-side items) clearly still open.

- [ ] **Step 4: Commit**

```bash
git add docs/CALL-TRACKING.md .superpowers/sdd/progress.md
git commit -m "docs(calls): 0-second contact rule + error digest + urgent-fix wave record"
git push origin HEAD:integrate-pending-fixes
```

---

## Self-Review Notes

- **Coverage:** the chosen bundle was «الأعطال 1+2+4 + الفلتر المكسور». T1+T2 = bug 2 (with the full-cleanup decision), T3 = bug 1, T4 = bug 4, T5 = the filter item. T6 closes.
- **Out of scope by the owner's choice** (do NOT drift into these): wiring the OTHER four crons in n8n, the backup work (blocked on Abdou's 10-minute Coolify check + the connection string), WhatsApp auto-assignment, answer-rate/avg-duration report fixes, and every Android-side item. The `?filter=at_risk` fix is in scope; the broader "force a decision on stale leads" escalation is not.
- **Type consistency:** `isConnectedCall` (T1) is the single predicate; T2's backfill SQL encodes the same rule (`direction <> 'missed' AND duration_seconds > 0`); `chunk` (T3) is created only if absent.
- **Ordering is load-bearing** and stated twice on purpose: T1 → T2 → T3. Re-enabling the cron before the data is clean silently skips the leads that most need warning.
- **Known one-off consequence, not a bug:** the first successful `lead-idle-check` run dumps a large batch of backlogged `idle_warning` rows plus one grouped notification per agent. Expected; say so rather than treating it as a regression.
