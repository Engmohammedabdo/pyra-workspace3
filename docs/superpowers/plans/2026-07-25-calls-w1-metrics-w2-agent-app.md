# Calls Wave 1 (honest metrics) + Wave 2 (agent-facing app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (W1) Make the calls report tell the truth — an unanswered dial must stop dragging the average conversation length down, and surface the answer rate, which is computed nowhere today. (W2) Give the sales agent something back on the phone: name the caller after a matched call, show them who to call today, and let them log the outcome without opening a laptop.

**Architecture:** W1 is server + CRM only, no app release — one pure-function change in `lib/calls/report.ts` plus two new stat tiles. W2 adds two device-authenticated mobile endpoints (a read-only "my day" feed and an outcome writer), then consumes them from the Android app in ONE release (v1.4.0 / versionCode 5) so the fleet is touched once.

**Tech Stack:** Next.js 15 App Router route handlers · Supabase (service role) · Vitest for pure logic · Kotlin/Compose + WorkManager (minSdk 26, targetSdk 34) · next-intl catalogs.

## Global Constraints

- Package manager is **pnpm** (never npm). Server verify: `pnpm run check` then `pnpm build`. Tests: `pnpm test`. App verify from `pyra-calls-app\` **in PowerShell** (NOT `cmd.exe /c` from bash — it silently no-ops on this machine): `.\gradlew.bat test` then `.\gradlew.bat assembleDebug`.
- **`pnpm test` currently has ONE pre-existing failure** — `__tests__/atomic-task-write-routes.test.ts` ("passes every RPC parameter with the exact migration name and order"). It belongs to the owner's separate Codex "deductions" wave, NOT this work. Confirm you add no NEW failure; do not try to fix it.
- Git: commit per task on branch `integrate-pending-fixes`; push with `git push origin HEAD:integrate-pending-fixes`. **NEVER push to `origin/main`** — that deploys production and happens only on Abdou's explicit «ادمج». **NEVER `git add -A`** — other sessions leave unrelated dirty files in this tree; stage exact paths only.
- **Do NOT run `pnpm app:publish`** and do NOT build a release APK. Publishing v1.4 to the fleet is the owner's call at merge time.
- DB access: `pnpm db:query "<sql>"` (read). Any SQL containing non-ASCII MUST go through a UTF-8 `.sql` file. **NEVER put a `%` LIKE pattern in an inline `db:query`** — cmd.exe expands `%VAR%` and the query silently returns plausible WRONG results.
- **Never guess column names.** `SELECT column_name FROM information_schema.columns WHERE table_name = 'pyra_X' ORDER BY ordinal_position` first.
- Supabase JS builders are lazy and resolve with `{ error }` (they do NOT throw). Every query awaited AND its `error` inspected. `const q = supabase…; q.eq(…)` silently discards the filter — always `let q = …; q = q.eq(…)`.
- Route handlers: gate first, THEN `createServiceRoleClient()`. Responses via `apiSuccess()`/`apiError()`/`apiServerError()`. `logError()` in every catch.
- Notifications only via `notify()`/`notifyMany()`/`notifyBatch()` from `lib/notifications/notify.ts`; new types must be added to the `NotificationType` union.
- i18n: catalogs are keyed objects — **never a JSON array** (arrays break next-intl type inference). Every new user-visible string goes in `messages/{ar,en}/<ns>.json`; `pnpm i18n:check` must pass. Android strings go in `res/values/strings.xml` — no Kotlin literals.
- Dubai-day comparisons use `dubaiDayKey()` from `lib/utils/format.ts`; `.toISOString().slice(0,10)` is a regression smell.
- Keep files <300 lines; split into focused components rather than growing one.
- SDD ledger: append one line per task to `.superpowers/sdd/progress.md` (committed).

## Verified ground truth (measured 2026-07-25 — build on this, do not re-derive)

**`lib/calls/report.ts`** — `computeCallsReport(rows, todayKey)` builds `AgentCallStats` with fields: `today, month, outgoing, incoming, missed, matched, unmatched, ignored, total_duration_seconds, avg_duration_seconds`. It already excludes `missed` from `total_duration_seconds`, but the average divides by `outgoing + incoming`, which still includes **289 zero-second unanswered outgoing dials**. Live effect: the card shows **47 s** where the true answered-only average is **73 s** (−36%). **Answer rate is computed nowhere in the codebase** (grep for `answer_rate`/`connect_rate`/`answered` returns nothing); the true current-month value is **64.0%** (514 answered of 803 non-missed).

**`components/crm/calls/CallsSummaryCards.tsx`** — renders a 5-column grid of `<Stat>` tiles per agent and exports `formatCallDuration(seconds)` (m:ss), which `CallsTable` also imports. i18n namespace `calls` already has `today, month, outgoing, incoming, missed, matched, unmatched, ignored, avgDuration, totalDuration` in both `messages/ar/calls.json` and `messages/en/calls.json`.

**Android app** — current version `versionCode = 4`, `versionName = "1.3.0"` in `pyra-calls-app/app/build.gradle.kts`. File sizes: `HomeScreen.kt` 157, `QuickAddActivity.kt` 166, `UpdateActivity.kt` 251, `SyncWorker.kt` 108, `ApiClient.kt` 124 lines.

**The discarded data** — `SyncWorker.kt` receives `res.data.results` where each `SyncResult` carries `device_call_key, status, lead_id, lead_name`, and uses ONLY `status == "unmatched"` to fire `Notifier.showUnmatched(...)`. **`lead_id` and `lead_name` on a `matched` result are read and thrown away.** `Notifier.showFeedback(context, leadName, leadUrl)` already exists with exactly the shape needed (title/body/deep-link/autoCancel) — copy its pattern, don't invent one.

**`HomeScreen.kt`** — its `countSince()` queries `CallLog.Calls.CONTENT_URI` **locally**; the Home screen fetches nothing from the CRM today.

**Follow-ups** — table `pyra_sales_follow_ups` columns: `id, lead_id, assigned_to, due_at, title, notes, status, completed_at, created_by, created_at, quote_id, reminder_at, whatsapp_reminder_sent, send_whatsapp_reminder`. `GET /api/crm/follow-ups` gates on `follow_ups.view`, scopes non-admins with `.eq('assigned_to', auth.pyraUser.username)`, and treats `status=pending` as `IN ('pending','overdue')`. **Live state after the 2026-07-25 catch-up: 145 overdue, 25 pending, 42 completed** (youssef holds 127 of the overdue; cosette has **zero follow-ups of any status, ever**).

**`pyra_lead_activities.activity_type` values in use** (use an existing one; do not invent): `idle_warning, lead_created, stage_change, call_logged, note, follow_up_created, transfer, follow_up_completed, meeting_scheduled, email_sent, field_updated, closed_won_pending, assignment_changed, closed_won_approved, closed_won_rejected`.

**Device auth carries NO RBAC user scope.** `requireDeviceAuth` (`app/api/mobile/_lib/device-auth.ts`) returns `{ agentUsername, displayName }` after verifying the key's creator is `status='active'`. Any mobile endpoint that reads or writes lead-scoped data MUST re-check ownership itself against `agentUsername` — there is no `canAccessLead` equivalent applied for free.

---

# WAVE 1 — honest call metrics (server + CRM only, no app release)

### Task W1-1: Answer rate + answered-only average (pure logic, TDD)

**Files:**
- Modify: `lib/calls/report.ts`
- Modify: `__tests__/calls-report.test.ts`

**Interfaces:**
- Produces: `AgentCallStats` gains two fields — `answered: number` (calls with `direction !== 'missed' && duration_seconds > 0`) and `answer_rate: number` (0–100, rounded to 1 decimal, `0` when there are no non-missed calls). `avg_duration_seconds` changes meaning: it now divides by `answered`, not by `outgoing + incoming`.

**Why:** the displayed average is 36% below reality because unanswered dials sit in the denominator, and the fairest cross-agent metric doesn't exist. Consumers of the new fields land in W1-2.

- [ ] **Step 1: Read the existing test file first**

Read `__tests__/calls-report.test.ts` in full and match its fixture style (how it builds `AgentCall` rows, how it names cases). Do not restructure it.

- [ ] **Step 2: Write the failing tests**

Append to `__tests__/calls-report.test.ts`, using that file's existing row-builder helper (adapt the field names to whatever it already uses):

```ts
describe('computeCallsReport — answered vs dialled', () => {
  it('excludes 0-second dials from the average but keeps them in the call count', () => {
    const rows = [
      row({ agent: 'a', direction: 'outgoing', duration_seconds: 100 }),
      row({ agent: 'a', direction: 'outgoing', duration_seconds: 0 }),
      row({ agent: 'a', direction: 'outgoing', duration_seconds: 0 }),
    ];
    const { per_agent } = computeCallsReport(rows, '2026-07-25');
    expect(per_agent.a.outgoing).toBe(3);          // all three were dialled
    expect(per_agent.a.answered).toBe(1);          // one was picked up
    expect(per_agent.a.avg_duration_seconds).toBe(100); // NOT 33
  });

  it('computes answer rate over non-missed calls only', () => {
    const rows = [
      row({ agent: 'a', direction: 'outgoing', duration_seconds: 60 }),
      row({ agent: 'a', direction: 'outgoing', duration_seconds: 0 }),
      row({ agent: 'a', direction: 'incoming', duration_seconds: 30 }),
      row({ agent: 'a', direction: 'missed', duration_seconds: 0 }),
    ];
    const { per_agent } = computeCallsReport(rows, '2026-07-25');
    // 2 answered of 3 non-missed = 66.7 (the missed call is not a failed attempt by the agent)
    expect(per_agent.a.answered).toBe(2);
    expect(per_agent.a.answer_rate).toBe(66.7);
  });

  it('reports 0 answer rate and 0 average when nobody ever picked up', () => {
    const rows = [
      row({ agent: 'a', direction: 'outgoing', duration_seconds: 0 }),
      row({ agent: 'a', direction: 'outgoing', duration_seconds: 0 }),
    ];
    const { per_agent } = computeCallsReport(rows, '2026-07-25');
    expect(per_agent.a.answered).toBe(0);
    expect(per_agent.a.answer_rate).toBe(0);
    expect(per_agent.a.avg_duration_seconds).toBe(0);
  });

  it('reports 0 answer rate for an agent whose only calls are missed inbound', () => {
    const rows = [row({ agent: 'a', direction: 'missed', duration_seconds: 0 })];
    const { per_agent } = computeCallsReport(rows, '2026-07-25');
    expect(per_agent.a.missed).toBe(1);
    expect(per_agent.a.answer_rate).toBe(0); // no division by zero
  });
});
```

- [ ] **Step 3: Run and confirm RED**

Run: `pnpm test calls-report`
Expected: FAIL — `answered` / `answer_rate` are undefined on `AgentCallStats`.

- [ ] **Step 4: Implement**

In `lib/calls/report.ts`: add `answered: number` and `answer_rate: number` to the `AgentCallStats` interface and to `empty()` (both initialised `0`). In the row loop, replace the duration accumulation with a single answered-aware branch:

```ts
    // A dialled-but-unanswered call is a real attempt (it stays in `outgoing`)
    // but it is NOT a conversation: counting its 0 seconds in the average
    // dragged the displayed figure 36% below reality (47s shown vs 73s real,
    // measured 2026-07-25). `answered` is the honest denominator.
    if (r.direction !== 'missed' && r.duration_seconds > 0) {
      s.answered += 1;
      s.total_duration_seconds += r.duration_seconds;
    }
