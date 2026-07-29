# Call Tracking — API Contract + Provisioning Checklist

Server-side contract for the Android call-tracking app (`pyra-calls-app/`,
built against this document). Design decisions: `docs/superpowers/specs/2026-07-10-call-tracking-design.md`.
Implementation plan + task-by-task record: `docs/superpowers/plans/2026-07-10-call-tracking-server.md`
and `.superpowers/sdd/task-{1..8}-report.md`.

All request/response examples below are copied verbatim from live curl runs
against a local dev server (`pnpm dev`), using a temporary scratch agent
(`calltest.temp`) created via `supabase.auth.admin.createUser` + a matching
`pyra_users` row, fully deleted afterwards (Task 8 E2E — zero production
trace left behind). Two examples (duplicate / in-batch-duplicate re-sync)
are copied from Task 4's verified run instead of being re-triggered in this
pass, since Task 4 already smoke-tested them end-to-end with a real DB-minted
device key (see "What's already verified" note at the top of `task-8-report.md`).

## Auth model

Two separate credential types exist in this feature — do not confuse them:

1. **Dashboard session (cookie)** — `POST /api/auth/login` (existing
   endpoint). Used only for `GET /api/crm/calls/report`, which is a normal
   RBAC-gated dashboard/CRM route.
2. **Device API key (`x-api-key` header)** — minted once by
   `POST /api/mobile/auth/login` and used by every other `/api/mobile/*`
   route. This is the credential the Android app stores and uses for its
   entire lifetime on that device.

### Device key lifecycle

- A sales agent (or admin) logs in from the app with their normal CRM
  email + password. The server verifies the password via Supabase Auth
  (`signInWithPassword`, then immediately `signOut()` — no cookie session is
  ever created for the mobile flow), looks the user up in `pyra_users`, and
  requires `status='active'` and `role ∈ {sales_agent, admin}`.
- On success, a new `pyra_api_keys` row is minted: `name:
  device:{username}:{device_id}`, `permissions: ['calls:device']` (narrow —
  never `*`), `created_by: username`, `expires_at: null`. The raw key
  (`pyra_<40-char-nanoid>`) is returned **once** in the response body; only
  its SHA-256 hash is stored server-side.
- **One active device per agent (v1).** Immediately after the new key is
  inserted, every OTHER `device:{username}:%` key belonging to that agent is
  flipped `is_active=false`. A second login (e.g. after a phone swap)
  silently retires the first device's key — verified live in this pass (see
  "Device login" below).
- **Insert-before-deactivate ordering is intentional**: the new key is
  inserted first; the old ones are retired only after that insert succeeds.
  A failed insert leaves the agent's previous key still working instead of
  stranding them with zero active keys.
- Every subsequent `/api/mobile/*` request re-verifies, via
  `requireDeviceAuth()` (`app/api/mobile/_lib/device-auth.ts`): the key
  carries `calls:device`, AND the key's `created_by` user is still
  `status='active'` in `pyra_users` **at request time** — a deactivated
  employee's device goes dead on its very next sync, even if nobody
  manually revoked the key.
- Admins can see/revoke device keys for free in the existing **Settings →
  API keys** UI (`last_used_at` on that row doubles as a device-liveness
  signal — no separate "device status" surface was built).
- API keys carrying the wildcard `'*'` permission also pass the
  `calls:device` check in `requireDeviceAuth()` — consistent with every
  other external/cron endpoint's permission gate. Device keys themselves are
  always minted with ONLY `['calls:device']`, never `'*'`.
- **`x-app-version` request header (v1.2, fleet visibility).** Every
  `/api/mobile/*` request MAY send `x-app-version: <versionCode>` (a plain
  integer, e.g. `2`). `requireDeviceAuth()` parses it and, if it's an
  integer in `1..99999`, fire-and-forget stamps `pyra_api_keys.app_version_code`
  for that key — a no-op write when the stored value already matches
  (`.or('app_version_code.is.null,app_version_code.neq.<versionCode>')`, so
  the very first stamp on a freshly-minted key with `app_version_code IS
  NULL` still applies — a plain `.neq()` guard would NOT match a NULL
  column in Postgres and would silently never stamp a device for the first
  time). This lets an admin see, per device key, which app build is
  installed (Settings → API keys), independent of the self-update check-in
  below. Missing/malformed header → silently skipped, no error.

## Endpoints

### 1. `POST /api/mobile/auth/login`

Body: `{ email, password, device_id }`. `device_id` must match
`^[a-zA-Z0-9._-]{4,64}$` (an app-generated stable device identifier — not
the phone's IMEI).

Rate limiting: shares the dashboard's `adminLoginLimiter` (5/15min per IP)
+ `accountLockoutLimiter` (email-keyed, resets on success) — same two-tier
defense as `/api/auth/login`.

**Success (verified live, first device):**

```
POST /api/mobile/auth/login
{"email":"calltest.temp@pyramedia.internal","password":"***","device_id":"e2e-device-1"}

→ HTTP 201
{"data":{"device_key":"pyra_6R-LPUE09gjIVzSJA2dFqFbu71jot_hqiw90Sg_r","username":"calltest.temp","display_name":"Call Test Temp"},"error":null,"meta":null}
```

**Second login from a different device — verified to flip the first key
inactive:**

```
POST /api/mobile/auth/login
{"email":"calltest.temp@pyramedia.internal","password":"***","device_id":"e2e-device-2"}

→ HTTP 201
{"data":{"device_key":"pyra_tHBzcsbvybfySeSmV0tpfX5sa61jogDHXb4xk8h7", ...}}
```

DB state after both logins (`pyra_api_keys`):

| name | is_active |
|---|---|
| `device:calltest.temp:e2e-device-2` | `true` |
| `device:calltest.temp:e2e-device-1` | **`false`** |

**Error cases** (verified in Task 3, re-confirmed shape unchanged here):

| Condition | Status | Body |
|---|---|---|
| Missing email/password | 400 | `{"error":"البريد الإلكتروني وكلمة المرور مطلوبان"}` |
| Wrong credentials | 401 | `{"error":"بيانات الدخول غير صحيحة"}` |
| `device_id` fails the regex | 422 | `{"error":"device_id غير صالح"}` |
| Account exists but not `status='active'` | 403 | `{"error":"الحساب غير نشط — تواصل مع الإدارة"}` |
| Role not `sales_agent`/`admin` | 403 | `{"error":"التطبيق متاح لموظفي المبيعات فقط"}` |

### 2. `POST /api/mobile/calls/sync` — the ingest

Auth: `x-api-key: <device_key>` (`requireDeviceAuth`). Body:
`{ calls: [{ device_call_key, phone, direction, duration_seconds, called_at }] }`.
Batch capped at **100** calls per request (422 if empty/oversized).
`direction ∈ {outgoing, incoming, missed}`.

**Idempotency**: `device_call_key` should be `{device_id}:{CallLog._ID}` —
unique per `(agent_username, device_call_key)`. Re-sending an already-synced
key (a repeat cursor pass, or an in-flight retry) is a no-op that returns
`'duplicate'`; this is also enforced at the DB level (unique index), so even
a same-millisecond double-POST race can't create two rows for one call.

**Verified live — 1 matched + 1 unmatched in a single batch:**

```
POST /api/mobile/calls/sync   (x-api-key: <device-2 key>)
{"calls":[
  {"device_call_key":"e2etest:1","phone":"+971 50 691 8107","direction":"outgoing","duration_seconds":88,"called_at":"2026-07-10T12:00:00+04:00"},
  {"device_call_key":"e2etest:2","phone":"0569998877","direction":"incoming","duration_seconds":40,"called_at":"2026-07-10T12:05:00+04:00"}
]}

→ HTTP 200
{"data":{"results":[
  {"device_call_key":"e2etest:1","status":"matched","lead_id":"sl_xMX4hXuvw6nV1leN","lead_name":"Rashid Shahin Advocates & Legal Consultants"},
  {"device_call_key":"e2etest:2","status":"unmatched"}
]},"error":null,"meta":null}
```

DB verification: the matched call wrote a `pyra_lead_activities` row
(`activity_type='call_logged'`, `metadata.source='device_sync'`) and bumped
`pyra_sales_leads.last_contact_at` to the call's `called_at`. The unmatched
call has `lead_id=null`, `activity_id=null`.

**`owned` field (added in the whole-wave review fix bundle, see that section
near the end of this doc):** every `'matched'` result also carries
`owned: boolean` — `lead.assigned_to === agentUsername`. The lead index
above is system-wide (no `assigned_to` filter, first-match wins), so a call
can match a colleague's lead; `owned` lets the app skip offering the
outcome-logging action for a lead it doesn't own (that POST 403s). Additive
— omitted from the example above only because it predates the field; a
pre-v1.4 phone's `ignoreUnknownKeys` decoder never sees it either way.

**Verified live — missed call, later ignored** (see endpoint 4 below for the
same call's ignore response):

```
{"calls":[{"device_call_key":"e2etest:3","phone":"0544447766","direction":"missed","duration_seconds":0,"called_at":"2026-07-10T12:10:00+04:00"}]}

→ HTTP 200
{"data":{"results":[{"device_call_key":"e2etest:3","status":"unmatched"}]}}
```

**Duplicate + in-batch-duplicate** (copied from Task 4's verified run — not
re-triggered in this pass; the DB unique constraint + in-batch `Set` guard
are unchanged since):

```
// Re-sending an already-synced batch:
{"results":[
  {"device_call_key":"task4smoke:1","status":"duplicate"},
  {"device_call_key":"task4smoke:2","status":"duplicate"}
]}

// The SAME device_call_key appearing twice inside ONE request:
{"results":[
  {"device_call_key":"task4smoke:dup","status":"matched","lead_id":"sl_...","lead_name":"..."},
  {"device_call_key":"task4smoke:dup","status":"duplicate"}
]}
```
Exactly one `pyra_agent_calls` row and one `call_logged` activity are
created for the whole in-batch-duplicate pair.

**`'error'` status** — a non-unique-violation DB failure on the
`pyra_agent_calls` insert (e.g. a transient DB hiccup). Nothing is
persisted for that call; the server calls `logError()` and the response
reports `status: 'error'` for that item instead of a fake `'duplicate'`.
**Contract for the app: on `'error'`, keep that call queued locally and
retry it on the next sync pass** — do NOT advance the cursor past it and do
NOT treat it as delivered. This path could not be triggered against a live
DB without deliberately breaking it, so it is verified by code inspection
only (`app/api/mobile/calls/sync/route.ts`, the `insErr.code !== '23505'`
branch) — the distinction from `'duplicate'` (Postgres code `23505`) is the
load-bearing part of the contract.

**Missed-call rule (design lock — do not regress):** a `missed` call is
still stored + counted (its `match_status` reflects the phone match exactly
like a connected call), but it writes **no** `pyra_lead_activities` row and
does **not** bump `last_contact_at` — no actual contact occurred. Verified
live: after syncing a missed call to an already-matched lead, the lead's
`last_contact_at` stayed at the earlier connected call's timestamp (not
overwritten by the later missed call).

**0-second dial rule (design lock — do not regress, urgent-fix wave
2026-07-25):** the "connected" gate is `isConnectedCall()`
(`lib/calls/match.ts`) = `direction !== 'missed' AND duration_seconds > 0`
— NOT direction alone. An `outgoing`/`incoming` call with
`duration_seconds = 0` is a dial nobody answered: it is still stored in
`pyra_agent_calls` and still counted by the calls report (it really
happened), and it does **not** bump `last_contact_at` — no actual contact
occurred, so it must not read as one. Before this fix the gate was
direction-only, so an unanswered dial wrote a fake `call_logged` timeline
row and stamped `last_contact_at` as if the lead had answered, poisoning
the health-score recency factor and the `lead-idle-check` fallback for
every lead with an unanswered outgoing dial (257 fake rows / 107 leads
backfilled — see `.superpowers/sdd/progress.md` urgent-fix wave entry).

**`call_attempt` — visible but not contact (Task CA-B1, 2026-07-29):** the
2026-07-25 fix above made an unanswered dial write **no** timeline row at
all, which also erased the agent's effort from view — a rep who dialed a
lead 5 times with no answer had a timeline that looked completely
untouched. As of this task, a matched-but-unanswered dial
(`direction !== 'missed' && duration_seconds === 0`) writes a new
`pyra_lead_activities.activity_type = 'call_attempt'` row instead of
nothing, with `metadata = { direction, duration_seconds: 0, auto: true,
source: 'device_sync' | 'device_sync_retro' }`. Missed inbound calls still
write nothing — a missed call is not the agent's attempt.

`call_attempt` is visible on the lead's timeline (rendered distinctly —
Task CA-B2) but is deliberately excluded from **every** computation of
"was this lead touched" so it can never suppress a follow-up warning or
inflate a health score for a lead the agent has been unable to reach.
Every "last touched" consumer adds `.neq('activity_type', 'call_attempt')`
to the query it uses to compute recency:
- `app/api/cron/lead-idle-check/route.ts` (the batched activities SELECT
  feeding `lastActivityByLead`)
