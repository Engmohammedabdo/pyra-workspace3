# Call Tracking — Design (2026-07-10)

Track every SIM call made/received on the 2 sales agents' company phones
(Samsung Galaxy A15, Android 14) into Pyra CRM: per-agent daily/monthly call
counts, automatic `call_logged` activities on matched leads, quick lead
creation for unknown numbers (prompted by an on-phone notification), and a
feedback reminder after each new lead is created from a call.

Approved by Abdou after brainstorming (visual mockups confirmed 2026-07-10).

## Locked decisions (from brainstorming — do NOT re-litigate)

1. **Custom sideloaded Android app** (background call-log sync), NOT a dialer
   replacement, NOT distributed via Google Play, NOT a third-party service
   (Callyzer et al. rejected: a third party would see all client call data).
   Google Play's READ_CALL_LOG policy does not apply to sideloaded internal
   APKs — verified against Google policy docs during research.
2. **Agents keep the native dialer.** The app is invisible during normal use;
   the only interactions are: one-time login, the unknown-number quick-add
   form, and notifications.
3. **All calls are native SIM calls** — no WhatsApp-call capture in v1.
4. **Quick-add form fields:** lead type toggle **شركة (b2b) / فرد (b2c)**.
   b2b → name AND company required. b2c → name required, company hidden.
   (The CRM API itself requires only name+phone — the app form is stricter
   by design; server re-validates the same rule.)
5. **Feedback reminder fires ONLY after creating a NEW lead from the app** —
   not after calls to existing leads (avoids notification fatigue at 30+
   calls/day). Reminder = local phone notification with a deep link + a CRM
   bell notification via `notify()`.
6. **Ignore list is per-agent.** "تجاهل — رقم شخصي" stops future prompts for
   that number for that agent only. The call itself STAYS counted in the
   agent's daily totals (as unlinked) — the ignore button cannot hide work.
7. **Unmatched calls are stored too** — the daily/monthly count reflects ALL
   calls, split "مرتبطة بعميل / غير مرتبطة" in the report.
8. **One active device per agent** (v1). A new login deactivates the agent's
   previous device key.

## Architecture

```
Samsung A15 (agent phone)
  └─ Pyra Calls app (Kotlin, sideloaded)
       ├─ CallLog.Calls poller (WorkManager 15-min) + PHONE_STATE listener (near-real-time)
       ├─ POST /api/mobile/calls/sync   (batch, idempotent)
       ├─ POST /api/mobile/leads        (quick-add from unknown number)
       ├─ POST /api/mobile/calls/ignore
       └─ local notifications (derived from sync responses — NO FCM in v1)

Pyra Workspace (Next.js)
  ├─ /api/mobile/auth/login → mints per-device key in pyra_api_keys
  ├─ /api/mobile/*          → getExternalAuth + 'calls:device' permission
  ├─ pyra_agent_calls (source of truth, derived counts — NO counters)
  ├─ pyra_ignored_numbers
  ├─ pyra_lead_activities 'call_logged' (existing type — reused verbatim)
  └─ /dashboard/crm/calls report (admin: all agents; agent: own)
```

## Device identity & auth (answers "إزاي نفرّق بين التليفونين")

- **POST `/api/mobile/auth/login`** `{ email, password }` — mirrors the
  existing `/api/auth/login` chain exactly: `adminLoginLimiter` +
  `accountLockoutLimiter` (reset on success) → `signInWithPassword` →
  `pyra_users` lookup → **`status='active'` gate** → role gate (v1: legacy
  role `sales_agent` or `admin` only).
- On success: **deactivate any previous `device:{username}:*` keys**, then
  mint a `pyra_api_keys` row — `name: device:{username}:{deviceId}`,
  `permissions: ['calls:device']` (narrow — NEVER `*`), `created_by:
  username`. Return the raw key ONCE; app stores it in
  EncryptedSharedPreferences.
- Every `/api/mobile/*` request: `getExternalAuth` (existing constant-time
  scan) + `hasPermission(ctx, 'calls:device')` + **re-verify
  `pyra_users.status='active'` for `ctx.apiKey.created_by`** — a deactivated
  employee's device goes dead at the next request even if the key wasn't
  revoked.
- Admin visibility/revocation for free: device keys appear in the existing
  Settings → API keys UI (`last_used_at` = device liveness signal).

## Data model (migration 037)

