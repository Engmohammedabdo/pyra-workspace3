# Call Attempts Visibility + Update Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Stop a new lead created from an unanswered dial being stamped as already-contacted, and clean the 41 leads it already mis-stamped. (B) Show the agent their unanswered attempts on the lead timeline WITHOUT letting an attempt count as contact anywhere. (C) Make an available app update impossible to miss — an in-app banner plus a stronger notification — and give the owner a per-release switch that turns a release into a blocking, must-update one, while background call syncing never stops.

**Architecture:** A and B are server + CRM only (no app release). C spans a migration, the release endpoints, the publish script, and the app — shipping as app **v1.5.0 / versionCode 6**.

**Tech Stack:** Next.js 15 App Router route handlers · Supabase (service role) · Vitest for pure logic · next-intl catalogs · Kotlin/Compose + WorkManager (minSdk 26, targetSdk 34).

## Global Constraints

- Package manager is **pnpm** (never npm). Server verify: `pnpm run check` then `pnpm build`. Tests: `pnpm test`. App verify from `pyra-calls-app\` **in PowerShell** (NOT `cmd.exe /c` from bash — it silently no-ops on this machine): `.\gradlew.bat test` then `.\gradlew.bat assembleDebug`.
- **`pnpm test` has ONE pre-existing failure** — `__tests__/atomic-task-write-routes.test.ts` — from a separate wave. Confirm you add no NEW failure; do not fix it.
- Git: commit per task on branch `integrate-pending-fixes`; push `git push origin HEAD:integrate-pending-fixes`. **NEVER push to `origin/main`** — that deploys production and happens only on the owner's explicit «ادمج». **NEVER `git add -A`** — stage exact paths only.
- **Do NOT run `pnpm app:publish`** and do NOT build a release APK. Publishing is the owner's call at merge time.
- Migrations: UTF-8 `.sql` file via `pnpm db:query supabase/migrations/<file>.sql` → verify with `information_schema` → `pnpm db:record`. **Check the next free migration number first** (`ls supabase/migrations/`) — 038 was taken by a concurrent session once already. New tables get `REVOKE ALL PRIVILEGES … FROM anon, authenticated;`.
- **NEVER put a `%` LIKE pattern in an inline `db:query`** — cmd.exe expands `%VAR%` and returns silently WRONG results. **Never guess column names** — `information_schema` first.
- Supabase JS builders are lazy and resolve with `{ error }` (they do NOT throw). Every query awaited AND its `error` inspected. `const q = …; q.eq(…)` silently discards the filter — always `let q = …; q = q.eq(…)`.
- Route handlers: gate first, THEN `createServiceRoleClient()`. `apiSuccess()`/`apiError()`/`apiServerError()`. `logError()` in every catch.
- i18n: keyed objects only, **never a JSON array** (arrays break next-intl type inference). Every user-visible string in `messages/{ar,en}/<ns>.json`; `pnpm i18n:check` must pass. Android strings in `res/values/strings.xml` — no Kotlin literals.
- Keep files <300 lines.
- SDD ledger: append one line per task to `.superpowers/sdd/progress.md`.

## Verified ground truth (measured 2026-07-29 — build on this)

**The A bug.** `app/api/mobile/leads/route.ts:160` sets `last_contact_at: call.called_at` on the newly created lead **unconditionally** — the earlier `isConnectedCall` fix covered the sync path and the retro-link activity gate but missed this line. Measured: **41 leads created since 2026-07-25 carry a `last_contact_at` that came from a 0-second dial**, including `sl_GHa_kRd2m4BsBbcY` (hamza), `sl_lPzPGl64pPEiNkJ4` (lisha), `sl_nOG8k9Hi1Me4HZPf` (miramar real estate). These are brand-new leads — the ones that most need following up — and the system currently reads them as freshly contacted.

**The B constraint — the important one.** Three consumers compute "last touched" as `greatest(last_contact_at, latest pyra_lead_activities.created_at)` with **no `activity_type` filter**: `app/api/cron/lead-idle-check/route.ts:157`, `app/api/crm/dashboard/deals-at-risk/route.ts:63`, `app/api/crm/dashboard/ai-insights/route.ts:117`. So **writing ANY activity row for an unanswered attempt would silently re-create the exact bug we just spent a wave removing** — the lead would look touched. Every one of those three must exclude the new type.

**The renderer.** `components/crm/activity/activity-item.tsx` maps `activity_type` → icon/tone in a lookup (line ~48 for `call_logged`) and resolves titles in a `switch` (line ~144 for `call_logged`, which reads `metadata.duration_seconds`/`direction` and picks among `titles.callInbound|callOutbound|…`). A type absent from the map falls back to a generic icon + the default label — so a new type renders, just badly, until added.

**Activity types in use** (do not invent beyond the one this plan adds): `idle_warning, lead_created, stage_change, call_logged, note, follow_up_created, transfer, follow_up_completed, meeting_scheduled, email_sent, field_updated, closed_won_pending, assignment_changed, closed_won_approved, closed_won_rejected`.

**The C gap.** Update machinery already exists from v1.2: `UpdatePolicy` (`core/UpdatePolicy.kt`) throttles the version poll to every 6h and re-nags at most every 24h; `Notifier.showUpdate` posts on `CHANNEL_UPDATES` at **`IMPORTANCE_DEFAULT`** (no heads-up popup); Home has a manual «التحقق من تحديث» button. What is missing: **the app never shows anything in its own UI when an update is available**, the channel is not high-priority, and there is no way to require an update. `GET /api/mobile/app-version` returns `{ latest: { version_code, version_name, release_notes } | null }`.

**Fleet state:** youssef and cosette are both on versionCode 5 (v1.4.0); sayed's test device is stale and inactive.

**Owner's decisions (2026-07-29):**
1. Mandatory is **per release** — the owner marks a release mandatory at publish time. A normal release gets a persistent in-app banner + a stronger notification; a mandatory release additionally gets a blocking screen.
2. **Call sync must NEVER stop**, even while the blocking screen is up.

---

# PART A — stop and clean the false "already contacted" stamp

### Task A1: Gate the quick-add stamp + backfill the 41 leads

**Files:**
- Modify: `app/api/mobile/leads/route.ts` (~line 160)
- Create: `scripts/backfill-quickadd-last-contact.ts`

**Interfaces:**
- Consumes: `isConnectedCall` from `lib/calls/match.ts` (already exists; requires `direction !== 'missed' && duration_seconds > 0`).
- Produces: a snapshot-first backfill runner, dry-run by default.

- [ ] **Step 1: Read the route and find every write of `last_contact_at`**

Read `app/api/mobile/leads/route.ts` in full. Line ~160 sets it on insert. Confirm whether any other line in that file also writes it (the retro-link path may). Report what you found.

- [ ] **Step 2: Gate it**

The lead insert must set `last_contact_at` only when the triggering call was actually answered:

```ts
      // A dial nobody answered is not contact. This line previously stamped
      // last_contact_at unconditionally, so a lead created from the
      // unknown-number prompt after two unanswered dials was born looking
      // "freshly contacted" — 41 real leads were mis-stamped this way between
      // 2026-07-25 and 2026-07-29. The sync path was fixed earlier; this is
      // the same rule, at the path the earlier fix missed.
      last_contact_at: isConnectedCall(call) ? call.called_at : null,