```

And in the per-agent finalisation loop:

```ts
  for (const s of Object.values(per_agent)) {
    s.avg_duration_seconds = s.answered > 0
      ? Math.round(s.total_duration_seconds / s.answered)
      : 0;
    // Denominator is non-missed calls: a missed INBOUND call is not an attempt
    // the agent failed at, so it must not count against their answer rate.
    const attempts = s.outgoing + s.incoming;
    s.answer_rate = attempts > 0
      ? Math.round((s.answered / attempts) * 1000) / 10
      : 0;
  }
```

Keep the existing `if (r.direction !== 'missed') s.total_duration_seconds += …` line deleted, not duplicated.

- [ ] **Step 5: Run and confirm GREEN**

Run: `pnpm test calls-report` → all pass, including the pre-existing cases (if an old case asserted an average that included 0-second dials, its expectation is now wrong **and the new behaviour is correct** — update that expectation and say so in your report; do not weaken the new tests to fit it).
Run: `pnpm run check` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/calls/report.ts __tests__/calls-report.test.ts
git commit -m "feat(calls): answered-only average + answer rate in the report aggregation"
```

---

### Task W1-2: Surface both numbers in the CRM

**Files:**
- Modify: `hooks/useCallsReport.ts` (the `CallsReportAgent` type)
- Modify: `components/crm/calls/CallsSummaryCards.tsx`
- Modify: `messages/ar/calls.json`, `messages/en/calls.json`
- Check (may need no change): `app/api/crm/calls/report/route.ts`