- `app/api/crm/dashboard/deals-at-risk/route.ts`
- `app/api/crm/dashboard/ai-insights/route.ts` (the idle-deals "has recent
  activity" lookup)
- `app/api/crm/customers/[lead_id]/dossier/route.ts` (the health-score
  recency query — `lastActivityRes`)

It never bumps `last_contact_at` either — same as before this task. The
`activity_count`/`last_activity_type` enrichment on the leads list
(`app/api/crm/leads/route.ts`) and the CRM dashboard's recent-activity feed
(`app/api/crm/dashboard/recent-activity/route.ts`) deliberately do NOT
exclude it — those are plain visibility surfaces (a count badge, an
activity feed), not "was this lead touched" gates, so a `call_attempt`
showing up there is the intended behavior.

### 3. `POST /api/mobile/leads` — quick-add from an unmatched call

Auth: same device key. Body:
`{ device_call_key, name, lead_type: 'b2b'|'b2c', company?, source? }`.

Validation (server re-validates the app's own form rule — never trust the
client):
- `name` required.
- `lead_type` must be `'b2b'` or `'b2c'`.
- `company` required **iff** `lead_type === 'b2b'`; for `'b2c'` the server
  forces `company: null` regardless of what's sent.
- `source` (optional, v1.3) — whitelist `['phone_call', 'whatsapp',
  'referral', 'manual', 'ad', 'social', 'website']`. This is the same 6-value
  set the CRM's add-lead form offers (`add-lead-modal.tsx` `SOURCE_VALUES`)
  plus the app-only `'phone_call'` default. An invalid or absent value falls
  back to `'phone_call'` — pre-v1.3 app builds never send this field, so
  the fallback keeps them working unchanged. No DB CHECK constraint exists
  on `pyra_sales_leads.source`; this whitelist is app-layer only.

**Verified live — b2c (name only, no company):**

```
POST /api/mobile/leads   (x-api-key: <device-2 key>)
{"device_call_key":"e2etest:2","name":"عميل اختبار فردي","lead_type":"b2c"}

→ HTTP 201
{"data":{"lead_id":"sl_IzovcLcbk3aIJCff","lead_name":"عميل اختبار فردي","lead_url":"/dashboard/crm/leads/sl_IzovcLcbk3aIJCff","already_existed":false}}
```

DB verification: `pyra_sales_leads` row has `company: null`,
`lead_type: 'b2c'`, `source: 'phone_call'`, `assigned_to` = the agent,
`stage_id` = the pipeline's "new inquiry" stage. A `call_feedback_required`
notification landed in `pyra_notifications` for the agent (title "مطلوب:
إضافة فيدباك", `target_path` pointing at the new lead) — Arabic glyphs
verified intact, no mojibake.

**b2b validation errors (verified in Task 5, all HTTP 422):**

| Body | Error |
|---|---|
| missing `name` | `{"error":"اسم العميل مطلوب"}` |
| `lead_type:"b2b"` without `company` | `{"error":"اسم الشركة مطلوب لعميل شركة"}` |
| `lead_type` not `b2b`/`b2c` | `{"error":"نوع العميل (شركة/فرد) مطلوب"}` |

**`already_existed: true`** — two distinct paths both return this instead
of creating a duplicate lead:
1. **Race guard**: the targeted call row already has a `lead_id` (a
   concurrent sync/quick-add beat this request to it) — returns
   immediately without touching anything else.
2. **Re-match at request time**: the phone number matches an existing lead
   that didn't exist (or wasn't indexed) at the original sync time — the
   call is retro-linked to that lead instead of creating a new one.

**Retro-link on create**: when a genuinely NEW lead is created, every OTHER
`unmatched` `pyra_agent_calls` row sharing the same `phone_normalized` (for
any agent — the retro-link is phone-scoped, not agent-scoped) is flipped to
`matched` + linked to the new lead, and a `call_logged` activity
(`metadata.source: 'device_sync_retro'`) is written for each connected one
(missed ones among them still get no activity, same rule as live sync).

**Feedback reminder**: fires only on a genuinely new lead (not on
`already_existed`) — `notify()` with type `call_feedback_required`, no
`from` (recipient IS the actor, so the self-notify skip never triggers).
The response's `lead_url` is what the app's local "أضف الفيدباك" push
notification deep-links to.

### 4. `POST /api/mobile/calls/ignore`

Body: `{ device_call_key }`. Upserts a per-agent `pyra_ignored_numbers` row
and flips every unlinked `pyra_agent_calls` row for that
`(agent, phone_normalized)` to `match_status='ignored'`.

**Verified live:**

```
POST /api/mobile/calls/ignore   (x-api-key: <device-2 key>)
{"device_call_key":"e2etest:3"}

→ HTTP 200
{"data":{"ignored":true,"updated_calls":1}}
```

**409 — call already linked to a lead** (verified in Task 5; re-confirmed
the branch is unchanged): ignoring a call whose `lead_id` is already set
returns `HTTP 409 {"error":"المكالمة مرتبطة بعميل بالفعل"}`. The ignore
button cannot be used to hide a matched call's work from the daily/monthly
totals.

**The ignore list is per-agent, not global** — the same number can be a
live lead for one agent and an ignored personal number for another.
Ignored calls are still stored and still counted in the agent's
daily/monthly totals (split out as `ignored` in the report) — ignoring a
number never makes work disappear from the count, it only stops future
unmatched-call prompts for that number.

### 5. `GET /api/crm/calls/report?month=YYYY-MM`

**This one uses the dashboard session cookie, not the device key** — it's
a normal RBAC dashboard/CRM endpoint (`requireApiPermission('calls.view')`),
consumed by the `/dashboard/crm/calls` report page (and by any admin's
browser session). `month` defaults to the current Dubai-day's month if
omitted or malformed.

Scope: `crm_reports.team_view` holders (manager/admin) get `scope: 'all'`
(every agent); everyone else gets `scope: 'own'` — server-side
`.eq('agent_username', ...)`, never a client-suppliable filter.

**Verified live** — logged in via `POST /api/auth/login` with the SAME
temp agent's credentials, captured the Supabase session cookie, and
replayed it on this endpoint (no separate cookie-handling trick needed —
worked on the first attempt):

```
GET /api/crm/calls/report?month=2026-07   (Cookie: sb-...-auth-token=...)

→ HTTP 200
{"data":{
  "month":"2026-07",
  "scope":"own",
  "agents":[{
    "username":"calltest.temp","display_name":"Call Test Temp",
    "today":3,"month":3,
    "outgoing":1,"incoming":1,"missed":1,
    "matched":2,"unmatched":0,"ignored":1,
    "total_duration_seconds":128,"avg_duration_seconds":64
  }],
  "per_day":{"2026-07-10":3}
},"error":null,"meta":null}
```

This confirms: (a) `scope: 'own'` for a plain `sales_agent` (the "Sales" DB
role has `calls.view` but not `crm_reports.team_view`); (b) only this
agent's 3 test calls are visible — no cross-agent leakage; (c) `matched=2`
reflects the retro-link from the quick-add (the originally-`unmatched`
`e2etest:2` became `matched` once its lead was created); (d)
`total_duration_seconds=128` = 88+40+0, `avg_duration_seconds=64` = 128/2 —
the missed call's 0s duration is excluded from the denominator (connected
calls only), matching `lib/calls/report.ts`'s `computeCallsReport()`.