```

Import `isConnectedCall` if the file does not already (it does, for the retro-link gate — check).

- [ ] **Step 3: Write the backfill runner**

`scripts/backfill-quickadd-last-contact.ts`, modelled on the existing `scripts/backfill-zero-duration-contact.ts` (read it — same env-file-read pattern, dry-run default, snapshot-before-write, batched writes with `{ error }` checked per batch, `NULL::timestamptz` casting in any VALUES list).

Target set: leads whose `last_contact_at` exactly equals the `called_at` of one of their own 0-second non-missed calls. Recompute exactly as the earlier backfill did: `last_contact_at = MAX(called_at)` over that lead's genuine calls (`direction <> 'missed' AND duration_seconds > 0`), **NULL when none**. Do NOT limit to leads created after 2026-07-25 — use the rule, not the date, so any older stragglers are caught too; report how many the rule matched versus the 41 measured for the recent window.

- [ ] **Step 4: Dry run, then apply**

`npx tsx scripts/backfill-quickadd-last-contact.ts` → paste the summary and confirm nothing mutated. Then `--apply` → paste before/after counts.

- [ ] **Step 5: Spot-check 3 leads**

Include `sl_GHa_kRd2m4BsBbcY` (hamza — has only 0-second calls, so it must end NULL). For each, show `last_contact_at` alongside that lead's calls and confirm the value equals the newest genuine call, or NULL.

- [ ] **Step 6: Verify + commit**

`pnpm run check` → 0 errors. `pnpm build` → success.

```bash
git add app/api/mobile/leads/route.ts scripts/backfill-quickadd-last-contact.ts
git commit -m "fix(mobile): quick-add must not stamp last_contact_at from an unanswered dial"
```

---

# PART B — show the attempt, without letting it count as contact

### Task B1: Write `call_attempt` activities (and keep them out of every contact signal)

**Files:**
- Modify: `app/api/mobile/calls/sync/route.ts`, `app/api/mobile/leads/route.ts` (retro-link)
- Modify: `app/api/cron/lead-idle-check/route.ts`, `app/api/crm/dashboard/deals-at-risk/route.ts`, `app/api/crm/dashboard/ai-insights/route.ts`
- Modify: `docs/CALL-TRACKING.md`

**Interfaces:**
- Produces: a new `pyra_lead_activities.activity_type` value **`call_attempt`**, written for a MATCHED call that was NOT connected (`direction !== 'missed' && duration_seconds === 0`), with `metadata = { direction, duration_seconds: 0, auto: true, source: 'device_sync' | 'device_sync_retro' }`. It must NEVER bump `last_contact_at`.

**Why `call_attempt` and not a flag on `call_logged`:** the three consumers below filter by type, and `.neq('activity_type', 'call_attempt')` is a clean index-friendly filter, whereas a metadata predicate is not. Missed inbound calls stay excluded entirely (they are not the agent's attempt).

- [ ] **Step 1: Exclude the new type from all three "last touched" consumers FIRST**

Do this before writing any rows, so no window exists where attempts suppress idle warnings.

In each of `lead-idle-check/route.ts` (the activities SELECT that feeds `lastActivityByLead` — note it is batched via `chunk()`, add the filter to the batched query), `deals-at-risk/route.ts`, and `ai-insights/route.ts` (both of which were recently batched too), add `.neq('activity_type', 'call_attempt')` to the activity query that computes recency, with a comment:

```ts
      // A call nobody answered is visible on the timeline but is NOT contact —
      // counting it here would suppress the idle warning for a lead the agent
      // has been unable to reach, which is exactly the lead that needs one.
      .neq('activity_type', 'call_attempt')