**Interfaces:**
- Consumes: `answered` + `answer_rate` from W1-1.
- Produces: two new `<Stat>` tiles per agent card.

- [ ] **Step 1: Confirm the API passes the new fields through**

Read `app/api/crm/calls/report/route.ts`. If it spreads the `AgentCallStats` object wholesale, no change is needed — say so. If it hand-picks fields into the response, add `answered` and `answer_rate`. Do not assume; state which case you found.

- [ ] **Step 2: Extend the client type**

In `hooks/useCallsReport.ts`, add `answered: number;` and `answer_rate: number;` to the `CallsReportAgent` interface, matching the file's existing field style.

- [ ] **Step 3: Add the tiles**

In `CallsSummaryCards.tsx`, import two more lucide icons that are not already used in that file (`PhoneCall` and `Percent` are both unused there — verify before importing) and add two tiles inside the existing grid, placed immediately after the `missed` tile so the call-outcome group reads together:

```tsx
        <Stat icon={PhoneCall} label={t('answered')} value={agent.answered} />
        <Stat icon={Percent} label={t('answerRate')} value={`${agent.answer_rate}%`} />
```

The grid is `grid-cols-2 sm:grid-cols-5` with 10 tiles today; 12 tiles still divides evenly by 2 and by 5+ rows — leave the grid classes unchanged unless the layout visibly breaks, and say which you did.