`agents` **omits** any agent with zero calls in the month — an empty array
is the true empty state, never assume a fixed roster (see
`hooks/useCallsReport.ts`).

`team-performance` (`/api/crm/dashboard/team-performance`) also gained a
`calls_month` field per agent (Task 6) — same underlying table, a separate
grouped query, for the existing team-performance widget.

### 6. `GET /api/mobile/app-version?app=`

Auth: device key (`requireDeviceAuth`). Self-update check-in — the app
compares `latest.version_code` to its own build and prompts to update when
the server's is higher.

`app` query param selects the release channel: `pyra-calls` (production,
default when omitted/unrecognized) or `pyra-calls-e2e` (debug/emulator
builds only — see `app/api/mobile/_lib/app-channel.ts`). This isolation
means an E2E test release can never be offered as an update to a real
phone, and vice versa.

```
GET /api/mobile/app-version?app=pyra-calls   (x-api-key: <device key>)

→ HTTP 200
{"data":{"latest":{"version_code":2,"version_name":"1.2.0","release_notes":"..."}}}
```

Returns `{"latest":null}` (still HTTP 200) when no active release row
exists yet for that channel — not an error, just "nothing published".

### 7. `GET /api/mobile/app-download?app=`

Auth: device key. Same channel resolution as `app-version`. Returns a
**1-hour signed URL** (`pyra-private` bucket, `createSignedUrl` TTL 3600s)
for the active release's APK plus its `sha256`/`size_bytes` so the app can
verify the download before installing. `storage_path` (the private bucket
path) is NEVER included in the response — Gap #3 Phase 3a doctrine, same as
every other signed-URL route in this codebase.

```
GET /api/mobile/app-download?app=pyra-calls   (x-api-key: <device key>)

→ HTTP 200
{"data":{"url":"https://.../pyra-private/...?token=...","version_code":2,"sha256":"<64-hex>","size_bytes":12345678}}
```

`404 {"error":"لا يوجد إصدار متاح"}` when no active release exists for the
channel.

### 8. `POST /api/mobile/log-error`

Auth: device key. Body: `{ errors: [{ message, stack?, source, severity?,
occurred_at?, android_version?, app_version_code? }] }`. Batch capped at
**20** rows per request (422 if empty/oversized); rows with a missing/blank
`message` are silently skipped (not counted in `received`, not an error for
the whole batch).

Each row is funneled through the shared `logError()` (Phase 14.1) into
`pyra_error_logs` — same 5-layer PII redaction as every other server-side
error. Field handling:
- `severity` must be one of `error`/`warning`/`info` (the exact
  `ErrorSeverity` union `logError` accepts) or it silently falls back to
  `'error'`.
- `message` truncated to 2000 chars, `stack` to 8000 chars,
  `source`/`android_version` to 60/40 chars — a poison-message guard so one
  oversized client payload can't bloat the error-log table.
- `app_version_code` only carried through if it's an integer (matches the
  fleet-visibility stamp on `pyra_api_keys`, but recorded per-error here
  instead of per-key, since a device's build can change between the error
  occurring and the next request).

```
POST /api/mobile/log-error   (x-api-key: <device key>)
{"errors":[{"message":"NullPointerException in SyncWorker","source":"SyncWorker","severity":"warning"}]}

→ HTTP 200
{"data":{"received":1}}
```

`422 {"error":"errors مطلوبة"}` on an empty/missing array;
`422 {"error":"الحد الأقصى 20 خطأ في الدفعة"}` over the cap.

### 9. `GET /api/mobile/my-day`

Auth: device key (`calls:device`) via `requireDeviceAuth`. The "شغل
النهاردة" (today's work) feed behind the app's Home screen — everything the
agent should call today, in one round trip.

**`requireDeviceAuth` carries no RBAC scope** (no `canAccessLead` applied for
free) — every query in this route filters by the authenticated device's
`agentUsername` itself. A missing filter here would leak the whole pipeline
to any device.

Response: `{ follow_ups: FollowUpItem[], going_cold: ColdLeadItem[], counts:
{ follow_ups: number, going_cold: number } }` where

- `FollowUpItem = { id, lead_id, lead_name, phone, title, due_at, status }`
  — `status` is `'overdue' | 'pending'`.
- `ColdLeadItem = { lead_id, lead_name, phone, company, days_since_contact }`.

**Scope rules, both server-enforced:**

- **`follow_ups`**: `assigned_to = me` AND `status IN ('pending','overdue')`
  AND `due_at <= now() + interval '1 day'`, ordered `due_at ASC`, capped at
  **20** rows. Lead name/phone are resolved with ONE batched
  `.in('id', leadIds)` query against `pyra_sales_leads` — not an N+1 loop.
- **`going_cold`**: `assigned_to = me` AND `archived_at IS NULL` AND
  `is_converted IS NOT TRUE` (NULL-safe — a bare `.eq(false)` would silently
  drop legacy NULL rows) AND
  `greatest(last_contact_at, created_at) < now() - interval '7 days'`,
  ordered oldest-effective-contact first, capped at **20** rows. Excludes
  any lead the agent has an **open follow-up** for — `status IN ('pending',
  'overdue')` — computed via a **separate, unlimited** query, NOT derived
  from the capped `follow_ups` list above. Rule: "going cold" means "a lead
  with NO plan"; a lead with a follow-up due next week already has a plan
  and must not be reported as going cold, even though it isn't inside the
  1-day window `follow_ups` shows. Deriving the exclusion set from the
  capped (`.limit(20)`) `follow_ups` array would silently cap the exclusion
  set at 20 lead ids too, even when the agent has hundreds of open
  follow-ups. Because `pyra_sales_leads` already carries
  `name`/`phone`/`company` directly, this list needs no join/second query
  for its own display data — the primary query IS the enrichment.
  - **The exclusion is applied in JS against the fetched candidate pool
    (whole-wave review fix bundle, see that section near the end of this
    doc) — NOT as a DB-side `.not('id','in',(...))` filter.** The original
    shape interpolated every excluded lead id into the request URL, which
    has no safe chunk size for an EXCLUSION (unlike an inclusion filter,
    which can be paged): an agent with a large-enough open-follow-up count
    (measured 152 for `youssef` at fix time, monotonically growing — nothing
    in the app completes a follow-up, and `call_again` outcomes only add to
    it) eventually breaches the URL-length limit and 500s the whole request.
    Same failure class that killed the `lead-idle-check` cron for 11 days
    (UF-T3). `counts.going_cold` is computed from the JS-filtered array's
    length, not the DB `count: 'exact'` (which is now pre-exclusion).
  - The `greatest()` filter is expressed via two column-level conditions
    ANDed together (`created_at < cutoff` AND
    (`last_contact_at IS NULL` OR `last_contact_at < cutoff`)) — mathematically
    identical to `greatest(a,b) < cutoff`, since Postgres's `GREATEST()`
    ignores NULL args, and `max(a,b) < c` iff `a < c AND b < c`. Supabase-js
    can't express a computed-expression filter directly, so this is the
    exact equivalent built from two real-column filters.
  - Because Supabase-js also can't `.order()` by that same computed
    expression, the route fetches every matching row (capped at
    `GOING_COLD_FETCH_CAP = 2000` — set ABOVE the entire system's lead count,
    921 rows measured 2026-07-25, so a single agent's pool can never be
    truncated) and does the precise oldest-first sort in JS. The DB-level
    `.order()` on the fetch is `last_contact_at ASC NULLS FIRST` (not
    `created_at ASC`) so never-contacted leads enter the candidate window
    first as defense-in-depth, even though the cap being above the system
    total already makes truncation impossible today. If the exact
    PRE-exclusion count (`count: 'exact'`, unaffected by `.limit()`) ever
    exceeds the cap, the route logs a `warning`-severity `logError()` +
    `console.warn` — it is read by the daily error-digest cron, so a future
    breach is never silent.

