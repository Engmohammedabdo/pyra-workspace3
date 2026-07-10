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

### 3. `POST /api/mobile/leads` — quick-add from an unmatched call

Auth: same device key. Body:
`{ device_call_key, name, lead_type: 'b2b'|'b2c', company? }`.

Validation (server re-validates the app's own form rule — never trust the
client):
- `name` required.
- `lead_type` must be `'b2b'` or `'b2c'`.
- `company` required **iff** `lead_type === 'b2b'`; for `'b2c'` the server
  forces `company: null` regardless of what's sent.

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

## Sync semantics summary

- **Idempotency**: unique `(agent_username, device_call_key)` — safe to
  resend a whole cursor-based batch on every app restart or connectivity
  recovery.
- **Batch cap**: 100 calls per request (422 if 0 or >100).
- **Missed-call rule**: stored + counted, but writes no timeline activity
  and does not bump `last_contact_at`.
- **Retro-link**: quick-add links not just the triggering call but every
  other unlinked call sharing the same normalized phone number.
- **Phone matching**: `phoneMatchKey()` (`lib/utils/phone.ts`) — last 9
  digits after stripping non-digits and a leading `00`. Same convention the
  CRM already uses for duplicate-lead detection (Q-API-001). First lead
  wins on duplicate phone numbers across leads.
- **`'error'` semantics**: the phone must keep that call queued and retry
  it on a later sync — an `'error'` result means nothing was persisted
  server-side for that call.

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

## v1.1 backlog

- **Per-call table + filters** on `/dashboard/crm/calls` — a row-level view
  (not just per-agent aggregate cards) with `agent` / `direction` / `matched`
  filters.
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
