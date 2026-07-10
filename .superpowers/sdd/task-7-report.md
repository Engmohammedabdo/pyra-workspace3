# App Task 7 Report: Emulator E2E + release APK + docs

**Status:** DONE

> Note: this file previously held a stale report from the SERVER effort's
> "Task 7" (CRM calls report page), which reused this filename in an
> earlier SDD pass. Overwritten per instructions — this report covers only
> App Task 7 of the pyra-calls-app effort (`task-7-brief.md`).

## Summary

Created an Android emulator (`pyra_a15_test`, `google_apis_playstore;x86_64`
— the exact `google_apis` non-Play variant wasn't installed, this was used
instead with no functional impact), started `pnpm dev` locally, created a
temporary test agent (`calltest2.temp`, `sales_agent`, active, live "Sales"
DB role), installed the debug APK, and walked the full flow end-to-end:
login → device key mint → 3 simulated calls (incoming/missed/outgoing) →
sync → unmatched notifications → quick-add (b2b) from a tapped notification
→ lead + feedback notification → feedback notification deep-link verified
→ ignore flow (action button + repeat-call no-new-notification). Every
artifact was deleted afterward with a verified zero-sweep. Generated a
release keystore + signing config, built + SHA-256'd + install-verified the
signed release APK against production. Appended a "Building & installing
the APK" section to `docs/CALL-TRACKING.md`. `pnpm run check` passes (0 TS
errors, i18n clean). Committed `pyra-calls-app` (signing change only) +
`docs/CALL-TRACKING.md`. Emulator + dev server both stopped.

## Step 1 — AVD + emulator boot

```
$sdk\system-images\android-36\   → only google_apis_playstore + google_apis_playstore_ps16k (x86_64)
                                    (no plain "google_apis" variant installed)
```

Used `system-images;android-36;google_apis_playstore;x86_64` with the
`pixel_6` device profile:

```powershell
echo no | avdmanager.bat create avd -n pyra_a15_test -k "system-images;android-36;google_apis_playstore;x86_64" -d pixel_6
Start-Process emulator.exe -ArgumentList "-avd","pyra_a15_test","-no-snapshot","-no-audio","-no-boot-anim"
adb wait-for-device
```

Boot completed in **45s** (`sys.boot_completed=1`). `adb devices` →
`emulator-5554 device`. Disabled all 3 animation scales
(`window_animation_scale`/`transition_animation_scale`/`animator_duration_scale`
→ `0`). Device: 1080×2400, Android 16.

**Deviation:** brief expected plain `google_apis`; only the Play Store
variant was locally installed. No functional difference observed for this
testing (no Play sign-in was ever required — permission grants, telephony
simulation, and notification handling all worked identically).

## Step 2 — Server + temp agent

`pnpm dev` started via `preview_start` (port 3000, confirmed `200`/`307` on
`/api/health` and `/`).

Temp agent created via a scratch Node script
(`scripts/tmp-e2e-app-setup.cjs`, deleted immediately after use — never
committed), mirroring the server-side Task 8 pattern exactly:

1. `supabase.auth.admin.createUser({ email: 'calltest2.temp@pyramedia.internal', password: <random>, email_confirm: true, user_metadata: { username: 'calltest2.temp' } })`
   → `AUTH_USER_ID=253ff11e-cdbe-44f0-9865-cbbb0717c03d`.
2. `pyra_users` insert: `username: 'calltest2.temp'`, `password_hash`
   (scrypt, unused for actual auth), `role: 'sales_agent'`,
   `display_name: 'Call Test App E2E'`, `permissions: []`, `status: 'active'`,
   `role_id: '70167f39-40e1-4ede-a4e7-71db2b09b0a3'` (live "Sales" DB role —
   same one server Task 8 used; carries `calls.view`), `email` set.
3. `pyra_auth_mapping` insert: `auth_user_id` ↔ `pyra_username` →
   `mappingId: am_e1a8487f5254b616`.