`counts.follow_ups` / `counts.going_cold` are the TRUE totals (independent
of the 20-row response cap) — the app can render "20 من 34" without a
second call.

**Verified 2026-07-25 — twice.** (1) Live on the emulator with a real device
key, against the disposable agent `e2e.upgrade` — both sections rendered and
`counts` matched a `db:query` replay of the same scope exactly (see "Verified
this task (2026-07-25 — W2 agent-app E2E)" near the end of this doc).
(2) By SQL against production for the two REAL agents, below — because a
production-scale check on youssef/cosette can NOT be done from a device: the
n8n `PyraCRM_Cron` API key does not carry `calls:device` and would 403, and
logging in as `youssef`/`cosette` via `POST /api/mobile/auth/login`
**deactivates their live device key** and would knock a real phone offline.
So the production-scale verification replays the route's exact filter logic
as raw SQL against the two ACTIVE sales agents:

```
-- follow_ups (mirrors the route's WHERE, true count):
youssef: 128   cosette: (absent → 0)

-- going_cold BEFORE exclusion (mirrors the route's leads WHERE only):
youssef: 222   cosette: 278

-- open-follow-up lead set used for exclusion (status IN pending/overdue,
-- DISTINCT lead_id, UNLIMITED — this is the fix; it is NOT the capped
-- follow_ups list above):
youssef: 127   cosette: 0

-- going_cold AFTER exclusion (mirrors the shipped route exactly):
youssef: 127   cosette: 278
```

youssef's before/after numbers do NOT subtract cleanly (222 − 127 ≠ 127) —
the overlap between his 222-lead going-cold pool and his 127-lead
open-follow-up set is 95, not the full 127; the remaining 32 open-follow-up
leads were already contacted recently enough to be outside the going-cold
pool in the first place, so excluding them is a no-op. `222 − 95 = 127` is
the actual arithmetic; `127` matching the open-follow-up-set size (also 127)
is coincidental, not a bug.

**Earlier claim was wrong and has been corrected.** A previous pass of this
doc claimed "220 → 139, 81 leads excluded" for youssef, offered as proof the
exclusion was load-bearing. That number is impossible against the shipped
route: the exclusion set was `followUpLeadIds`, derived from the
**`.limit(20)`**-capped `follow_ups` array, so at most 20 distinct lead ids
could ever be excluded — never 81. The 81-exclusion figure was actually
measured against an unlimited follow-up-lead set, i.e. a different rule than
what had shipped. This is now fixed at the code level (the exclusion query
is unlimited by design, per Finding 2) and the numbers above were
re-measured against the code as it now stands.

Cosette having an **empty** follow-up list is expected (confirmed
separately: she has zero follow-ups of any status, ever) — and is exactly
why the `going_cold` half of the feed matters for her: 278 of her leads
would otherwise show nothing to call today.

A `GREATEST(last_contact_at, created_at) ASC LIMIT 10` sample confirmed the
ordering and the NULL-collapse behavior directly: rows with
`last_contact_at IS NULL` show `effective_contact = created_at`, and at
least one row (`Mr Smart Dubai`, cosette) has `last_contact_at` later than
`created_at` and correctly sorts by the later value — matching the route's
`Math.max(lastContactMs, createdMs)` JS logic exactly. Separately, a check
for `is_converted IS NULL` rows on these two agents returned zero rows
today — the `IS NOT TRUE` guard is still correct/required by codebase
convention, but is not currently exercised by live data for youssef/cosette
specifically.

### 10. `POST /api/mobile/call-outcome`

Auth: device key (`calls:device`) via `requireDeviceAuth`. Lets a sales
agent log the result of a call from the app: interested / not_interested /
call_again, with an optional note and an optional next-follow-up date.

Body: `{ lead_id, outcome: 'interested'|'not_interested'|'call_again', note?,
next_follow_up_at? }`. `outcome` is validated against the 3-value whitelist
(422 on anything else); `note` capped at 2000 chars (422 over); if
`next_follow_up_at` is present it must parse as a valid date (422 if not).

**Ownership re-check is mandatory** (`app/api/mobile/call-outcome/route.ts:104`):
`requireDeviceAuth` returns an agent, not a scope — no `canAccessLead`
equivalent is applied for free on this auth path. The route loads the lead
(`SELECT assigned_to`) and rejects with `403` unless
`lead.assigned_to === agentUsername`. A missing lead and a not-owned lead
both resolve to the same generic 403 message — never leaks whether a given
`lead_id` exists to a caller who doesn't own it.

Response: `{ activity_id, follow_up_id, follow_up_error, deduplicated }`.
`follow_up_id` is `null` when no follow-up was requested OR when the
follow-up insert failed OR (on a deduplicated retry) when no matching
follow-up could be found. `follow_up_error` is `true` whenever a
follow-up was requested but the response cannot confirm one exists.
`deduplicated` is `true` when this request matched a note already logged
in the last 60 seconds (see "Retry dedup" below). Three concrete shapes:

- Normal success, no follow-up requested:
  `{ activity_id: 'la_x', follow_up_id: null, follow_up_error: false, deduplicated: false }`
- Normal success, follow-up requested and scheduled:
  `{ activity_id: 'la_x', follow_up_id: 'fu_y', follow_up_error: false, deduplicated: false }`
- Follow-up insert failed (flip-and-warn — still `200`):
  `{ activity_id: 'la_x', follow_up_id: null, follow_up_error: true, deduplicated: false }`
- Deduplicated retry (note already existed within 60s):
  `{ activity_id: 'la_x' /* the ORIGINAL row */, follow_up_id: 'fu_y' | null, follow_up_error: false | true, deduplicated: true }`

**Side effects:**

1. On a non-deduplicated request, writes ONE `pyra_lead_activities` row:
   `activity_type='note'` (an existing timeline value — no new type
   invented), `description` = the note text, or a default derived from the
   outcome (e.g. `"نتيجة المكالمة: مهتم"`) when no note was given,
   `metadata = { source: 'mobile_call_outcome', outcome, auto: false }`.
2. On a non-deduplicated request, bumps `pyra_sales_leads.last_contact_at`
   to now — a genuine human touch (unlike the 0-second-dial sync bug above,
   this always represents a real, agent-confirmed contact). Skipped on a
   deduplicated retry — it is already current from the original request.
3. If `next_follow_up_at` is present AND this is not a deduplicated retry:
   inserts a `pyra_sales_follow_ups` row + a `follow_up_created` timeline
   activity + syncs `leads.next_follow_up` to the earliest pending/overdue
   `due_at` — mirroring `POST /api/crm/follow-ups` field-for-field (`id`,
   `lead_id`, `assigned_to`, `due_at`, `reminder_at` [default
   `due_at - 30min`], `send_whatsapp_reminder` [default `true`], `title`,
   `notes`, `status: 'pending'`, `created_by`). `assigned_to` is always the
   calling agent (the mobile app only ever schedules follow-ups for itself)
   — the CRM route's `leads.assign`-gated "assign to someone else" branch
   has no mobile equivalent by design, so it was deliberately NOT mirrored.
4. Writes an audit row via `logActivity()` —
   `` `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}` `` +
   `metadata.source = 'mobile_call_outcome'` (locked project convention),
   including `follow_up_error` and `deduplicated`.

**No `notify()` call.** The CRM follow-ups route only notifies when
`assignedTo !== caller` — here `assigned_to` is always the calling agent, so
that branch is structurally dead and was omitted rather than kept as an
always-false no-op.

**Rollback:** if the `last_contact_at` update fails after the note activity
was inserted, the activity row is deleted so a half-write never reports
success (this remains a real `500` — the PRIMARY action itself failed).

**Flip-and-warn on follow-up failure** (Quote System pattern — CLAUDE.md
"Quote System" §3): a failure in the OPTIONAL follow-up insert (which only
runs AFTER the note + bump already succeeded) is intentionally **not**
rolled back and does **not** fail the request. The call outcome itself (a
note was logged, contact was bumped) is already a true, committed fact
regardless of whether scheduling a future reminder on top of it also
succeeded. The response is a `200` with `follow_up_error: true` — this was
changed from an earlier `500` (`"تم تسجيل نتيجة المكالمة لكن فشل جدولة
المتابعة"`) specifically because a mobile client on cellular right after a
call reasonably treats a `5xx` as "nothing happened" and resends the
identical request, which would duplicate the note (see "Retry dedup" next).

**Retry dedup (60s window):** before inserting the note activity, the route
checks for an existing `pyra_lead_activities` row with the same `lead_id`,
`activity_type='note'`, `metadata->>'source'='mobile_call_outcome'`,
`metadata->>'outcome'` equal to the request's outcome, `created_by =
agentUsername`, created within the last 60 seconds. A match short-circuits
the insert + bump and returns the existing `activity_id` with
`deduplicated: true`. If the same (deduplicated) request also carries
`next_follow_up_at`, the follow-up insert is skipped too (a duplicate
follow-up is far more visible/annoying to the agent than a duplicate note)
— instead the route looks up whatever follow-up already exists for the
exact `(lead_id, assigned_to, due_at)` within the same 60s window and
reports it (`follow_up_id` + `follow_up_error: false`), or reports
`follow_up_error: true` with `follow_up_id: null` if none is found (the
original attempt's follow-up insert never landed). The dedup lookup itself
**fails OPEN**: a `{ error }` on the lookup is logged to console and
treated as "no duplicate found," falling through to the normal insert path
— a transient DB blip on the dedup check must never swallow a real outcome
the agent just recorded.

**Verified 2026-07-25 — live E2E on the emulator.** All three outcomes were
submitted against a real device key (disposable agent `e2e.upgrade`, never
youssef/cosette): each wrote exactly one `note` activity carrying
`metadata.source='mobile_call_outcome'`, each moved `last_contact_at`, the
`call_again` submission created exactly one `pyra_sales_follow_ups` row with
the right `assigned_to`/`due_at`/`reminder_at`, the 60-second dedup returned
the SAME `activity_id` with `deduplicated: true` on an immediate re-submit
(one row for two POSTs), and the ownership gate returned `403` with **zero**
rows written for a lead owned by another agent. Full evidence: "Verified this
task (2026-07-25 — W2 agent-app E2E)" near the end of this doc.
`pyra_lead_activities.activity_type='note'` and `pyra_sales_follow_ups`'s
column set were also confirmed against `information_schema.columns` before
the route was written.

## Sync semantics summary

- **Idempotency**: unique `(agent_username, device_call_key)` — safe to
  resend a whole cursor-based batch on every app restart or connectivity
  recovery.
- **Batch cap**: 100 calls per request (422 if 0 or >100).
- **Missed-call rule**: stored + counted, but writes no timeline activity
  and does not bump `last_contact_at`.
- **0-second dial rule**: `isConnectedCall()` requires `duration_seconds > 0`
  in addition to `direction !== 'missed'`. Stored + counted, never bumps
  `last_contact_at` (urgent-fix wave 2026-07-25 — previously any non-missed
  direction counted as contact regardless of duration). As of Task CA-B1
  (2026-07-29) it writes a visible `call_attempt` timeline row instead of
  none — see the `call_attempt` section above; every "last touched"
  consumer excludes that type, so it still can't read as contact.
- **Retro-link**: quick-add links not just the triggering call but every
  other unlinked call sharing the same normalized phone number, writing
  `call_logged`/`call_attempt` activities the same way the live sync path
  does. If any linked call was CONNECTED, `last_contact_at` is advanced to
  the newest such call's `called_at` — but only forward, never backward
  (Task CA-B1 fold-in: the connected retro-link path previously never
  bumped `last_contact_at` at all, leaving it stale for a real answered call
  that arrived inside the retro-link window).
- **Phone matching**: `phoneMatchKey()` (`lib/utils/phone.ts`) — last 9
  digits after stripping non-digits and a leading `00`. Same convention the
  CRM already uses for duplicate-lead detection (Q-API-001). First lead
  wins on duplicate phone numbers across leads.
- **`'error'` semantics**: the phone must keep that call queued and retry
  it on a later sync — an `'error'` result means nothing was persisted
  server-side for that call.

## Agent-facing app surfaces (v1.4)

v1.0–v1.3 were a **passive recorder**: the app synced the call log and only
spoke up when a call was *unmatched* (quick-add prompt). v1.4 turns it into a
tool the agent actually opens — it names who called, tells them who to call
today, and captures what happened after the call. All three surfaces are
Arabic-only (`res/values/strings.xml`, no Kotlin literals) and ship together
in **one** release (`versionCode 5` / `versionName 1.4.0`) so the fleet is
touched once.

### 1. Caller identity — "that was <lead>" (W2-3)

`SyncWorker` already received `lead_id` + `lead_name` on every `matched`
sync result and **threw both away** (only `status == "unmatched"` did
anything). It now also fires `Notifier.showMatched(...)`:

- Title `notif_matched_title` = «مكالمة مع %1$s» (the lead name).
- Body `notif_matched_body` = «اضغط لتسجيل نتيجة المكالمة».
- **Content intent → `CallOutcomeActivity`** with `lead_id` + `lead_name`
  extras (surface 3 below).
- Secondary action `notif_matched_browser_action` = «فتح في المتصفح» → the
  original `ACTION_VIEW` deep link to `BASE_URL/dashboard/crm/leads/<id>`.
- Reuses the existing `CHANNEL_FEEDBACK` channel (deliberately **no** fourth
  channel — a matched call is the same "here is something about a lead"
  category `showFeedback` already serves). Notification id and PendingIntent
  request code are both `leadId.hashCode()`, so a second call to the same
  lead REPLACES the notification instead of stacking a duplicate.
- **Gated on connected + owned (whole-wave review fix bundle, see that
  section near the end of this doc).** The initial ship fired on every
  `'matched'` result regardless of whether the call connected or whether the
  lead belonged to the calling agent — both fixed before the v1.4 release
  APK was built. `SyncWorker` now only calls `showMatched` when the local
  `CallEntry` mirrors `isConnectedCall()` AND the sync result's `owned`
  field is not explicitly `false`.

### 2. «شغل النهاردة» — the my-day screen (W2-4)

Home gains one button (`my_day_open_button`) that opens a screen backed by
`GET /api/mobile/my-day` (endpoint 9). Two sections, each with a
`my_day_count` = «%1$d من %2$d» header showing rendered-vs-true totals:

- **«متابعات مستحقة»** — follow-ups due within a day (incl. already-overdue,
  labelled «متأخرة عن …» vs «مستحقة: …»).
- **«عملاء برد»** — leads with no contact for 7+ days AND no open follow-up,
  labelled «بدون تواصل منذ %1$d يوم».

Each row carries an «اتصال» button that fires **`ACTION_DIAL` only** — it
opens the system dialer pre-filled and the agent still has to press call.
This is deliberate: `ACTION_DIAL` needs no runtime permission, so the app
never requests `CALL_PHONE`, and it can never place a call on its own.

Empty states are per-section and cross-reference each other
(`my_day_empty_follow_ups` points the agent at the cold list below).

### 3. Post-call outcome capture (W2-5)

`CallOutcomeActivity` (`android:exported="false"` — reachable only from the
app's own notification) posts to `POST /api/mobile/call-outcome`
(endpoint 10):

- Three single-select chips whose labels are copied verbatim from the
  route's own `OUTCOME_LABELS`, so the button text and the server's
  persisted-note fallback read identically: «مهتم» / «غير مهتم» /
  «يحتاج إعادة اتصال».
- Optional multiline note.
- Optional «اتصل مرة أخرى في…» — three **relative presets**, not a
  date-picker dialog: «غدًا» (+1) / «بعد 3 أيام» (+3) / «الأسبوع القادم»
  (+7). `DubaiTime.followUpPresetMillis()` = Dubai day-start + N days +
  a fixed **10:00 Dubai** hour, so every preset lands inside business hours
  without the agent also picking a time. Dubai has no DST, so the plain
  millis arithmetic is safe. Tapping the selected preset again clears it.
- On `follow_up_error: true` the screen still reports success for the
  outcome but warns about the follow-up (`co_follow_up_error`) — matching
  the route's flip-and-warn contract; it never asks the agent to retry,
  which would duplicate the note.

## Error tracking pipeline (v1.2)

The app self-reports crashes and operational failures into the workspace's
existing `pyra_error_logs` table — no Sentry, no third-party service (mirrors
the Phase 14.1 observability decision).

**On-device (producer):** a file-backed `ErrorQueue` (`data/ErrorQueue.kt`,
pure logic unit-tested as `core/ErrorQueueLogic.kt`) collects events —
uncaught crashes (a `Thread.setDefaultUncaughtExceptionHandler` installed in
`PyraCallsApp`), `sync_failed` (any 5xx/401/403 from `/calls/sync`),
`update_failed` (download/checksum/stale-apk), and the session tripwires
(`session_lost` / `session_migration_failed`). The queue is drained (up to 20
events) at the end of every **successful** `SyncWorker` cycle via
`POST /api/mobile/log-error`; a failed ship just leaves the lines in place for
the next cycle (no retry escalation). A 401 during sync therefore doesn't lose
its own error report — it's queued and ships on the next cycle **after** the
key is valid again.

**Server (ingest):** each row funnels through the shared `logError()` (same
5-layer PII redaction as everything else) into `pyra_error_logs` with:
- `message` prefixed `[pyra-calls-app] …`
- `metadata.source = 'pyra-calls-app'` (the stable filter key)
- `metadata.app_source` = the on-device event category (`sync_failed`,
  `update_failed`, `session_lost`, `crash`, …)
- `metadata.agent` = the authenticated agent username
- `metadata.app_version_code` = the build the error came from
- `metadata.android_version`, `metadata.occurred_at`
- `metadata.request_headers` with `x-api-key` **[REDACTED]** (never leaks the
  device key)

**Admin triage:** open `/dashboard/admin/error-logs`. To see only mobile
events, filter on the message prefix `[pyra-calls-app]` or query directly:

```sql
SELECT created_at, severity, message,
       metadata->>'app_source'       AS category,
       metadata->>'agent'            AS agent,
       metadata->>'app_version_code' AS build
FROM   pyra_error_logs
WHERE  metadata->>'source' = 'pyra-calls-app'
ORDER  BY created_at DESC;
```

**Proactive alerting (urgent-fix wave 2026-07-25):** manual triage above was
previously the only path — `pyra_error_logs` had zero alerting, so a mobile
sync/crash row (or any other server error, e.g. the `lead-idle-check` cron
that failed silently for 11 days) could sit unresolved indefinitely with
nobody notified. `POST /api/cron/error-digest` now runs daily (06:00 Dubai /
02:00 UTC, on its own dedicated n8n Schedule Trigger — it was originally
wired as a second branch off `lead-idle-check`'s shared trigger, which meant
n8n's node halts the execution on error, exactly killing the digest in the
scenario it exists to catch; split into its own trigger, one hour after
idle-check's real fire time, same wave) and `notifyMany()`s every active
admin with the rolling-24h new-error count, the true unresolved total, and
the list of failing cron job names — skipped entirely on a clean day, and
Dubai-day deduped so a same-day double-fire never double-notifies. It covers
this table's ENTIRE contents, not just `pyra-calls-app` rows — mobile errors
are one slice of what it surfaces. Same cron-endpoint pattern as
`device-silent-check` above (`getExternalAuth` → permission → service-role →
`apiSuccess`). Not yet live in production — the n8n Schedule Trigger node is
published in PyraCRM_Cron but the route only exists on
`integrate-pending-fixes`; it 404s until the branch reaches `main`.

Note: `lead-idle-check`'s own trigger was also mislabeled — its node name
said "09:00 Dubai (05:00 UTC)" but the cron expression `0 5 * * *` runs in
the n8n instance's default timezone (Asia/Dubai), so it actually fires at
**05:00 Dubai / 01:00 UTC**. Corrected on both the node name and this doc in
the same wave.

## Per-phone provisioning checklist

Run once per company phone before it's handed to a sales agent:

1. **Install the sideloaded APK** (`pyra-calls-app` — not on Google Play;
   internal-only, "Install unknown apps" enabled for the source used to
   transfer it).
2. **Grant permissions** on first launch: `READ_CALL_LOG`,
   `READ_PHONE_STATE`, `POST_NOTIFICATIONS`. All three are required for the
   sync engine and local notifications to function — the app should refuse
   to proceed to login until granted.
3. **Battery settings** (Samsung-specific — the phones in use are Galaxy
   A15, Android 14; Samsung's aggressive battery management is the #1
   cause of a "dead" sync engine that looks fine in Settings):
   - Set the app's battery usage to **"Unrestricted"** (not "Optimized").
   - Add the app to **"Never sleeping apps"** (Settings → Battery and
     device care → Background usage limits).
   - Disable **adaptive battery** sleep specifically for this app if the
     option is exposed separately.
4. **Log in** with the agent's normal CRM email + password + a stable
   `device_id`. Confirm the app shows the "متزامن" (synced) status pill.
5. **Make 1 test call** (to any number) and wait for the next sync tick
   (WorkManager 15-min periodic, or immediate via the `PHONE_STATE` idle
   listener ~10s after the call ends).
6. **Verify in the CRM**: admin opens `/dashboard/crm/calls` (month picker +
   per-agent cards + chart — there is no agent filter control on the page)
   and confirms the test call appears in that agent's card counts (matched
   or unmatched, depending on whether the test number happens to be a
   lead). If it doesn't appear within a few minutes, re-check step 3 first —
   a battery-killed background service is the most common failure mode, not
   a server or network issue.
7. **Before reassigning a phone to a DIFFERENT agent**, clear the app's data
   (Settings → Apps → Pyra Calls → Storage → Clear data) or uninstall/
   reinstall the app first. This is belt-and-braces on top of the in-app
   agent-handover guard (`AppPrefs.lastLoginUsername` vs. the newly-logged-in
   username in `MainActivity`) — don't rely on the guard alone when a phone
   physically changes hands.
8. **Disable app hibernation / auto-revoke** (v1.2 — Android 11+ "unused app
   restrictions"). The app surfaces a persistent orange card on the
   Permissions screen AND on Home ("مهم: منع الإيقاف التلقائي") whenever the
   OS reports restrictions enabled. Tap **"فتح الإعداد"** → in the App info
   screen that opens, turn **"Manage app if unused" / "إيقاف نشاط التطبيق
   مؤقتًا" OFF**. Left ON, Android eventually revokes the app's permissions
   and archives it — which silently kills call sync. The card re-appears on
   every `ON_RESUME` until the OS reports restrictions disabled, and can
   regress after an OS update (re-check it then).
9. **Allow install-from-unknown-sources for the app itself** (v1.2 self-update
   prerequisite). The first time a self-update runs, Android shows
   *"Allow this source to install apps?"* for **Pyra Calls** (the app installs
   its own update via the system `PackageInstaller` / `ACTION_VIEW`). Grant it
   once; from then on updates install with only the standard *"Do you want to
   update this app?"* confirm. On the sideloaded first install (step 1) the
   unknown-sources grant is for the *transfer* source (Files/Chrome/adb); the
   self-update grant is a **separate** one-time prompt for the app itself.

Re-run this checklist after any OS update that resets battery-management
settings (Samsung's One UI updates have been observed to do this).

## Building & installing the APK

The Android Studio project lives at `pyra-calls-app/` (separate Gradle
project, not part of the Next.js workspace's `pnpm` toolchain). Two build
types share the same `applicationId` (`cloud.pyramedia.calls`) but point at
different servers via `BuildConfig.BASE_URL` (see `app/build.gradle.kts`):
debug → `http://10.0.2.2:3000` (emulator's alias for the host's `pnpm dev`),
release → `https://workspace.pyramedia.cloud` (production).

### Debug build (emulator/local testing)

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot"
cd pyra-calls-app
.\gradlew.bat installDebug          # builds + installs on the running emulator/device
adb shell am start -n cloud.pyramedia.calls/.ui.MainActivity
```

Requires `pnpm dev` running in the workspace repo for the emulator to reach
the API (`10.0.2.2:3000` only resolves from inside the emulator, not from a
physical phone on the same network — a physical device needs the release
build or a LAN IP substituted into `BASE_URL` for local testing).

### Release build (signed, for real phones)

**One-time keystore setup** (already done for this project — do NOT
regenerate unless the existing keystore is lost/compromised):

```powershell
New-Item -ItemType Directory -Force "C:\Users\<you>\pyra-keys"
& "<jdk>\bin\keytool.exe" -genkeypair -v `
  -keystore "C:\Users\<you>\pyra-keys\pyra-calls-release.keystore" `
  -alias pyracalls -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass <STRONG-RANDOM-PASSWORD> -dname "CN=Pyramedia X, O=Pyramedia, C=AE"
```

Then write `C:\Users\<you>\pyra-keys\signing.properties` (private, OUTSIDE
the repo — never commit this file or the keystore):

```properties
storeFile=C\:\\Users\\<you>\\pyra-keys\\pyra-calls-release.keystore
storePassword=<same password>
keyAlias=pyracalls
keyPassword=<same password>
```

Note the **doubled backslashes** — Java's `Properties.load()` treats a
single `\` as an escape character, so a literal Windows path backslash must
be written as `\\` in the file (and `:` after the drive letter as `\:` so it
isn't mistaken for a key/value delimiter). A file with single backslashes
silently parses to a broken path with the separators stripped out — this bit
during this task's first attempt and was caught by inspecting the raw file
bytes before the first `assembleRelease` run.

`app/build.gradle.kts` loads this file at configuration time and only wires
up the `release` signing config when the file exists — a fresh checkout on a
machine without the keystore still configures and builds (the release
build type just has no `signingConfig` assigned in that case, matching
`isMinifyEnabled = false`'s already-permissive style). This keeps the
keystore fully out of git while letting `assembleRelease` "just work" on the
one machine that has the private file in place.

**Build + verify:**

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot"
cd pyra-calls-app
.\gradlew.bat assembleRelease
# → app\build\outputs\apk\release\app-release.apk
Get-FileHash app\build\outputs\apk\release\app-release.apk -Algorithm SHA256
```

Verify the signing cert (should print `CN=Pyramedia X, O=Pyramedia, C=AE`):

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\<version>\apksigner.bat" verify --print-certs app-release.apk
```

**Install on a phone/emulator:**

```powershell
adb install -r app-release.apk
```

`-r` (reinstall/replace) is required if a **debug**-signed build of the same
`applicationId` is already on the device — Android refuses to install an
APK with a different signing certificate over an existing install
(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`); uninstall the debug build first
(`adb uninstall cloud.pyramedia.calls`) if you hit that error, since `-r`
alone does not bypass a signature mismatch.