- [ ] **Step 4: i18n**

Add to `crm`-style keyed objects in BOTH catalogs under the `calls` namespace:
- `messages/ar/calls.json`: `"answered": "تم الرد"`, `"answerRate": "نسبة الرد"`
- `messages/en/calls.json`: `"answered": "Answered"`, `"answerRate": "Answer rate"`

- [ ] **Step 5: Verify**

Run: `pnpm run check` → 0 errors. `pnpm i18n:check` → clean. `pnpm build` → success. `pnpm test` → no NEW failure.

Then verify the numbers are real, not just rendered — run this and paste the output, confirming the API's `avg_duration_seconds` now matches the answered-only figure:

```bash
pnpm db:query "SELECT agent_username, count(*) FILTER (WHERE direction <> 'missed') AS attempts, count(*) FILTER (WHERE direction <> 'missed' AND duration_seconds > 0) AS answered, round(avg(duration_seconds) FILTER (WHERE direction <> 'missed' AND duration_seconds > 0)) AS true_avg FROM pyra_agent_calls WHERE called_at >= date_trunc('month', now()) GROUP BY 1"
```

- [ ] **Step 6: Commit**

```bash
git add hooks/useCallsReport.ts components/crm/calls/CallsSummaryCards.tsx messages/ar/calls.json messages/en/calls.json app/api/crm/calls/report/route.ts
git commit -m "feat(crm): show answered count + answer rate on the calls report"
git push origin HEAD:integrate-pending-fixes
```

---

# WAVE 2 — the agent-facing app (v1.4.0, one fleet release)

### Task W2-1: `GET /api/mobile/my-day` — the feed the phone will show

**Files:**
- Create: `app/api/mobile/my-day/route.ts`
- Modify: `docs/CALL-TRACKING.md` (API contract section)

**Interfaces:**
- Consumes: `requireDeviceAuth` → `{ agentUsername, displayName }`.
- Produces: `apiSuccess({ follow_ups: FollowUpItem[], going_cold: ColdLeadItem[], counts: { follow_ups: number, going_cold: number } })` where
  - `FollowUpItem = { id, lead_id, lead_name, phone, title, due_at, status }` — status is `'overdue' | 'pending'`
  - `ColdLeadItem = { lead_id, lead_name, phone, company, days_since_contact }`