```

Grep the repo for any OTHER consumer of `pyra_lead_activities` that treats "any activity" as freshness (e.g. a health-score or dossier recency path) and report what you found; add the filter wherever the semantics are "was this lead touched".

- [ ] **Step 2: Write the attempt rows at both call sites**

In `sync/route.ts`, the existing `if (lead && connected)` block writes `call_logged` + bumps `last_contact_at`. Add an `else if (lead && call.direction !== 'missed')` branch that inserts a `call_attempt` activity and **does not** touch `last_contact_at`. Back-fill `activity_id` on the `pyra_agent_calls` row the same way the connected branch does, so the call row still points at its activity.

Mirror the same in `retroLinkCalls` in `leads/route.ts`.

Keep the `missed` direction writing nothing, as today.

- [ ] **Step 3: Verify no regression to the contact path**

Run and paste: a query showing, for the last 7 days, `call_logged` count vs `call_attempt` count vs total matched calls — the three must reconcile (`call_logged` = answered matched, `call_attempt` = 0-second matched outgoing/incoming).

- [ ] **Step 4: Docs + commit**

Document the new type and the "visible but not contact" rule in `docs/CALL-TRACKING.md`.

```bash
git add app/api/mobile/calls/sync/route.ts app/api/mobile/leads/route.ts app/api/cron/lead-idle-check/route.ts app/api/crm/dashboard/deals-at-risk/route.ts app/api/crm/dashboard/ai-insights/route.ts docs/CALL-TRACKING.md
git commit -m "feat(calls): record unanswered dials as call_attempt, excluded from every contact signal"
```

---

### Task B2: Render the attempt distinctly on the timeline

**Files:**
- Modify: `components/crm/activity/activity-item.tsx`
- Modify: `messages/ar/crm.json`, `messages/en/crm.json`

**Interfaces:**
- Consumes: the `call_attempt` type from B1.

- [ ] **Step 1: Add icon + tone**

In the type→icon map (~line 48, where `call_logged` lives), add `call_attempt` using `PhoneMissed` (import it from lucide-react if absent) and a muted/amber tone that visually reads as "tried, didn't connect" — distinct from `call_logged`'s sky tone. Do NOT reuse the sky tone; the whole point is that the agent can tell them apart at a glance.

- [ ] **Step 2: Add the title case**

In the title `switch` (~line 144), add a `case 'call_attempt'` that reads `metadata.direction` the same way `call_logged` does and returns `titles.callAttemptOutbound` / `titles.callAttemptInbound`. No duration is shown — there is none.

- [ ] **Step 3: i18n**

Add to `crm.activity.titles` in BOTH catalogs (keyed objects, never arrays):
- ar: `"callAttemptOutbound": "محاولة اتصال — لم يرد"`, `"callAttemptInbound": "مكالمة واردة لم يُرد عليها"`
- en: `"callAttemptOutbound": "Call attempt — no answer"`, `"callAttemptInbound": "Unanswered incoming call"`

- [ ] **Step 4: Verify + commit**

`pnpm run check` → 0 errors. `pnpm i18n:check` → clean. `pnpm build` → success.
Then confirm against real data: pick a lead that now has both a `call_logged` and a `call_attempt` and state its id, so the owner can open it and see both styles.

```bash
git add components/crm/activity/activity-item.tsx messages/ar/crm.json messages/en/crm.json
git commit -m "feat(crm): render call_attempt distinctly on the lead timeline"
git push origin HEAD:integrate-pending-fixes
```

---

# PART C — an update they cannot miss, and can be required to take

### Task C1: Migration + release endpoints carry a mandatory flag

**Files:**
- Create: `supabase/migrations/0XX_app_release_mandatory.sql` (check the next free number first)
- Modify: `app/api/mobile/app-version/route.ts`
- Modify: `scripts/publish-app-release.ts`
- Modify: `docs/CALL-TRACKING.md`

**Interfaces:**
- Produces: `pyra_app_releases.is_mandatory boolean NOT NULL DEFAULT false`; `GET /api/mobile/app-version` response gains `latest.is_mandatory`; `pnpm app:publish` gains a `--mandatory` flag.

- [ ] **Step 1: Migration**

```sql
-- 0XX_app_release_mandatory.sql
-- Per-release "must update" switch for the Pyra Calls Android app.
-- Plan: docs/superpowers/plans/2026-07-29-call-attempts-and-update-enforcement.md
-- Default false: a release is only blocking when the publisher says so.
ALTER TABLE pyra_app_releases
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT false;
```

Apply, verify with `information_schema`, record with `pnpm db:record`.

- [ ] **Step 2: Return it**

`app/api/mobile/app-version/route.ts`: add `is_mandatory` to the SELECT and to the `latest` object. Additive — a v1.4 phone ignores it (`ignoreUnknownKeys`).

- [ ] **Step 3: Publish-script flag**

`scripts/publish-app-release.ts`: accept `--mandatory` (default false) and set the column on insert. Print it prominently in the summary block — and when it is true, print an explicit warning line that phones below this version will be BLOCKED until they update. Keep every existing guard (monotonic version, debuggable/package refusal on the prod channel).

- [ ] **Step 4: Verify + commit**

`pnpm run check` → 0 errors. `pnpm build` → success. Confirm by SQL that the existing active release row has `is_mandatory = false` (nothing becomes retroactively mandatory).

```bash
git add supabase/migrations app/api/mobile/app-version/route.ts scripts/publish-app-release.ts docs/CALL-TRACKING.md
git commit -m "feat(mobile): per-release is_mandatory flag on app releases"
```

---

### Task C2: App — impossible-to-miss update, blocking when required (v1.5.0)

**Files:**
- Modify: `core/UpdatePolicy.kt` + `__tests__`-equivalent Kotlin test file, `core/Payloads.kt`, `data/AppPrefs.kt`, `notify/Notifier.kt`, `sync/SyncWorker.kt`, `ui/MainActivity.kt`, `ui/HomeScreen.kt`, `res/values/strings.xml`, `app/build.gradle.kts`
- Create: `ui/UpdateRequiredScreen.kt`

**Interfaces:**
- Consumes: `latest.is_mandatory` from C1.
- Produces: `AppPrefs.pendingUpdateVersionCode/Name/Mandatory` (cached so the UI can show the banner without re-polling); `UpdatePolicy.shouldBlock(latestCode, currentCode, isMandatory)`; `UpdateRequiredScreen`.

**The two owner decisions, restated as hard requirements:**
1. A **normal** newer release → persistent in-app banner + high-priority notification. The app keeps working.
2. A **mandatory** newer release → additionally a full-screen blocking `UpdateRequiredScreen` in `MainActivity`, with only one action (update).
3. **Background call syncing must keep running while blocked.** The block lives in `MainActivity`'s composition ONLY. Do NOT touch `SyncWorker`, `SyncScheduler`, `PhoneStateReceiver`, or the unknown-number `QuickAddActivity` path — the agent must still be able to register a lead from a notification while blocked. State in your report which components you verified are unaffected.

- [ ] **Step 1: Cache what the poll found**

`AppPrefs`: add `pendingUpdateVersionCode: Int` (0 = none), `pendingUpdateVersionName: String?`, `pendingUpdateMandatory: Boolean`. Written by `SyncWorker` after each version check; cleared when the installed `BuildConfig.VERSION_CODE` reaches or passes the cached code (so the banner disappears by itself after the update, with no extra poll).

- [ ] **Step 2: TDD the policy addition**

Add `UpdatePolicy.shouldBlock(latestCode: Int, currentCode: Int, isMandatory: Boolean): Boolean = isMandatory && latestCode > currentCode`, and a `shouldShowBanner(latestCode, currentCode) = latestCode > currentCode`. Write the failing tests first in the existing Kotlin test file for `UpdatePolicy` (read it and match its style): not-mandatory-newer → block false / banner true; mandatory-newer → block true; mandatory-but-same-version → block false; mandatory-but-OLDER latest (impossible but defensive) → block false. RED → implement → GREEN.

- [ ] **Step 3: Stronger notification**

`Notifier`: raise `CHANNEL_UPDATES` to `IMPORTANCE_HIGH` so it pops as a heads-up. **Channel importance is fixed at creation** — Android will not raise an existing channel. So create a NEW channel id (e.g. `updates_v2`) and delete the old one via `NotificationManager.deleteNotificationChannel("updates")` in `ensureChannels`; otherwise upgrading phones keep the old quiet channel. Say in your report that you did this and why.
For a mandatory update also set `setOngoing(true)` so it cannot be swiped away.

- [ ] **Step 4: Shorten the nag for mandatory**

In `SyncWorker`'s update-check block, keep the 6h poll throttle, but when the cached release is mandatory use a much shorter re-notify interval (1h) than the standing 24h. Put the interval choice in `UpdatePolicy` (a parameter or a second constant), not inline in the worker, so it stays unit-tested.

- [ ] **Step 5: In-app banner**

`HomeScreen`: when `pendingUpdateVersionCode > BuildConfig.VERSION_CODE`, show a persistent, non-dismissable banner at the top — version name + a button that opens `UpdateActivity`. Match the existing hibernation-warning card's visual pattern in that file (read it) rather than inventing a new style.

- [ ] **Step 6: Blocking screen**

Create `ui/UpdateRequiredScreen.kt` — full screen, RTL, a short Arabic explanation, the version name, and ONE button that opens `UpdateActivity`. No back/skip affordance. In `MainActivity`'s `when {}`, insert the blocked branch **after** the permissions and login branches (a blocked user who is logged out should still see login — do not trap them in a screen they cannot act on) and before the normal Home branch. Add a `BackHandler {}` that consumes back so the system button cannot dismiss it.

- [ ] **Step 7: Version bump**

`versionCode = 6`, `versionName = "1.5.0"`.

- [ ] **Step 8: Verify**

`.\gradlew.bat test` (green, including the new UpdatePolicy cases) and `.\gradlew.bat assembleDebug` (SUCCESS). Confirm with aapt2 that the debug APK reports versionCode 6 / 1.5.0. Do NOT build a release APK.

- [ ] **Step 9: Commit**

```bash
git add pyra-calls-app
git commit -m "feat(app): unmissable update banner + per-release mandatory blocking screen + v1.5.0"
git push origin HEAD:integrate-pending-fixes
```

---

### Task C3: E2E + closure

**Files:** `docs/CALL-TRACKING.md`, `.superpowers/sdd/progress.md`, memory `call-tracking-project.md`

**Prereqs:** local `pnpm dev` (debug builds target `http://10.0.2.2:3000`, channel `pyra-calls-e2e`) + the emulator. **Never log in as youssef or cosette** — the login route deactivates their live device key and takes a real phone offline. Use the disposable `e2e.upgrade` account (inactive + GoTrue-banned; reactivate then re-lock, as the previous E2E did).