**⚠️ Keystore backup is critical.** Losing
`pyra-calls-release.keystore` or its password means every future release
build gets a NEW signing certificate — Android treats that as a different
app, so it cannot be installed as an update over the existing one on any
phone that already has it; every phone would need the OLD app uninstalled
first (losing local app state — none held here beyond the stored device
key, which the server can re-mint) before the new-cert build installs. Back
up `C:\Users\<you>\pyra-keys\` (both the keystore and `signing.properties`)
somewhere durable outside this machine.

### Verified this task (2026-07-10)

- Built `pyra_a15_test` AVD (`system-images;android-36;google_apis_playstore;x86_64`,
  Pixel 6 profile) — the exact `google_apis` (non-Play) variant was not
  installed locally, only the `google_apis_playstore` one; used that instead
  with no functional impact for this testing (no Play Store sign-in needed).
- Full flow walked end-to-end on the emulator: login → device key minted →
  3 simulated calls (incoming/missed/outgoing via `adb emu gsm`) → synced →
  unmatched notifications → quick-add (b2b) from a tapped notification →
  lead created + feedback notification → tapped notification opened Chrome
  at the correct `/dashboard/crm/leads/<id>` deep link → ignore flow (action
  button → `pyra_ignored_numbers` row + notification dismissed) → repeat call
  to the same number synced as `ignored` with no new notification.
- Release APK built, signed, SHA-256 recorded, install-verified with
  `adb install -r` (uninstalled the debug build first) — reached the login
  screen against the real production `BASE_URL` without logging in.
- Full command log + DB verification + cleanup counts: `.superpowers/sdd/task-7-report.md`.

## نشر تحديث جديد — publishing a new update (v1.2 self-update runbook)

Once every phone is on v1.2+ (which HAS the self-updater), shipping a new
build is **self-serve** — no more physical phone-collection round. The devices
check `GET /api/mobile/app-version?app=pyra-calls` on a **≤6 h** throttle and
pull the APK from the private `pyra-private` bucket via a signed URL.

**Steps:**

1. Bump `versionCode` (+ `versionName`) in `pyra-calls-app/app/build.gradle.kts`
   — `versionCode` MUST be strictly greater than the current active release
   (the publish script refuses a non-increasing code; the app's download guard
   also refuses to install a not-newer APK).
2. Build the **signed release** (same keystore — a different cert can't install
   as an in-place update):
   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot"
   cd pyra-calls-app
   .\gradlew.bat assembleRelease
   ```