**Scope rules (all enforced server-side — device auth carries no RBAC):**
- Follow-ups: `assigned_to = agentUsername` AND `status IN ('pending','overdue')` AND `due_at <= now() + interval '1 day'`, ordered `due_at ASC`, **limit 20**.
- Going cold: leads where `assigned_to = agentUsername` AND `archived_at IS NULL` AND `is_converted IS NOT TRUE` (NULL-safe — `.eq(false)` drops legacy NULL rows) AND `greatest(last_contact_at, created_at) < now() - interval '7 days'`, ordered oldest-contact first, **limit 20**. Exclude any lead that already appears in `follow_ups` (it is already actionable there).
- Both lists resolve lead name/phone with a batched second query (`.in('id', leadIds)`), not an N+1 loop.

- [ ] **Step 1: Confirm the schema before writing any query**

Run and paste:
```bash
pnpm db:query "SELECT column_name FROM information_schema.columns WHERE table_name = 'pyra_sales_leads' ORDER BY ordinal_position"
```
Confirm the exact names of `archived_at`, `is_converted`, `last_contact_at`, `assigned_to`, `name`, `phone`, `company`. If any differs from this plan, follow the DB and note it.

- [ ] **Step 2: Write the route**

Follow `app/api/mobile/ping/route.ts` for the auth block shape and `app/api/mobile/leads/route.ts` for the batched-enrichment style. Gate first, then service role. Every query's `{ error }` checked → `logError` + `apiServerError()`. Use `dubaiDayKey`/explicit `+04:00` bounds only if you need a day boundary; the windows above are relative (`now() - interval`) and need no day math.

Cap both lists at 20 and return the true counts alongside, so the phone can say "20 من 34" without a second call.

- [ ] **Step 3: Verify against production data**

`pnpm run check` → 0 errors. Then prove the shape with the real fleet key (the PyraCRM_Cron key will NOT work — this is a device-authed route; use youssef's or cosette's device key ONLY if you can obtain it without inventing one; if you cannot, say so and verify by SQL instead):

```bash
pnpm db:query "SELECT assigned_to, count(*) FROM pyra_sales_follow_ups WHERE status IN ('pending','overdue') AND due_at <= now() + interval '1 day' GROUP BY 1"
```
Expected today: youssef ~127+, cosette 0. State what you measured — cosette having an EMPTY follow-up list is expected and is exactly why the going-cold half of the feed matters for her.

- [ ] **Step 4: Docs + commit**

Add the endpoint to `docs/CALL-TRACKING.md` (auth = device key, response shape, the 20-row caps, the scope rules).

```bash
git add app/api/mobile/my-day/route.ts docs/CALL-TRACKING.md
git commit -m "feat(mobile): my-day feed - today's follow-ups + going-cold leads, agent-scoped"
```

---

### Task W2-2: `POST /api/mobile/call-outcome` — log the result from the phone

**Files:**
- Create: `app/api/mobile/call-outcome/route.ts`
- Modify: `docs/CALL-TRACKING.md`

**Interfaces:**
- Consumes: `requireDeviceAuth`; `notify` is NOT used here (the agent is acting on their own lead — no one to notify).
- Produces: `POST` body `{ lead_id: string, outcome: 'interested'|'not_interested'|'call_again', note?: string, next_follow_up_at?: string }` → `apiSuccess({ activity_id, follow_up_id })` (`follow_up_id` null when no follow-up was requested).