- [ ] **Step 1: Banner path** — publish a NON-mandatory higher version to the `pyra-calls-e2e` channel, let the app poll (or use Home's manual check), and confirm: heads-up notification appears AND the Home banner appears AND the app remains fully usable. Screenshot both.
- [ ] **Step 2: Blocking path** — publish a MANDATORY higher version to the e2e channel; confirm the blocking screen appears on next launch, back does not dismiss it, and the only action opens the updater. Screenshot.
- [ ] **Step 3: Sync survives the block (the owner's hard requirement)** — with the blocking screen up, generate a call in the emulator and prove by SQL that the row still reached `pyra_agent_calls`. This is the check that must not be skipped or faked.
- [ ] **Step 4: Banner self-clears** — complete the update and confirm the banner and blocking screen are gone with no manual action.
- [ ] **Step 5: Attempt rendering (Part B)** — open a lead in the CRM that has both an answered and an unanswered call and confirm the two render distinctly. Screenshot.
- [ ] **Step 6: Idle-signal safety (Part B's whole point)** — prove by SQL that a lead whose ONLY recent activity is a `call_attempt` is still selected by the idle-check's own criteria (i.e. the attempt did not mark it as touched).
- [ ] **Step 7: Cleanup** — delete every e2e release row and storage object, re-lock the disposable account, uninstall from the emulator, and verify zero leftovers.
- [ ] **Step 8: Docs, ledger, memory** — document the `call_attempt` semantics, the `--mandatory` publish flag and what it does to phones, and the v1.5.0 contents; note the wave is **awaiting «ادمج» then `pnpm app:publish`**.

```bash
git add docs/CALL-TRACKING.md .superpowers/sdd/progress.md
git commit -m "docs(calls): call_attempt semantics + mandatory-release flow + E2E record"
git push origin HEAD:integrate-pending-fixes
```

---

## Self-Review Notes

- **Ordering is load-bearing in Part B:** the three exclusions (B1 Step 1) must land before the first `call_attempt` row is written, or attempts would briefly suppress idle warnings — the precise bug the previous wave removed.
- **Part A is independent** and can ship alone; Part C is independent of A and B.
- **Deliberate non-goals:** no new notification channel beyond replacing `updates` with a high-importance one; no forced update on every release (owner chose per-release); no change to `SyncWorker`/`SyncScheduler`/`PhoneStateReceiver`/`QuickAddActivity` behaviour when blocked; no retroactive mandatory flag on the currently active release.
- **Known consequence to communicate, not a bug:** once B ships, timelines will show attempt rows that did not exist before — including for leads whose only calls were unanswered. That is the intent. Historic attempts are NOT backfilled (the underlying `pyra_agent_calls` rows survive if anyone ever wants to).