3. Publish to the production channel:
   ```powershell
   pnpm app:publish pyra-calls-app\app\build\outputs\apk\release\app-release.apk `
     --app pyra-calls --notes "ما الجديد في هذا الإصدار"
   ```
   The script auto-detects `versionCode`/`versionName` (aapt2), computes the
   SHA-256, uploads the APK to `pyra-private` **first**, then flips the active
   row — so a mid-publish failure never leaves the fleet with zero active
   releases (it prints the exact `--activate` recovery command if the insert
   fails after the upload).
4. Done. Phones notify + prompt within 6 h; each user taps through
   download → verify → install. The APK payload MUST stay **< 10 MB** (the
   `pyra-private` bucket's `file_size_limit`); the signed release is ~7.8 MB.

**Rollback:** re-activate a previous release row (no re-upload):
```powershell
pnpm app:publish --activate <version_code> --app pyra-calls
```

**Channels:** debug/emulator builds use `pyra-calls-e2e`; production builds use
`pyra-calls`. E2E test APKs are published ONLY to `pyra-calls-e2e` so the real
fleet (which polls `pyra-calls`) can never see a test build. NEVER pass
`--app pyra-calls` for a debug/test APK.

### Verified this task (2026-07-16 — v1.2 E2E + first production publish)

Emulator: `pyra_a15_test` (Android 16 / API 36). Local `pnpm dev` (→ prod
Supabase). All e2e DB/storage artifacts created for the test were cleaned up;
prod `pyra_app_releases` left with exactly the one `pyra-calls` v2 baseline row.

- **Signed in-place upgrade (logout fix):** installed the v1 (`versionCode 1`)
  release, launched (Permissions → Login), then `adb install -r` the v1.2
  release → upgraded in place (same keystore, no data clear) and re-launched
  clean (the plain-prefs migration code runs safely with no session). NOTE:
  the *logged-in-survives-upgrade* behavioural proof was **blocked** — the
  test account `sayed` is deactivated + GoTrue-banned in prod, so no login
  could be established on the pre-v1.2 build; the encrypted→plain session
  migration itself is unit-tested + code-reviewed (A1). The session-durability
  property WAS observed on the debug self-update below (see next bullet).
- **Self-update, full on-device flow:** published a temporary
  `versionCode 99` **debug** build to `pyra-calls-e2e`; a v1.2 debug install
  (session injected via `run-as` with a throwaway `calls:device` key, since
  `sayed` can't authenticate) → Home «التحقق من تحديث» → `app-version` returned
  99 → UpdateActivity → «تنزيل التحديث» → download → SHA-256 verify →
  «التحديث جاهز للتثبيت» → «تثبيت» → system installer → **app becomes
  versionCode 99**. Re-opened **still logged in** (plain-prefs session survived
  the in-place update). Re-checking on 99 → «أنت على أحدث نسخة» (the
  not-newer / archive guard held; no UpdateActivity relaunch).
- **Error pipeline:** deactivating the device key → `/calls/sync` returns
  `401` (exactly what `SyncWorker` enqueues a `sync_failed` for); reactivating
  the key → the queued batch ships via `/api/mobile/log-error` → a
  `pyra_error_logs` row with `severity=error`, `message` prefixed
  `[pyra-calls-app]`, `metadata.{source=pyra-calls-app, app_source=sync_failed,
  agent, app_version_code=2, android_version=16}`, and the `x-api-key` header
  **[REDACTED]** — cleanly triageable in `/dashboard/admin/error-logs`. Fleet
  stamping confirmed: the reporting key's `app_version_code` stamped to 2;
  real fleet keys stay NULL until they run v1.2.
- **Hibernation card:** fresh install → Permissions screen shows the
  «منع الإيقاف التلقائي» card → «فتح الإعداد» opens the system App-info screen →
  toggled **"Manage app if unused" OFF** → back → card disappeared.
- **Production publish:** `pnpm app:publish … --app pyra-calls` → v2 baseline
  row, SHA-256 `cbdfcb1ee1537c051dc844c6f63446620f3fa7190eac56e39de486d331d00fad`
  (matches `Get-FileHash`), 7.80 MB. Safe: the fleet is on v1 (no updater), so
  this row is only the baseline all future updates diff against.

### Verified this task (2026-07-25 — W2 agent-app E2E)

Emulator `pyra_a15_test` (Android 16 / API 36), debug build `versionCode 5 /
1.4.0` → `http://10.0.2.2:3000` (local `pnpm dev`, which talks to the **real**
Supabase). Debug builds use the `pyra-calls-e2e` release channel, so nothing
here could reach the fleet.