**Rules:**
- **Ownership re-check is mandatory**: load the lead and reject with 403 unless `lead.assigned_to === agentUsername`. Device auth gives you an agent, not a scope.
- Writes ONE `pyra_lead_activities` row with `activity_type = 'note'` (an existing value — do NOT invent a new type; the timeline renderer only knows the 15 listed in the ground-truth section), `description` = the note text or a default derived from the outcome, and `metadata = { source: 'mobile_call_outcome', outcome, auto: false }`.
- Bumps `pyra_sales_leads.last_contact_at` to now — this is a genuine human touch, unlike the 0-second-dial bug.
- If `next_follow_up_at` is present: insert a `pyra_sales_follow_ups` row (`assigned_to = agentUsername`, `status = 'pending'`, `created_by = agentUsername`, `lead_id`, `due_at = next_follow_up_at`, a title derived from the outcome) AND a `follow_up_created` activity, matching how `POST /api/crm/follow-ups` does it — read that route and mirror its field set rather than inventing one.
- Also call `logActivity()` (`lib/api/activity.ts`) with `` `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}` `` and `metadata.source = 'mobile_call_outcome'` — the locked action_type convention.
- Validate `outcome` against the 3-value whitelist; 422 on anything else. Cap `note` at 2000 chars.
- Roll back the activity insert if the lead update fails, so a half-write never reports success.

- [ ] **Step 1: Read `POST /api/crm/follow-ups` first**

Read `app/api/crm/follow-ups/route.ts`'s POST handler in full and mirror its follow-up insert field-for-field (including how it computes `reminder_at` and whether it touches `next_follow_up` on the lead). Note in your report anything you deliberately did NOT mirror and why.

- [ ] **Step 2: Write the route** per the rules above.

- [ ] **Step 3: Verify**

`pnpm run check` → 0 errors, `pnpm build` → success. Verify the ownership gate by reading the code path aloud in your report: which line rejects a lead not owned by the caller.

- [ ] **Step 4: Docs + commit**

```bash
git add app/api/mobile/call-outcome/route.ts docs/CALL-TRACKING.md
git commit -m "feat(mobile): call-outcome writer - note + last_contact_at + optional follow-up"
git push origin HEAD:integrate-pending-fixes
```

---

### Task W2-3: App — name the caller after a matched call

**Files:**
- Modify: `pyra-calls-app/.../sync/SyncWorker.kt`
- Modify: `pyra-calls-app/.../notify/Notifier.kt`
- Modify: `pyra-calls-app/app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `SyncResult.lead_id` + `SyncResult.lead_name` — already present in the response and currently discarded.
- Produces: `Notifier.showMatched(context, leadName, leadId)`.

**Why:** the server already sends the lead's name with every matched call and `SyncWorker` throws it away, so 93% of calls produce nothing on the phone. This is the cheapest agent-visible win in the whole wave.

- [ ] **Step 1: Add the notification**

In `Notifier.kt`, add `showMatched(context, leadName, leadId)` modelled on the existing `showFeedback` (same builder shape, `PendingIntent.FLAG_UPDATE_CURRENT or FLAG_IMMUTABLE`, `setAutoCancel(true)`). Deep link: `ACTION_VIEW` to `BuildConfig.BASE_URL + "/dashboard/crm/leads/" + leadId`. Reuse `CHANNEL_FEEDBACK` (it is already the "here is something about a lead" channel) rather than adding a fourth channel — state that choice in your report. Notification id: `leadId.hashCode()` so repeated calls to the same lead replace rather than stack.

Strings (Arabic, in `strings.xml`):
- `notif_matched_title` = `مكالمة مع {0}` → use a `%1$s` placeholder per Android convention
- `notif_matched_body` = `اضغط لفتح كارت العميل`

- [ ] **Step 2: Stop discarding the data**

In `SyncWorker.kt`, extend the existing results loop — keep the `unmatched` branch byte-identical and add a sibling branch:

```kotlin
                        if (r.status == "matched" && r.lead_id != null && r.lead_name != null) {
                            Notifier.showMatched(applicationContext, r.lead_name, r.lead_id)
                        }