```sql
CREATE TABLE pyra_agent_calls (
  id               text PRIMARY KEY,            -- 'ac_' prefix
  agent_username   text NOT NULL,
  phone_raw        text NOT NULL,
  phone_normalized text NOT NULL,               -- phoneMatchKey() from lib/utils/phone.ts
  direction        text NOT NULL CHECK (direction IN ('outgoing','incoming','missed')),
  duration_seconds integer NOT NULL DEFAULT 0,
  called_at        timestamptz NOT NULL,
  device_call_key  text NOT NULL,               -- '{deviceId}:{CallLog._ID}'
  lead_id          text NULL REFERENCES pyra_sales_leads(id) ON DELETE SET NULL,
  activity_id      text NULL,                   -- created pyra_lead_activities row
  match_status     text NOT NULL CHECK (match_status IN ('matched','unmatched','ignored')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_username, device_call_key)      -- idempotent re-sync
);
CREATE INDEX ON pyra_agent_calls (agent_username, called_at);
CREATE INDEX ON pyra_agent_calls (phone_normalized);

CREATE TABLE pyra_ignored_numbers (
  id               text PRIMARY KEY,            -- 'ign_' prefix
  agent_username   text NOT NULL,
  phone_normalized text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_username, phone_normalized)
);
```

Both tables: service-role-only (gate-then-service-role pattern; no
`authenticated` grants — Gap #3 doctrine). All counts are **derived** from
`pyra_agent_calls` at read time — no increment counters (Finance Remediation
doctrine).

## Server endpoints

### POST `/api/mobile/calls/sync` (the ingest)
Body: `{ device_id, calls: [{ device_call_key, phone, direction,
duration_seconds, called_at }] }` — batch capped at 100.

Per call (upsert on `(agent_username, device_call_key)` — replays are no-ops):
1. Normalization = **`phoneMatchKey()` from the EXISTING `lib/utils/phone.ts`**
   (last-9-digit suffix key — already the CRM's duplicate-detection
   convention, Q-API-001; matches numbers entered with/without `971`).
   `phone_normalized` stores this key. The webhook's private
   `normalizePhone` stays untouched (out of scope).
2. Match against `pyra_sales_leads.phone` (`phoneMatchKey` compare, JS-side
   full scan — fine at current lead volume; normalized-column index is
   v1.1). Converted leads (customers) still match — their card gets the
   activity. First match wins on duplicates.
3. **Matched** → insert row (`matched`, `lead_id`) + insert
   `pyra_lead_activities` `call_logged` (metadata: `duration_minutes`,
   `direction` (`inbound`/`outbound` — the composer's vocabulary), `auto:
   true`, `source: 'device_sync'` — same metadata shape the
   ActivityComposer writes, so the existing timeline renderer works
   unchanged) + bump `last_contact_at`. **Missed calls**: stored in
   `pyra_agent_calls` (counted in the report) but write NO timeline
   activity and do NOT bump `last_contact_at` — no contact actually
   happened; avoids timeline noise.
4. **Unmatched** → check `pyra_ignored_numbers` → `ignored` or `unmatched`.

Response: `[{ device_call_key, status, lead_id?, lead_name? }]` — the app
fires the local "رقم غير مسجل" notification for every `unmatched` result.
`logActivity()` NOT written per call (volume noise); `logError()` in catches.

### POST `/api/mobile/leads` (quick-add)
Body: `{ device_call_key, name, lead_type: 'b2b'|'b2c', company? }`.
Server-side validation mirrors the form rule: name required; company
required iff `b2b`. Steps:
1. Re-check match first — if the number got matched meanwhile (race), link
   the call to the existing lead and return it with `already_existed: true`.
2. Insert lead following `/api/crm/leads` POST defaults (`source:
   'phone_call'`, `assigned_to` = agent, stage = new inquiry, defaults for
   the rest) + `lead_created` activity — same shape as the CRM route.
3. **Retro-link**: update ALL `unmatched` `pyra_agent_calls` rows with the
   same `phone_normalized` → `matched` + `lead_id` + write their
   `call_logged` activities (the triggering call and any earlier ones).
4. **Feedback reminder**: `notify()` to the agent — new `NotificationType`
   `'call_feedback_required'`, link `/dashboard/crm/leads/{id}`. Response
   carries `lead_id` + the dashboard URL → the app shows a persistent local
   notification «مطلوب: أضف الفيدباك» whose tap opens the lead page in the
   browser.

### POST `/api/mobile/calls/ignore`
Body: `{ device_call_key }` → upsert `pyra_ignored_numbers` + flip that call
and all past `unmatched` rows for the same number/agent to `ignored`.

### GET `/api/crm/calls/report?month=YYYY-MM`
Gate: new permission `calls.view`. Sales agent → own rows only; admin (`*`)
→ all agents. Returns per agent: today count (**`dubaiDayKey()` — never
`.toISOString().slice(0,10)`**), month total, outgoing/incoming/missed
split, total+avg duration, matched vs unmatched vs ignored, per-day series
for the chart.

## CRM UI

- **`/dashboard/crm/calls`** — report page (`page.tsx` + `calls-client.tsx`
  <300 lines, sub-components in `components/crm/calls/`): per-agent summary
  cards, daily bar chart (month), calls table with filters (agent/direction/
  matched). React Query hook `hooks/useCallsReport.ts` (staleTime 60s).
- Lead timeline: **zero work** — auto-synced calls render through the
  existing `call_logged` icon/label/filter-chip machinery.
- `team-performance` response gains `calls_month` per agent (one extra
  grouped query over `pyra_agent_calls`).
- New-feature checklist applies: sidebar entry (CRM group, gated
  `calls.view`), module-guide entry + guide SECTIONS, EmptyState, dark mode,
  RTL, i18n namespace (`messages/{ar,en}/calls.json` per Phase-6c pattern).
- RBAC: `PERMISSIONS.CALLS_VIEW = 'calls.view'` added to
  `ROLE_EXTRAS.sales_agent` **AND the live "Sales" DB role row** (locked
  lesson: code-only grant is inert for DB-role users). `calls:device` is an
  EXTERNAL-key permission string (colon format, like `expenses:create`) —
  it lives on `pyra_api_keys` rows only and is deliberately NOT in the
  rbac.ts `PERMISSIONS` catalogue (must never appear in the role editor).

## Android app (`pyra-calls-app/` — separate Gradle project in repo root, excluded from Next build)

- Kotlin, minSdk 26 / target 34. Permissions: `READ_CALL_LOG`,
  `READ_PHONE_STATE`, `POST_NOTIFICATIONS`, `INTERNET`.
- **Screens:** Login (email+password → device key) · Home (today/month
  counts + sync status + "متزامن" pill) · Quick-add form (b2b/b2c toggle per
  locked decision 4) — Arabic RTL UI.
- **Sync engine:** cursor = last synced `CallLog._ID` (DataStore). Two
  triggers: WorkManager periodic 15 min (reconcile-from-cursor — the
  Samsung-battery-kill-proof safety net) + PHONE_STATE `IDLE` listener
  (debounce ~10s after call end → immediate sync → notification within
  seconds). Retrofit/OkHttp POST with retry/backoff.
- **First login:** cursor initialized to start of the current Dubai day —
  history before install day is NOT imported.
- **Local notifications only** (no FCM): unmatched → «رقم غير مسجل» tap →
  quick form; after save → persistent «أضف الفيدباك» tap → browser to the
  lead URL.
- **Provisioning checklist per phone** (goes in docs): install APK → grant
  permissions → battery "Unrestricted" + add to "Never sleeping apps" +
  disable adaptive-battery sleep for the app → login → make 1 test call →
  verify row lands in CRM.

## Security & privacy

- Device keys carry ONLY `calls:device`; ingest re-verifies the creator is
  still active. Mobile login reuses the existing rate limiters + lockout.
- Phone numbers are PII: never logged raw (`logError` redaction already
  handles phones); `pyra_agent_calls` is service-role-only.
- Server re-validates everything the app enforces (name/company rules,
  batch cap, direction enum).
- Employees are informed in writing that company phones sync call metadata
  (numbers/duration — NOT content, NO recording) to the company CRM.

## 4-audiences check

- **Admin:** full report, device-key revocation via existing Settings → API
  keys, all activities visible.
- **Sales agent:** the app, own report page, feedback notifications.
- **Employee:** not affected. **Client/portal:** none — internal feature, no
  portal parity needed.

## Known limitations (accepted v1)

- Agent can delete a call from the device log within the sync window
  (seconds-to-minutes) — same gap every log-reading product has.
- WhatsApp calls not captured (none occur per Abdou).
- Feedback completion is reminded, not enforced/tracked.
- Lead matching is lead-table-only (clients without a lead row don't match).

## Out of scope / v1.1 backlog

- FCM push · call recording · normalized-phone DB column + index matching ·
  multi-device per agent · feedback-completion tracking · auto follow-up on
  unmatched · matching against `pyra_clients` phones · iOS.