**Test account discipline.** Never logged in as `youssef` or `cosette` — the
login route deactivates a live phone's device key. The disposable agent
`e2e.upgrade` was temporarily reactivated (`status='active'` + GoTrue unban +
a throwaway password) and **re-locked afterwards**: `status='inactive'`, the
original `deactivated_at` restored verbatim, GoTrue re-banned to 2126, the
password rotated to an unrecorded random value, its device key deactivated.
A post-relock login probe returns `401`. Verified after cleanup that
youssef + cosette are both still `active` with exactly one active device key
each.

1. **Matched-call notification (W2-3).** Fixture lead `ZZ E2E W26 Alpha`
   (`+971509990001`, assigned to `e2e.upgrade`). Simulated an answered
   inbound call via `adb emu gsm call/accept/cancel` (call log:
   `type=1, duration=7`) → «مزامنة الآن» → `POST /api/mobile/calls/sync 200`
   → notification **«مكالمة مع ZZ E2E W26 Alpha»** / «اضغط لتسجيل نتيجة
   المكالمة» + «فتح في المتصفح» action. Tapping the body opened
   `CallOutcomeActivity` (confirmed via `dumpsys activity`) pre-populated
   «العميل: ZZ E2E W26 Alpha». DB side: one `pyra_agent_calls` row
   `incoming/matched` + one `call_logged` activity
   (`metadata.source='device_sync'`, `duration_seconds: 7`).
2. **My-day screen (W2-4).** «شغل النهاردة» → `GET /api/mobile/my-day 200`.
   «متابعات مستحقة» = «1 من 1» (the fixture follow-up, due today) and
   «عملاء برد» = «1 من 1» (`ZZ E2E W26 Bravo Cold`, «بدون تواصل منذ 30 يوم»).
   A `db:query` replaying the route's exact scope for `e2e.upgrade` returned
   `follow_ups: 1, going_cold: 1` — an exact match. The fresh Alpha lead was
   correctly absent from going-cold, and Charlie was correctly excluded from
   going-cold *because* it has an open follow-up. Tapping «اتصال» opened
   `com.google.android.dialer` pre-filled with **+971 50 999 0002** and the
   call log was byte-identical before and after — **no call was placed**.
3. **Outcome round-trip (W2-5 + endpoint 10).** All three outcomes:
   - `interested` (from the app, with a note) → one `note` activity
     `metadata.source='mobile_call_outcome'`, `outcome='interested'`,
     `description` = the typed note. `last_contact_at` moved
     `11:47:25.551` → `11:51:10.773`.
   - `not_interested` → **dedup proof**: an identical POST fired seconds
     before the app's own submit. Both returned `200`; exactly **one** row
     (`la_Dswmf--YKxw8_d24`) exists and the app treated the deduplicated
     response as success (screen closed, no error). A second, cleaner dedup
     run on another lead returned `deduplicated:false` then
     `deduplicated:true` **with the same `activity_id`**, and the second
     request's different note text was correctly NOT written.
   - `call_again` + the «غدًا» preset (from the app) → one `note` activity
     with the route's Arabic default «نتيجة المكالمة: يحتاج إعادة اتصال»,
     plus exactly **one** `pyra_sales_follow_ups` row: `assigned_to =
     e2e.upgrade`, `due_at = 2026-07-26 06:00Z` (= **10:00 Dubai tomorrow**,
     matching `followUpPresetMillis`), `reminder_at` = due − 30 min,
     `status='pending'`, title «متابعة مكالمة (يحتاج إعادة اتصال)». The
     lead's `next_follow_up` synced to the same timestamp. Arabic round-
     tripped through the DB with no mojibake.
   - Clean `last_contact_at` transition measured in isolation on a second
     lead: `NULL` → `2026-07-25 12:02:28.913+00`.