```

Do not restructure the loop or touch the cursor logic.

- [ ] **Step 3: Verify**

From `pyra-calls-app\` in PowerShell: `.\gradlew.bat test` (green) and `.\gradlew.bat assembleDebug` (SUCCESS).

- [ ] **Step 4: Commit**

```bash
git add pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/notify/Notifier.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/sync/SyncWorker.kt pyra-calls-app/app/src/main/res/values/strings.xml
git commit -m "feat(app): name the caller after a matched call instead of discarding lead_name"
```

---

### Task W2-4: App — «شغل النهاردة» screen

**Files:**
- Modify: `pyra-calls-app/.../core/Payloads.kt`, `.../data/ApiClient.kt`
- Create: `pyra-calls-app/.../ui/MyDayScreen.kt`
- Modify: `pyra-calls-app/.../ui/HomeScreen.kt`, `.../ui/MainActivity.kt`
- Modify: `res/values/strings.xml`

**Interfaces:**
- Consumes: `GET /api/mobile/my-day` (W2-1).
- Produces: `@Serializable data class MyDayFollowUp(...)`, `MyDayColdLead(...)`, `MyDayData(...)`; `ApiClient.myDay(): ApiResult<MyDayData>`; `@Composable MyDayScreen(...)`.

**Rules:**
- DTO field names must match the W2-1 response EXACTLY. `PyraJson` has `ignoreUnknownKeys = true`, so extra server fields are safe, but a renamed one silently becomes null — cross-check against the route, not against this plan.
- The screen is reached from a button on `HomeScreen`; navigation follows whatever pattern `MainActivity` already uses for screen switching (read it — it is a `when {}` over state, not a nav library). Do NOT add a navigation dependency.
- Each row shows: lead name, the reason it is listed (overdue / due today / N days cold), and a **call button** that fires `Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))` — `ACTION_DIAL`, never `ACTION_CALL` (ACTION_CALL needs the CALL_PHONE permission and places the call without confirmation; the app must not gain that permission).
- Loading / empty / error states are all required. Empty state text must be encouraging, not blank — cosette will see an empty follow-up list on day one by design.
- All strings in `strings.xml`.
- Keep `MyDayScreen.kt` under 300 lines; extract a row composable if needed.

- [ ] **Step 1: DTOs + client method** — mirror the existing `Payloads.kt` style and `ApiClient`'s `get()` helper (note the constructor is `(baseUrl, appVersion = BuildConfig.VERSION_CODE, deviceKeyProvider)` with the provider LAST for trailing-lambda callers).
- [ ] **Step 2: `MyDayScreen`** with the three states + the two sections + dial buttons.
- [ ] **Step 3: Entry point** — a button on `HomeScreen` and the branch in `MainActivity`.
- [ ] **Step 4: Verify** — `.\gradlew.bat test` + `.\gradlew.bat assembleDebug`, both green.
- [ ] **Step 5: Commit**

```bash
git add pyra-calls-app/app/src/main
git commit -m "feat(app): my-day screen - today's follow-ups and going-cold leads with dial buttons"
```

---

### Task W2-5: App — post-call outcome capture + v1.4.0 bump

**Files:**
- Create: `pyra-calls-app/.../ui/CallOutcomeActivity.kt`
- Modify: `.../core/Payloads.kt`, `.../data/ApiClient.kt`, `.../notify/Notifier.kt`, `AndroidManifest.xml`, `res/values/strings.xml`, `app/build.gradle.kts`

**Interfaces:**
- Consumes: `POST /api/mobile/call-outcome` (W2-2).
- Produces: `CallOutcomeRequest`/`CallOutcomeData` DTOs; `ApiClient.callOutcome(req)`; `CallOutcomeActivity` launched from the matched-call notification with extras `lead_id` + `lead_name`.

**Rules:**
- Extend `Notifier.showMatched` (from W2-3) so its content intent opens `CallOutcomeActivity` instead of the web deep link, and add a secondary action that still opens the lead in the browser. State the final action layout in your report.
- The Activity is a single Compose screen following `QuickAddActivity.kt`'s structure (166 lines — read it; same RTL wrapper, same submit/error handling): three outcome buttons, an optional note field, an optional "call again on…" date choice, submit.
- Date choice: offer relative presets (tomorrow / in 3 days / next week) computed with the existing `DubaiTime` helper rather than a date-picker dialog — fewer taps, and it keeps the Activity small. Say so in your report.
- On success: toast + `finish()` + cancel the originating notification.
- **Version bump: `versionCode = 5`, `versionName = "1.4.0"`** (currently 4 / "1.3.0").

- [ ] **Step 1: DTOs + client method.**
- [ ] **Step 2: `CallOutcomeActivity`** + manifest registration (`android:exported="false"`).
- [ ] **Step 3: Wire the notification** to open it.
- [ ] **Step 4: Version bump.**
- [ ] **Step 5: Verify** — `.\gradlew.bat test` + `.\gradlew.bat assembleDebug`, both green. Confirm with aapt2 that the debug APK reports versionCode 5 / 1.4.0.
- [ ] **Step 6: Commit**

```bash
git add pyra-calls-app
git commit -m "feat(app): post-call outcome capture + v1.4.0 bump"
git push origin HEAD:integrate-pending-fixes
```

---

### Task W2-6: E2E on the emulator + closure

**Files:** `docs/CALL-TRACKING.md`, `.superpowers/sdd/progress.md`, and the memory file `C:\Users\engmo\.claude\projects\C--xampp-htdocs-pyra-workspace-3\memory\call-tracking-project.md`

**Prereqs:** local dev server (`pnpm dev`; debug builds point at `http://10.0.2.2:3000`) + the emulator (`%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -list-avds`, adb at `…\platform-tools\adb.exe`). Debug builds use release channel `pyra-calls-e2e`, so nothing here can reach the real fleet.