Verified via `pnpm db:query`:
```json
{"username":"calltest2.temp","role":"sales_agent","status":"active","role_id":"70167f39-40e1-4ede-a4e7-71db2b09b0a3","email":"calltest2.temp@pyramedia.internal"}
```

Scratch script deleted immediately after the run (confirmed absent from
`git status`).

## Step 3 — Full flow on the emulator

### 3.1 Install + launch

```
.\gradlew.bat installDebug   → BUILD SUCCESSFUL in 19s, "Installed on 1 device."
adb shell am start -n cloud.pyramedia.calls/.ui.MainActivity
```

Screenshot: `%TEMP%\pyra-e2e\01-launch.png` — permission-required screen
("أذونات مطلوبة").

### 3.2 Permissions

```
adb shell pm grant cloud.pyramedia.calls android.permission.READ_CALL_LOG
adb shell pm grant cloud.pyramedia.calls android.permission.READ_PHONE_STATE
adb shell pm grant cloud.pyramedia.calls android.permission.POST_NOTIFICATIONS
```
`dumpsys package` confirmed all 3 `granted=true`. Tapped "منح الأذونات" →
app proceeded to the login screen (`02-after-perm-tap.png`).

### 3.3 Login

Typed via `adb shell input text` (note: literal spaces must be `%s`-escaped
for multi-word strings, and every tap coordinate had to be the RAW/original
device pixel value — 1080×2400 — not the 900×2000 scale the screenshots are
displayed at in this session; several early taps landed in the wrong field
until this was corrected).

- Email: `calltest2.temp@pyramedia.internal`
- Password: `E2eAppTest!bfa172578cc2`
- Tapped "دخول" → "جارِ الدخول…" → Home screen: "أهلاً، Call Test App E2E"
  (`11-login-result.png`).

**DB verification** (`pyra_api_keys WHERE created_by='calltest2.temp'`):
```json
{"id":"ak_etliWcUoJkFjKmKu","name":"device:calltest2.temp:vszfdbm7mxqmh5j1","permissions":["calls:device"],"is_active":true,"created_by":"calltest2.temp"}
```
Matches the expected `device:{username}:{deviceId}` shape exactly.

### 3.4 Simulated calls