4. **Ownership gate (security-critical).** Using `e2e.upgrade`'s real device
   key, three POSTs to `/api/mobile/call-outcome`: (a) a throwaway lead
   assigned to `youssef`, (b) a **genuine production** youssef lead
   (`sl_GxLpDRKF0qEUWNOz` / omran), (c) a nonexistent `lead_id`. All three
   → **`403` «لا تملك صلاحية الوصول لهذا الليد»**, all three indistinguishable
   (no existence oracle). SQL confirmed **zero** writes: the throwaway lead
   kept `last_contact_at NULL` / 0 activities / 0 follow-ups; omran kept its
   exact prior `last_contact_at` and activity count of 2; zero
   `mobile_call_outcome` activities and zero follow-ups by `e2e.upgrade`
   outside the one lead it legitimately owns. The 403 path also wrote no
   `pyra_activity_log` row (it returns before `logActivity`).

**Cleanup (verified zero leftovers).** Deleted 4 fixture leads, 8
`pyra_lead_activities`, 2 `pyra_sales_follow_ups`, 3 `pyra_agent_calls`, 6
`pyra_activity_log`; deactivated 1 device key; re-locked the user. Zero
`pyra_notifications` and zero `pyra_error_logs` rows were produced by the
run. App uninstalled from the emulator and its call log cleared.

## Whole-wave review fix bundle (2026-07-25, pre-v1.4-release)

Three findings from the final whole-wave review, fixed before the v1.4
release APK was built. All three verified against production via read-only
`pnpm db:query` at fix time (figures below, not repeated from the review —
they drift daily since the underlying activity keeps happening).

**1. CRITICAL — matched-call notification fired for calls nobody answered.**
`SyncWorker`'s `status == "matched"` gate didn't check whether the call
actually connected — the server (`app/api/mobile/calls/sync/route.ts`)
echoes `'matched'` for ANY phone match regardless of `isConnectedCall()`
(`lib/calls/match.ts`). Measured (30 days trailing, `pyra_agent_calls`):
**846 matched calls, 533 connected, 313 not connected (294 of those
0-second, non-missed dials)** — i.e. ~37% of matched-call notifications were
firing on calls nobody answered. Worse than noise: the notification's
primary action opens `CallOutcomeActivity`, and logging an outcome bumps
`last_contact_at` — reopening by hand the exact fake-contact channel
UF-T1/UF-T2 spent days purging (257 backfilled activities). Fixed in
`SyncWorker.kt`: the notification now only fires when the locally-tracked
`CallEntry` (already available via `byKey`) mirrors `isConnectedCall`
(`direction != "missed" && duration_seconds > 0`). The `unmatched` branch is
untouched.

**2. IMPORTANT — a matched call on a colleague's lead produced a
notification whose action always 403s.** The sync route's lead index is
system-wide (no `assigned_to` filter, first-match wins), so a call to
another agent's lead still returns `'matched'` + that lead's name. Measured
(same 30-day window, joined against `pyra_sales_leads.assigned_to`): **11 of
846 matched calls were on a lead NOT assigned to the calling agent.**
Tapping that notification's primary action always 403s (the ownership gate
on `/api/mobile/call-outcome`), and the app enqueues a `call_outcome_failed`
warning that ships into `pyra_error_logs`, inflating the daily error digest.
Fixed on both sides:
- Server: the leads SELECT now includes `assigned_to`; every `'matched'`
  result carries `owned: lead.assigned_to === agentUsername`. Additive field
  — a pre-v1.4 phone's `ignoreUnknownKeys` decoder silently drops it.
- App: `SyncResult.owned: Boolean? = null` added to `Payloads.kt`;
  `SyncWorker` only calls `showMatched` when `r.owned != false` — `null`
  (old server) is treated as owned so an older server can never silently
  suppress a legitimate notification.

**3. IMPORTANT — `my-day`'s exclusion filter was unbounded (the same
URI-too-long class that killed the lead-idle-check cron for 11 days,
UF-T3).** `GET /api/mobile/my-day` interpolated every open-follow-up lead id
into a `.not('id','in',(...))` filter for the going-cold query. Measured:
`youssef` has **152 open follow-ups today** (up from 127 measured earlier
the same day — the set only grows: nothing in the app completes a
follow-up, and `call_again` outcomes keep adding to it). Chunking doesn't
apply to an exclusion filter — there's no bounded-chunk way to express
"everything except these N ids". Fixed by dropping the DB-side `.not(...
in ...)` filter entirely and instead filtering the fetched candidate pool
(`coldRows`, capped at `GOING_COLD_FETCH_CAP = 2000`) against the
already-built `excludeLeadIds` Set in JS, then computing
`counts.going_cold` from the filtered array's length instead of the (now
pre-exclusion) DB `count: 'exact'`. This stays exact as long as the
candidate pool is under the fetch cap — the pre-existing breach alarm
already covers the day it isn't, and now triggers at least as often as
before (it checks a strictly larger pre-exclusion population).

Verify: `pnpm run check` (0 errors), `pnpm build` (success), `pnpm test`
(no new failures beyond the pre-existing `__tests__/atomic-task-write-
routes.test.ts`), `.\gradlew.bat test` + `.\gradlew.bat assembleDebug` from
`pyra-calls-app\` in PowerShell (both green). No release APK was built or
published as part of this fix.

## v1.1 backlog

- **Device-liveness alert — ✅ SHIPPED (v1.1-C).** `GET /api/mobile/ping`
  (heartbeat — the app calls it on every EMPTY sync pass, see `SyncWorker`,
  best-effort/result ignored) + `POST /api/cron/device-silent-check` (25h
  silence threshold, per-device Dubai-day-deduped, notifies all active
  admins via `notifyMany` with the new `device_sync_silent` notification
  type). Closes the "phone idle vs. app dead" gap noted in the Device key
  lifecycle section above (`last_used_at` alone couldn't tell the two
  apart because empty syncs never touched the network before this).
  **Requires the updated APK on phones** — a device still running the
  pre-v1.1-C build never calls `/ping`, so its `last_used_at` only
  advances on a real sync; the cron still eventually catches a genuinely
  dead app (zero syncs either way), but the heartbeat's extra "still
  alive, just idle" signal only applies once the phone is updated.
- ✅ SHIPPED (2026-07-11, v1.1 wave) — **Per-call table + filters** on
  `/dashboard/crm/calls`: `GET /api/crm/calls` (same gate/scope doctrine as
  the report route; month/agent/direction/status filters; 50-row pages) +
  `CallsTable` below the aggregate cards.
- **Normalize `called_at` + cap `duration_seconds`/string lengths in
  `parseCalls`** — a poison-retry guard so a single malformed device row
  can't repeatedly fail the whole batch on every retry.
- **Role re-check (not just `status`) in device-auth** — `requireDeviceAuth`
  currently re-verifies `status='active'` on every request but not that the
  role is still `sales_agent`/`admin`; a role change away from those two
  should also kill the device key.
- **team-performance graceful degradation** for the calls query (currently
  assumes the query succeeds) + actually rendering `calls_month` in the UI
  (the field is returned by the API but not yet surfaced on the widget).
- **Extract `dubaiMonthBounds` to `lib/utils/format`** with unit tests
  (currently inline in the report route).
- **Per-call `'error'`-status live trigger test** — currently verified by
  code inspection only (see endpoint 2 above); a real forced-failure test
  would close that gap.
- **Android app — discriminate 5xx from auth errors in `SyncWorker`** for
  faster backoff retry (today both paths retry the same way).
- **Android app — 401 self-logout + server-side device-key revoke-on-logout**
  (today a 401 just fails the current sync silently; there's no explicit
  "log out from this device" flow that also revokes the key server-side).
- **Android app — move the `10.0.2.2` cleartext `network_security_config`
  to the debug source set** (`src/debug/res/xml/`) so the release build
  never ships a cleartext-permissive config, even inert.
- **Android app — run the ignore POST via expedited WorkManager work**
  instead of `goAsync()` in `IgnoreReceiver`, for more reliable delivery
  under Doze/background restrictions.
- **Android app — namespace notification IDs** (`Notifier.cancel` currently
  keys off `key.hashCode()` — collisions across different
  `device_call_key` values are possible, however unlikely).
- **Android app — migrate off the deprecated `androidx.security.crypto`
  alpha** (`EncryptedSharedPreferences`/`MasterKey`) once a stable
  successor lands.
- **Android app — intentional deviation**: the ignore action's `409`
  response (already lead-linked) is handled silently — the notification is
  dismissed with no toast/snackbar shown to the agent. The prompt is
  obsolete either way (a lead already exists for that number), so no
  further agent action is needed.