**Test-account rule:** `sayed` is inactive AND GoTrue-banned — it cannot log in. A disposable agent `e2e.upgrade` exists (inactive + banned) and is the one to reactivate for device E2E. **Never log in as youssef or cosette** — the login route deactivates their live device key and would take a real phone offline.

- [ ] **Step 1: Matched-call notification** — sync a call from a number that matches a lead; confirm the notification names the lead and opens the outcome screen. Screenshot.
- [ ] **Step 2: My-day screen** — confirm both sections render, the counts match a `db:query` of the same scope, and a dial button opens the dialer pre-filled (it must NOT place the call). Screenshot.
- [ ] **Step 3: Outcome round-trip** — submit each of the three outcomes; after each, verify by SQL that exactly one `note` activity landed with `metadata.source = 'mobile_call_outcome'`, that `last_contact_at` moved, and (for the follow-up case) that one `pyra_sales_follow_ups` row was created with the right `assigned_to`/`due_at`. Paste the queries.
- [ ] **Step 4: Ownership gate** — attempt an outcome POST for a lead owned by a DIFFERENT agent and confirm 403. This is the security-critical check; do not skip it.
- [ ] **Step 5: Cleanup** — remove every row the test created (list them), reset the disposable account to inactive + banned, uninstall from the emulator. Verify zero leftovers.
- [ ] **Step 6: Docs, ledger, memory** — document the two endpoints and the v1.4 app surfaces; append the wave to the ledger; update the memory file (v1.4 built, **awaiting owner's «ادمج» + `pnpm app:publish`** — do NOT publish).
- [ ] **Step 7: Commit**

```bash
git add docs/CALL-TRACKING.md .superpowers/sdd/progress.md
git commit -m "docs(calls): W1 metrics + W2 agent app surfaces + E2E record"
git push origin HEAD:integrate-pending-fixes
```

---

## Self-Review Notes

- **Coverage:** W1 = the two report numbers (W1-1 logic + W1-2 surface). W2 = caller identity (W2-3), my-day (W2-1 server + W2-4 app), outcome capture (W2-2 server + W2-5 app), verified in W2-6. Both app features ship in ONE release (v1.4.0 / versionCode 5) so the fleet is touched once.
- **Ordering:** W1 is independent and can ship alone. Within W2, the server tasks (W2-1, W2-2) must precede their app consumers (W2-4, W2-5); W2-3 is independent of both and is the cheapest, so it can run in parallel with the server tasks.
- **Type consistency:** `answered`/`answer_rate` are named identically in `lib/calls/report.ts`, the API response, `CallsReportAgent`, and the i18n keys `answered`/`answerRate`. The mobile DTOs must be cross-checked against the actual route responses, not against this document.
- **Out of scope — do not drift:** WhatsApp auto-assignment, the source-engagement report, the agent scorecard, the stale-lead escalation, database backups, and the server's flat-50% CPU. All are documented elsewhere and were not chosen for this wave.
- **Deliberate non-goals:** no new notification channel (reuse `CHANNEL_FEEDBACK`), no navigation library, no `CALL_PHONE` permission, no new `activity_type` value, no date-picker dialog.