Collision check first (learned from server Task 8's near-miss): confirmed
`0568112299` / `0501112255` / `0568112288` had **zero** matches in
`pyra_sales_leads` before use.

**Incoming (accepted, ~10s):**
```
adb emu gsm call 0568112299   → mCallState=1 (ringing), mCallIncomingNumber=0568112299
adb emu gsm accept 0568112299 → mCallState=2 (offhook)
(wait 10s)
adb emu gsm cancel 0568112299 → mCallState=0
```

**Missed (no accept):**
```
adb emu gsm call 0501112255 → mCallState=1
adb emu gsm cancel 0501112255 → mCallState=0
```

**Outgoing:**
```
adb shell am start -a android.intent.action.CALL -d tel:0568112288
→ mCallState=2, status bar shows call chip
```
`adb emu gsm cancel` did NOT end this one (console-level cancel only
affects simulated-GSM calls; this outgoing call was placed through the
Google Dialer/Telecom stack via `ACTION_CALL` and stayed "connected" per
the status-bar timer). Fixed by sending `adb shell input keyevent
KEYCODE_ENDCALL`, which correctly hung it up (`mCallState=0` confirmed).
Noted as a deviation — documented here for future re-runs (use ENDCALL for
outgoing test calls, not `gsm cancel`).

**Android call log** (`content query --uri content://call_log/calls`)
confirmed all 3 rows: `type=1` (incoming, dur=25), `type=3` (missed, dur=0),
`type=2` (outgoing, dur=86).

### 3.5 Sync verification

`logcat` showed `WM-WorkerWrapper: Starting work for
cloud.pyramedia.calls.sync.SyncWorker` → `Worker result SUCCESS`
(triggered by the PHONE_STATE idle listener, ~10s debounce after the last
call ended).

**DB (`pyra_agent_calls WHERE agent_username='calltest2.temp'`):**

| device_call_key | phone_normalized | direction | duration_seconds | match_status |
|---|---|---|---|---|
| `vszfdbm7mxqmh5j1:1` | 568112299 | incoming | 25 | unmatched |
| `vszfdbm7mxqmh5j1:2` | 501112255 | missed | 0 | unmatched |
| `vszfdbm7mxqmh5j1:3` | 568112288 | outgoing | 86 | unmatched |

All 3 correctly `device_call_key = <deviceId>:<n>`, correct directions,
correctly unmatched (no lead collisions).

**Notifications** (`dumpsys notification --noredact`): 3 separate
"رقم غير مسجل في النظام" notifications, each with a "تجاهل — رقم شخصي"
action, grouped under a "Pyra Calls" summary (`16-notif-shade.png`,
`17-notif-expanded.png`).

### 3.6 Quick-add (b2b) via notification tap

Expanded the notification group, tapped the `0568112288` (outgoing)
notification → quick-add form opened prefilled `الرقم: 0568112288`,
defaulted to "شركة" (b2b) (`18-quickadd-form.png`).

Filled `اسم العميل: "Test Client E2E"`, `اسم الشركة: "E2E Test Co"` (typed
via `input text` with `%s` for spaces — a naive space in the shell command
silently truncated to the first word on the first attempt; fixed).

Tapped "حفظ كعميل" → "جارِ الحفظ…" → returned to Home
(`22-after-save.png`, `23-save-result.png`).

**DB verification:**
```json
{"id":"sl_ztjfxs3SphQY7fE2","name":"Test Client E2E","company":"E2E Test Co","lead_type":"b2b","phone":"0568112288","source":"phone_call","assigned_to":"calltest2.temp","stage_id":"stg_new_inquiry"}
```
`pyra_agent_calls` for `vszfdbm7mxqmh5j1:3` retro-linked:
`lead_id: sl_ztjfxs3SphQY7fE2`, `match_status: matched`.

`pyra_notifications`:
```json
{"type":"call_feedback_required","recipient_username":"calltest2.temp","title":"مطلوب: إضافة فيدباك","message":"تم إنشاء عميل جديد (Test Client E2E) من مكالمة — ادخل وسجّل نتيجة المكالمة","target_path":"/dashboard/crm/leads/sl_ztjfxs3SphQY7fE2"}
```

### 3.7 Feedback notification deep-link

Tapped the "مطلوب: إضافة فيدباك" notification → Chrome opened. `dumpsys
activity activities` intent dump confirmed the EXACT URL:
```
Intent { act=android.intent.action.VIEW dat=http://10.0.2.2:3000/dashboard/crm/leads/sl_ztjfxs3SphQY7fE2 ... cmp=com.android.chrome/... }
```
Chrome redirected to `/login?redirect=...` (no dashboard session in that
browser — expected, confirms the deep link targeted the correct path before
the auth redirect). Per instructions, did NOT log in on this browser
(`27-chrome-loaded.png`).

### 3.8 Ignore flow

Used the still-pending `0501112255` (missed call) notification. Expanded
it to reveal the "تجاهل — رقم شخصي" action, tapped it.

**DB verification:**
```json
{"id":"ign_Nt6Jm201WwCxLaDg","agent_username":"calltest2.temp","phone_normalized":"501112255","created_at":"2026-07-10 13:43:42..."}
```
Notification for that number confirmed dismissed (`32-notif-refresh.png` —
only the `0568112299` notification remained).

**Repeat call to the ignored number:**
```
adb emu gsm call 0501112255 → adb emu gsm cancel 0501112255
```
Waited for the debounced sync (`WM-WorkerWrapper` SUCCESS in logcat, ~10s
later). DB:
```json
{"device_call_key":"vszfdbm7mxqmh5j1:4","phone_normalized":"501112255","match_status":"ignored"}
```
`dumpsys notification --noredact` text dump after this second call showed
**no new "رقم غير مسجل" notification for 501112255** — only the pre-existing
`0568112299` unmatched notification remained. Confirms: sync correctly
classifies a re-call to an ignored number as `ignored` with zero new
notifications.

### 3.9 Cursor-freeze test (not live-triggerable)

Per the brief: this needs a server-side `'error'` response, which requires
deliberately breaking the production-shared dev DB. Not attempted — covered
by `SyncPlannerTest` (unit test) per App Task 5/6, and by code inspection
(see `docs/CALL-TRACKING.md`'s `'error'` status section, same posture as
the server-side Task 8 report).

### 3.10 Cleanup — verified counts

Full inventory taken before deleting (all confirmed present):

| Table | Count |
|---|---|
| `pyra_agent_calls` (agent_username) | 4 |
| `pyra_sales_leads` (id=sl_ztjfxs3SphQY7fE2) | 1 |
| `pyra_lead_activities` (lead_id) | 2 |
| `pyra_notifications` (recipient_username) | 1 |
| `pyra_ignored_numbers` (agent_username) | 1 |
| `pyra_activity_log` (username) | 1 |
| `pyra_api_keys` (created_by) | 1 |
| `pyra_users` (username) | 1 |
| `pyra_auth_mapping` (pyra_username) | 1 |
| Supabase Auth | 1 user |

Deleted via a scratch cleanup script (`scripts/tmp-e2e-app-cleanup.cjs`,
deleted after use — never committed), each delete using `.select('id')` to
confirm row counts:

```json
{
  "agent_calls": 4, "lead_activities": 2, "sales_leads": 1,
  "notifications": 1, "ignored_numbers": 1, "activity_log": 1,
  "api_keys": 1, "auth_mapping": 1, "users": 1,
  "auth_user_deleted": true
}
```

**Final zero-sweep** (immediately after, all scoped to `calltest2.temp` /
the test lead):
```json
{
  "agent_calls": 0, "sales_leads": 0, "lead_activities": 0,
  "notifications": 0, "ignored_numbers": 0, "activity_log": 0,
  "api_keys": 0, "users": 0, "auth_mapping": 0,
  "auth_user_still_present": false
}
```
All zero. Production DB has zero trace of `calltest2.temp`. Both scratch
Node scripts confirmed deleted from disk (`git status` shows nothing under
`scripts/tmp-*`).

## Step 4 — Release signing + APK

Generated a strong random 30-char password (`node crypto.randomBytes(24)`
base64, stripped `+/=`): `<REDACTED - stored only in C:\Users\engmo\pyra-keys\signing.properties>`.

```powershell
keytool.exe -genkeypair -v -keystore "C:\Users\engmo\pyra-keys\pyra-calls-release.keystore" `
  -alias pyracalls -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass <REDACTED - stored only in C:\Users\engmo\pyra-keys\signing.properties> -keypass <REDACTED - stored only in C:\Users\engmo\pyra-keys\signing.properties> `
  -dname "CN=Pyramedia X, O=Pyramedia, C=AE"
```

Wrote `C:\Users\engmo\pyra-keys\signing.properties`:
```properties
storeFile=C\:\\Users\\engmo\\pyra-keys\\pyra-calls-release.keystore
storePassword=<REDACTED - stored only in C:\Users\engmo\pyra-keys\signing.properties>
keyAlias=pyracalls
keyPassword=<REDACTED - stored only in C:\Users\engmo\pyra-keys\signing.properties>
```

**Password recorded here (in the report) and in the file above per the
brief's instruction.** Anyone rotating this key must update both the
keystore and `signing.properties` together.

**Deviation/gotcha caught:** a first attempt to write this file via a Bash
heredoc silently collapsed the doubled backslashes to single ones (some
layer between the tool call and the shell re-processed escapes). Verified
via `od -c` that the raw bytes were wrong (single `\` throughout — which
`java.util.Properties.load()` would silently swallow as broken escape
sequences, corrupting the path to `C:Usersengmopyra-keys...` with all
separators stripped). Fixed by using the `Write` tool directly (no shell
interpretation layer) and re-verified the raw bytes showed the correct
doubled backslashes before proceeding to build.

**`app/build.gradle.kts`** — added the signing config exactly per the
brief's template, with one fix: `java.util.Properties()` failed to resolve
(`Unresolved reference: util`) inside the top-level Kotlin DSL script block
— fixed by adding an explicit `import java.util.Properties` at the top of
the file and using the bare `Properties()` constructor instead of the
fully-qualified name.

```
.\gradlew.bat assembleRelease → BUILD SUCCESSFUL in 2m 23s (50 actionable tasks)
```

**SHA-256:**
```
E4876F22A70B0AFD04B765316CD5A55348C99D7BD8483E060B47D320385BBA75
```
Path: `pyra-calls-app\app\build\outputs\apk\release\app-release.apk`

**Signature verification** (`apksigner.bat verify --print-certs`):
```
Signer #1 certificate DN: CN=Pyramedia X, O=Pyramedia, C=AE
Signer #1 certificate SHA-256 digest: 4fb25382b0f42339e769ab6efea487159d877fcca5453943a6d70b93bc2a5199
Signer #1 certificate SHA-1 digest:   8716b4b0819f19c89af711ce5ce6068bbd80af7c
Signer #1 certificate MD5 digest:     ac1f36fa39853bdaff32825a17b08db4
```

**Install-verify:** the debug build (different signing cert) was already on
the emulator under the same `applicationId`, so `adb install -r` alone
would fail with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Uninstalled first:
```
adb uninstall cloud.pyramedia.calls → Success
adb install -r app-release.apk → Success
```
Launched → reached the "تسجيل الدخول" login screen cleanly (production
`BASE_URL = https://workspace.pyramedia.cloud`). Per instructions, **did
NOT log in** with real credentials on this build (`35-release-launch.png`).

## Step 5 — Docs + final verify + commit

Appended a "## Building & installing the APK" section to
`docs/CALL-TRACKING.md` (before the existing "## v1.1 backlog" section):
debug vs release build types, one-time keystore setup, the
double-backslash `.properties` escaping gotcha (documented so it isn't
re-discovered the hard way next time), build + SHA-256 + apksigner verify
commands, `adb install -r` + the signature-mismatch uninstall note, a
keystore-backup warning, and a "Verified this task" summary.

```
pnpm run check → tsc --noEmit (0 errors) + i18n:check ✓ clean
```

Deleted the stray `pyra-calls-app/test-green.log` + `test-red.log` files
(untracked, leftover from Task 2).

Staged **only** the intended paths (`git status --short pyra-calls-app`
confirmed just the one modified file before staging):
```
git add pyra-calls-app docs/CALL-TRACKING.md
git commit -m "feat(calls-app): release signing + emulator e2e + build docs"
→ [integrate-pending-fixes 8d6d67f] 2 files changed, 147 insertions(+)
```

Not staged/touched (pre-existing modifications from session start, not
part of this task's scope): `.superpowers/sdd/progress.md`,
`AGENT-ONBOARDING.md`, `AGENTS.md`.

**Not pushed** — per the orchestra pattern, the controller pushes after
final review.

## Emulator + dev server teardown

- `preview_stop` on the `next-dev` server (serverId
  `356f68be-f47b-4a1c-8f02-6291148925c4`) — stopped.
- `adb emu kill` — emulator shut down, confirmed via `adb devices` showing
  an empty device list after a few seconds.

## Screenshots (all in `%TEMP%\pyra-e2e\`, NOT in the repo)

`01-launch.png` · `02-after-perm-tap.png` · `03-email-typed.png` ·
`04-password-typed.png` · `05-cleared.png` · `06-email-retyped.png` ·
`07-pwd-focus.png` · `08-pwd-focus2.png` · `09-pwd-typed.png` ·
`10-after-login.png` · `11-login-result.png` · `12-incoming-ringing.png` ·
`13-outgoing-call.png` · `14-back-to-app.png` · `15-endcall.png` ·
`16-notif-shade.png` · `17-notif-expanded.png` · `18-quickadd-form.png` ·
`19-name-typed.png` · `20-name-fixed.png` · `21-company-typed.png` ·
`22-after-save.png` · `23-save-result.png` · `24-feedback-notif.png` ·
`25-feedback-expanded.png` · `26-feedback-tapped.png` ·
`27-chrome-loaded.png` · `28-back-to-app.png` · `29-ignore-notif-list.png` ·
`30-ignore-single-expanded.png` · `31-after-ignore-tap.png` ·
`32-notif-refresh.png` · `33-after-second-call.png` ·
`34-manual-sync.png` · `35-release-launch.png`

## Deviations (all documented above, none blocking)

1. **`google_apis_playstore` instead of plain `google_apis`** system image
   — only variant locally installed; no functional impact observed.
2. **`adb emu gsm cancel` didn't end the outgoing `ACTION_CALL`** — that
   call goes through the Telecom/Google Dialer stack, not the simulated-GSM
   layer; `adb shell input keyevent KEYCODE_ENDCALL` was needed instead.
3. **Tap-coordinate scaling** — screenshots are displayed to the assistant
   at a 900×2000 scale of the actual 1080×2400 device; several early taps
   used the displayed-scale numbers directly as device coordinates and
   landed in the wrong UI element (e.g. password text got typed into the
   email field) until corrected with the ×1.2 multiplier.
4. **`adb shell input text` word-splitting** — multi-word strings need
   `%s` in place of literal spaces, or only the first word is typed
   (discovered when "Test Client E2E" became just "Test").
5. **Properties-file backslash escaping** — a Bash heredoc silently
   collapsed doubled backslashes to single ones; fixed by writing the file
   directly and verifying raw bytes with `od -c` before proceeding.
6. **`java.util.Properties` unresolved in build.gradle.kts** — fixed via an
   explicit `import java.util.Properties` + bare `Properties()` constructor.
7. **Cursor-freeze / `'error'`-status test not live-triggerable** — same
   posture as the server-side Task 8 report; covered by `SyncPlannerTest`
   + code inspection only.

None of the above block sign-off — every one was caught, understood, and
either fixed or explicitly deferred with a documented reason.

## APK summary

| | |
|---|---|
| Path | `pyra-calls-app\app\build\outputs\apk\release\app-release.apk` |
| SHA-256 | `E4876F22A70B0AFD04B765316CD5A55348C99D7BD8483E060B47D320385BBA75` |
| Signing cert | `CN=Pyramedia X, O=Pyramedia, C=AE` |
| Keystore | `C:\Users\engmo\pyra-keys\pyra-calls-release.keystore` (backup this!) |
| Keystore password | `<REDACTED - stored only in C:\Users\engmo\pyra-keys\signing.properties>` (also in `signing.properties`) |

## Final-review fixes (2026-07-10, post-final-review pass)

Applied the 5-item fix list from the final whole-app review. Surgical
changes only — no behavior outside the listed items touched.

### Diffs summary

1. **`AndroidManifest.xml`** — `<application>` gained
   `android:allowBackup="false"`. Prevents Auto Backup/Smart Switch from
   restoring the encrypted-prefs file onto a new phone without the original
   Keystore master key, which previously would have crash-looped
   `EncryptedSharedPreferences.create()` at `Application` startup.

2. **`data/AppPrefs.kt`** — added `var lastLoginUsername: String?` (key
   `last_login_username`), deliberately **not** removed by `clearSession()`
   so it survives a logout.

3. **`ui/MainActivity.kt`** (login-success callback) — agent-handover
   guard: if `prefs.lastLoginUsername` is set and differs from the newly
   logged-in `data.username`, `installDayStartMillis` is pinned to
   `System.currentTimeMillis()` (not day-start) instead of the normal
   `if (installDayStartMillis == 0L) dayStart` path — stops a new agent's
   first sync from re-ingesting the previous agent's same-day calls under
   the new agent's name (would have double-counted + re-notified).
   `prefs.lastLoginUsername = data.username` is set unconditionally after.

4. **`notify/IgnoreReceiver.kt`** — `Notifier.cancel()` now fires only when
   `api.ignore(key)` returns `ApiResult.Ok` or `ApiResult.Err` (both mean
   the prompt is obsolete — success or a 409 already-linked). On
   `ApiResult.NetworkError` the notification is left in place so the agent
   can retry the tap once connectivity returns (was: unconditional cancel
   regardless of outcome, silently losing ignore actions taken offline).

5. **`ui/LoginScreen.kt`** — password `OutlinedTextField` gained
   `keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)`
   (imports already present), so third-party IMEs don't get a chance to
   learn/suggest the credential.

6. **`docs/CALL-TRACKING.md`** — added step 7 to the per-phone provisioning
   checklist (clear app data / reinstall before reassigning a phone to a
   different agent, belt-and-braces on top of the code guard) and 6 new
   Android-side items + 1 documented-deviation note to the `## v1.1
   backlog` section (SyncWorker 5xx/auth discrimination, 401 self-logout +
   server-side key revoke, debug-only cleartext network-security-config,
   expedited-WorkManager ignore POST, notification-ID namespacing,
   security-crypto alpha migration, and the silent-409-handling deviation
   note).

`pyra-calls-app/app/build.gradle.kts` was **not** touched — no build
config changes were needed for this fix bundle.

### Verification

```
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot"
cd pyra-calls-app
.\gradlew.bat testDebugUnitTest assembleDebug
→ BUILD SUCCESSFUL in 15s (43 actionable tasks: 12 executed, 31 up-to-date)
```

Test suites (10 tests, 0 failures, 0 errors, 0 skipped):

| Suite | Tests |
|---|---|
| `cloud.pyramedia.calls.core.CallMappingTest` | 2 |
| `cloud.pyramedia.calls.core.DubaiTimeTest` | 3 |
| `cloud.pyramedia.calls.core.PayloadsTest` | 2 |
| `cloud.pyramedia.calls.core.SyncPlannerTest` | 3 |

Rebuilt the signed release APK:

```
.\gradlew.bat assembleRelease
→ BUILD SUCCESSFUL in 14s (50 actionable tasks: 13 executed, 37 up-to-date)
```

| | |
|---|---|
| Path | `pyra-calls-app\app\build\outputs\apk\release\app-release.apk` |
| **New SHA-256** | `0ABC8CC4676139B49A3870ABA415D7B20213374F1C1A99F5EEDC167CED10F3E4` |
| Signing cert | unchanged (`CN=Pyramedia X, O=Pyramedia, C=AE`) — same keystore reused, only app content changed |

**Emulator smoke test was NOT run** (emulator was shut down after App Task
7's E2E pass, per this task's instructions). The 3 behavioral changes
(handover guard, ignore-retry-on-network-error, allowBackup) are
trace-verified by code inspection instead:
- `allowBackup="false"` — a manifest attribute, verified present in the
  merged manifest output of `processReleaseMainManifest` (build succeeded
  with no manifest-merge conflicts).
- Handover guard — traced the `MainActivity` login-callback branch by
  inspection; `AppPrefsTest`-style coverage doesn't exist for this class
  (it's UI-layer, not part of the pure-`core` unit-test target) — no
  regression in the 10 existing unit tests, which don't touch this path.
- Ignore-retry — traced `IgnoreReceiver`'s new conditional against the
  3-case `ApiResult` sealed class (`Ok`/`Err`/`NetworkError`); compiles
  clean (the `is ApiResult.Ok || is ApiResult.Err` check is exhaustive by
  construction, `NetworkError` falls through to the implicit no-op).

No secrets or password values are recorded in this report.

