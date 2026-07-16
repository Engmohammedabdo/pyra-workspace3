# Pyra Calls v1.2 — Self-Update + Error Tracking + Session Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship app v1.2 (versionCode 2) with in-app self-update (no more phone-to-phone manual installs), remote error tracking into the existing `pyra_error_logs` admin console, and a fix for the recurring "logged out by itself" complaint.

**Architecture:** Server gains a `pyra_app_releases` table (APKs stored in the private `pyra-private` bucket, served via device-authenticated signed URLs) + three `/api/mobile/*` endpoints (version check, download, error ingest) + a local publish script. The app migrates session storage off the deprecated `EncryptedSharedPreferences` (root cause of silent session loss) onto plain `SharedPreferences`, adds a file-backed error queue shipped during sync, an unused-app-hibernation exemption step, and a notification-driven update flow (download → SHA-256 verify → system installer).

**Tech Stack:** Next.js 15 App Router + Supabase (server) · Kotlin/Compose, OkHttp, WorkManager, minSdk 26 / target 34 (app) · tsx script for publishing.

## Global Constraints

- Package manager is **pnpm** (never npm). Workspace verify: `pnpm run check` + `pnpm build`. App verify: `.\gradlew.bat test` + `.\gradlew.bat assembleDebug` from `pyra-calls-app\`.
- Git: commit per task on branch `integrate-pending-fixes`; push with `git push origin HEAD:integrate-pending-fixes`. **NEVER push to `origin/main`** — that deploys production; it happens only when Abdou says «ادمج».
- Concurrent sessions may commit to this repo: NEVER `git add -A`/`git add .` — stage exact paths only. Review packages are scoped `SHA~1..SHA`.
- Migrations: UTF-8 `.sql` file via `pnpm db:query supabase/migrations/<file>.sql` → manually verify schema → `pnpm db:record <version> --by=claude --notes="…"`. New tables get `REVOKE ALL PRIVILEGES … FROM anon, authenticated;` (Gap #3 doctrine).
- API routes: gate first (`requireDeviceAuth` for `/api/mobile/*`), THEN `createServiceRoleClient()`. Responses via `apiSuccess()`/`apiError()`/`apiServerError()`. `logError()` in catch blocks. Storage: **`storage_path` never leaves the server** — clients get signed URLs only (1h TTL).
- **Never guess column names** — check `information_schema.columns` before writing queries against `pyra_*` tables.
- App UI strings: Arabic, ALL in `app/src/main/res/values/strings.xml` (no hardcoded literals in Kotlin).
- Supabase JS builders are lazy — every query must be `await`ed or `.then()`d; always check `{ error }`.
- Secrets: service-role key read from `.env.local` ONLY (file read, never process.env / CLI args). Keystore stays at `C:\Users\engmo\pyra-keys\` — its password must NEVER appear in any tracked file (this bit us once).
- SDD ledger: append per-task entries to `.superpowers/sdd/progress.md` (committed).

## Context an implementer must know

- App sources: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/` — packages `core/` (pure, unit-tested), `data/`, `sync/`, `notify/`, `ui/`.
- Both APK builds currently in the field are `versionCode 1`. This release is `versionCode 2`, `versionName "1.2.0"`.
- `ApiClient` (data/ApiClient.kt) has private `get`/`post` helpers returning `ApiResult` (`Ok`/`Err(code,message)`/`NetworkError`); payload DTOs live in `core/Payloads.kt` with `PyraJson` (`ignoreUnknownKeys`, `explicitNulls=false`); envelope is `{data}`/`{error}`.
- `SyncWorker` (sync/SyncWorker.kt) runs every 15 min + after each call; empty pass does `api.ping()`. `requireDeviceAuth` (app/api/mobile/_lib/device-auth.ts) wraps `getExternalAuth` (lib/api/external-auth.ts) which bumps `pyra_api_keys.last_used_at` fire-and-forget.
- `BuildConfig.BASE_URL`: debug → `http://10.0.2.2:3000` (local dev server), release → `https://workspace.pyramedia.cloud`.
- Release channel isolation (NEW in this plan): debug builds use channel `pyra-calls-e2e`, release builds use `pyra-calls`. E2E test releases are published under the e2e channel so **real phones can never see a test APK** (they poll the prod DB every sync cycle).

---

### Task S1: Migration 038 — `pyra_app_releases` + `pyra_api_keys.app_version_code`

**Files:**
- Create: `supabase/migrations/038_app_releases.sql`

**Interfaces:**
- Produces: table `pyra_app_releases(id, app, version_code, version_name, storage_path, sha256, size_bytes, release_notes, is_active, created_by, created_at)`; column `pyra_api_keys.app_version_code integer NULL`. Single-active-per-app enforced by partial unique index.

- [ ] **Step 1: Write the migration file**

```sql
-- 038_app_releases.sql
-- App self-update infrastructure for the Pyra Calls Android app.
-- Plan: docs/superpowers/plans/2026-07-16-calls-app-v12-selfupdate-observability.md
-- Service-role-only (Gap #3 doctrine). APK binaries live in the private
-- `pyra-private` bucket; `storage_path` NEVER leaves the server (signed URLs only).

CREATE TABLE IF NOT EXISTS pyra_app_releases (
  id            text PRIMARY KEY,
  app           text NOT NULL DEFAULT 'pyra-calls'
                CHECK (app IN ('pyra-calls', 'pyra-calls-e2e')),
  version_code  integer NOT NULL CHECK (version_code > 0),
  version_name  text NOT NULL,
  storage_path  text NOT NULL,
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes    bigint NOT NULL CHECK (size_bytes > 0),
  release_notes text NULL,
  is_active     boolean NOT NULL DEFAULT false,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pyra_app_releases_app_code_uniq UNIQUE (app, version_code)
);

-- exactly ONE active release per app (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_releases_one_active
  ON pyra_app_releases (app) WHERE is_active;

-- device fleet version visibility: stamped by requireDeviceAuth from the
-- x-app-version header the app sends on every request
ALTER TABLE pyra_api_keys ADD COLUMN IF NOT EXISTS app_version_code integer NULL;

REVOKE ALL PRIVILEGES ON TABLE pyra_app_releases FROM anon, authenticated;
```

- [ ] **Step 2: Run it against prod**

Run: `pnpm db:query supabase/migrations/038_app_releases.sql`
Expected: success, no rows.

- [ ] **Step 3: Verify schema (apply-then-verify-then-record)**

Run: `pnpm db:query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pyra_app_releases' ORDER BY ordinal_position"`
Expected: the 11 columns above.
Run: `pnpm db:query "SELECT column_name FROM information_schema.columns WHERE table_name = 'pyra_api_keys' AND column_name = 'app_version_code'"`
Expected: 1 row.
Run: `pnpm db:query "SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = 'pyra_app_releases' AND grantee IN ('anon','authenticated')"`
Expected: 0 rows.

- [ ] **Step 4: Record**

Run: `pnpm db:record 038_app_releases --by=claude --notes="app self-update: releases table + api_keys.app_version_code"`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/038_app_releases.sql
git commit -m "feat(mobile): migration 038 - app releases table + device app_version_code"
```

---

### Task S2: Mobile endpoints — app-version, app-download, log-error + version stamping

**Files:**
- Create: `app/api/mobile/app-version/route.ts`
- Create: `app/api/mobile/app-download/route.ts`
- Create: `app/api/mobile/log-error/route.ts`
- Modify: `app/api/mobile/_lib/device-auth.ts` (version stamping)
- Modify: `docs/CALL-TRACKING.md` (contract section — add the 3 endpoints + x-app-version header)

**Interfaces:**
- Consumes: `pyra_app_releases` from S1; `requireDeviceAuth` returning `{agentUsername, displayName}`; `logError({severity?, error, request?, metadata?})` from `lib/observability/log-error.ts` (READ that file first to confirm the exact severity union — do not guess).
- Produces (device-authed, all under existing `/api/mobile` middleware exemption):
  - `GET /api/mobile/app-version?app=` → `apiSuccess({ latest: { version_code, version_name, release_notes } | null })`
  - `GET /api/mobile/app-download?app=` → `apiSuccess({ url, version_code, sha256, size_bytes })` (1h signed URL)
  - `POST /api/mobile/log-error` body `{ errors: [{ message, stack?, source, severity?, occurred_at?, android_version?, app_version_code? }] }` (≤20) → `apiSuccess({ received })`
  - `requireDeviceAuth` additionally stamps `pyra_api_keys.app_version_code` from the `x-app-version` header (fire-and-forget, write only on change).

- [ ] **Step 1: Shared channel helper + app-version route**

`app/api/mobile/app-version/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { logError } from '@/lib/observability/log-error';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Release channels: real phones (release builds) are hard-wired to
// 'pyra-calls'; debug/emulator builds use 'pyra-calls-e2e' so E2E test
// releases can never be offered to the production fleet.
export const APP_CHANNELS = ['pyra-calls', 'pyra-calls-e2e'] as const;
export function resolveChannel(request: NextRequest): string {
  const app = request.nextUrl.searchParams.get('app') ?? 'pyra-calls';
  return (APP_CHANNELS as readonly string[]).includes(app) ? app : 'pyra-calls';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;

    const svc = createServiceRoleClient();
    const { data: release, error } = await svc
      .from('pyra_app_releases')
      .select('version_code, version_name, release_notes')
      .eq('app', resolveChannel(request))
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      logError({ error, request, metadata: { action: 'mobile_app_version' } });
      return apiServerError();
    }
    return apiSuccess({ latest: release ?? null });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_app_version' } });
    return apiServerError();
  }
}
```

Note: if Next.js complains about exporting non-handlers from a route file (it does — route files may only export HTTP methods and route config), move `APP_CHANNELS`/`resolveChannel` into `app/api/mobile/_lib/app-channel.ts` and import from both routes. Prefer that from the start.

- [ ] **Step 2: app-download route**

`app/api/mobile/app-download/route.ts` — same auth + channel resolution, then:

```ts
    const svc = createServiceRoleClient();
    const { data: release, error } = await svc
      .from('pyra_app_releases')
      .select('version_code, storage_path, sha256, size_bytes')
      .eq('app', resolveChannel(request))
      .eq('is_active', true)
      .maybeSingle();
    if (error) { /* logError + apiServerError as above */ }
    if (!release) return apiError('لا يوجد إصدار متاح', 404);

    const { data: signed, error: signErr } = await svc.storage
      .from('pyra-private')
      .createSignedUrl(release.storage_path, 3600);
    if (signErr || !signed?.signedUrl) {
      logError({ error: signErr ?? new Error('empty signedUrl'), request, metadata: { action: 'mobile_app_download' } });
      return apiServerError();
    }
    // storage_path intentionally NOT returned
    return apiSuccess({
      url: signed.signedUrl,
      version_code: release.version_code,
      sha256: release.sha256,
      size_bytes: release.size_bytes,
    });
```

Check an existing signed-URL route (`app/api/my-documents/*`) to confirm `createSignedUrl` returns an absolute URL in this project before assuming.

- [ ] **Step 3: log-error ingest route**

`app/api/mobile/log-error/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { logError } from '@/lib/observability/log-error';

const MAX_BATCH = 20;
const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;
// severity values MUST match lib/observability/log-error.ts — verify by reading it
const SEVERITIES = new Set(['error', 'warning', 'info']);

export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => null);
    const errors = Array.isArray(body?.errors) ? body.errors : null;
    if (!errors || errors.length === 0) return apiError('errors مطلوبة', 422);
    if (errors.length > MAX_BATCH) return apiError(`الحد الأقصى ${MAX_BATCH} خطأ في الدفعة`, 422);

    let received = 0;
    for (const e of errors) {
      if (typeof e?.message !== 'string' || !e.message.trim()) continue;
      const severity = SEVERITIES.has(e.severity) ? e.severity : 'error';
      logError({
        severity,
        error: new Error(`[pyra-calls-app] ${String(e.message).slice(0, MAX_MESSAGE)}`),
        request,
        metadata: {
          action: 'mobile_app_error',
          source: 'pyra-calls-app',
          app_source: typeof e.source === 'string' ? e.source.slice(0, 60) : 'unknown',
          agent: auth.agentUsername,
          stack: typeof e.stack === 'string' ? e.stack.slice(0, MAX_STACK) : undefined,
          occurred_at: typeof e.occurred_at === 'string' ? e.occurred_at.slice(0, 40) : undefined,
          android_version: typeof e.android_version === 'string' ? e.android_version.slice(0, 40) : undefined,
          app_version_code: Number.isInteger(e.app_version_code) ? e.app_version_code : undefined,
        },
      });
      received++;
    }
    return apiSuccess({ received });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_log_error' } });
    return apiServerError();
  }
}
```

Before finalizing: Read `lib/observability/log-error.ts` and confirm (a) the severity union, (b) that `logError` is sync/void fire-and-forget, (c) metadata shape. Adjust if reality differs.

- [ ] **Step 4: version stamping in device-auth**

In `app/api/mobile/_lib/device-auth.ts`, `requireDeviceAuth` currently discards the key id. Capture it and stamp the version header after the user-status gate passes:

```ts
  // Fleet visibility: stamp the app version the device reports.
  // Fire-and-forget; .neq() makes repeat requests with an unchanged
  // version a no-op write.
  const versionHeader = request.headers.get('x-app-version');
  const versionCode = versionHeader ? parseInt(versionHeader, 10) : NaN;
  if (Number.isInteger(versionCode) && versionCode > 0 && versionCode < 100000) {
    svc
      .from('pyra_api_keys')
      .update({ app_version_code: versionCode })
      .eq('id', ctx.apiKey.id)
      .neq('app_version_code', versionCode)
      .then(() => {});
  }
```

- [ ] **Step 5: Verify + docs + commit**

Run: `pnpm run check` → 0 errors. Run: `pnpm build` → success.
Update `docs/CALL-TRACKING.md`: add the 3 endpoints to the API contract table (auth = device key, channel param semantics, batch caps) + document the `x-app-version` header.

```bash
git add app/api/mobile/app-version app/api/mobile/app-download app/api/mobile/log-error app/api/mobile/_lib docs/CALL-TRACKING.md
git commit -m "feat(mobile): app-version/app-download/log-error endpoints + device version stamping"
git push origin HEAD:integrate-pending-fixes
```

---

### Task S3: Publish script — `pnpm app:publish`

**Files:**
- Create: `scripts/publish-app-release.ts`
- Modify: `package.json` (add `"app:publish": "npx tsx scripts/publish-app-release.ts"` to scripts)

**Interfaces:**
- Consumes: `pyra_app_releases` (S1). `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (file-read pattern copied from `scripts/db-record-migration.ts`).
- Produces: CLI — `pnpm app:publish <apk-path> [--notes "..."] [--app pyra-calls|pyra-calls-e2e] [--code N --name X]` and `pnpm app:publish --activate <version_code> [--app ...]` (rollback/reactivate mode).

- [ ] **Step 1: Write the script**

Behavior (single file, ~200 lines, follow `scripts/db-record-migration.ts` conventions for env reading and error output):

1. Parse args. `--app` defaults to `pyra-calls`.
2. **Version detection:** locate `aapt2.exe` — scan `%LOCALAPPDATA%\Android\Sdk\build-tools\*\aapt2.exe` (pick highest version dir; also honor `ANDROID_HOME` if set). Run `aapt2 dump badging <apk>` and parse `versionCode='(\d+)' versionName='([^']+)'`. If aapt2 is missing, require explicit `--code` + `--name` and print how to install build-tools.
3. Compute SHA-256 (`node:crypto`, stream) + `size_bytes` of the APK.
4. Fetch current active release for the app (Supabase REST via `fetch` with service key headers `apikey` + `Authorization: Bearer`). Refuse publish when `version_code <= active.version_code` (message shows both). `--activate N` mode skips upload: verifies the row exists, deactivates current, activates row N, exits.
5. Upload: `POST {SUPABASE_URL}/storage/v1/object/pyra-private/app-releases/{app}/{version_code}-{sha256.slice(0,8)}.apk` with body = file buffer, headers `Content-Type: application/vnd.android.package-archive`, `x-upsert: false`. Non-2xx → abort with response text.
6. Deactivate current active (`PATCH .../rest/v1/pyra_app_releases?app=eq.{app}&is_active=is.true` body `{"is_active":false}`), then insert the new row with `is_active: true`, `id` = `rel_` + 16 chars of `crypto.randomBytes` base36, `created_by` = `--by` arg or `'abdou'`.
7. Print a summary block: app, version_code/name, sha256, size (MB), storage path, notes — and remind: «الأجهزة هتشوف التحديث خلال ٦ ساعات كحد أقصى».

Failure ordering matters: upload BEFORE deactivating the current row — if upload fails, the fleet keeps a valid active release. If the insert fails after deactivation, print the exact `--activate` command to restore the previous version.

- [ ] **Step 2: Dry-run against the e2e channel**

Build any small valid APK later in A5 — for now verify arg parsing + env reading + aapt2 detection with `pnpm app:publish --activate 999 --app pyra-calls-e2e` → expect clean error `لا يوجد إصدار بهذا الرقم` (proves DB round-trip works). Do NOT publish anything to `pyra-calls` in this task.

- [ ] **Step 3: Commit**

```bash
git add scripts/publish-app-release.ts package.json
git commit -m "feat(mobile): app release publish script (pnpm app:publish)"
git push origin HEAD:integrate-pending-fixes
```

---

### Task A1: Session storage fix — plain prefs + one-time migration + loss tripwire

**Files:**
- Modify: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/data/AppPrefs.kt`
- Modify: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/MainActivity.kt`
- Modify: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/HomeScreen.kt` (logout callback sets tripwire off — only if logout logic lives there; otherwise MainActivity)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AppPrefs` API unchanged (`deviceKey`, `username`, `displayName`, `deviceId`, `lastSyncedCallLogId`, `installDayStartMillis`, `lastSyncAtMillis`, `lastLoginUsername`, `isLoggedIn()`, `clearSession()`) PLUS `var wasLoggedIn: Boolean`, `fun consumeSessionLossEvent(): Boolean`, and new prefs keys used by later tasks: `lastUpdateCheckAtMillis`, `lastUpdateNotifiedCode`, `lastUpdateNotifiedAtMillis` (plain `Long`/`Int` accessors, default 0).

**Why:** `EncryptedSharedPreferences` (deprecated by Google, we're on `1.1.0-alpha06`) is the prime suspect for the field-reported random logouts: when its Keystore-backed keyset degrades, reads silently return `null` — exactly a "lost session". Device key risk profile tolerates plain app-sandbox storage: key is scoped (`calls:device`), server-revocable, and the phone is company property.

- [ ] **Step 1: Rewrite AppPrefs on plain SharedPreferences with migration**

```kotlin
class AppPrefs(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("pyra_calls_prefs", Context.MODE_PRIVATE)

    init { migrateFromEncrypted(context) }

    private fun migrateFromEncrypted(context: Context) {
        if (prefs.getBoolean("migrated_from_encrypted", false)) return
        try {
            val old = EncryptedSharedPreferences.create(
                context, "pyra_calls_secure",
                MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
            val e = prefs.edit()
            old.getString("device_key", null)?.let { e.putString("device_key", it) }
            old.getString("username", null)?.let { e.putString("username", it) }
            old.getString("display_name", null)?.let { e.putString("display_name", it) }
            old.getString("device_id", null)?.let { e.putString("device_id", it) }
            old.getString("last_login_username", null)?.let { e.putString("last_login_username", it) }
            if (old.contains("last_synced_call_log_id"))
                e.putLong("last_synced_call_log_id", old.getLong("last_synced_call_log_id", 0L))
            if (old.contains("install_day_start_millis"))
                e.putLong("install_day_start_millis", old.getLong("install_day_start_millis", 0L))
            if (old.contains("last_sync_at_millis"))
                e.putLong("last_sync_at_millis", old.getLong("last_sync_at_millis", 0L))
            if (old.getString("device_key", null) != null) e.putBoolean("was_logged_in", true)
            e.putBoolean("migrated_from_encrypted", true).apply()
            context.deleteSharedPreferences("pyra_calls_secure")
        } catch (t: Throwable) {
            // Encrypted store unreadable — the exact failure mode we're escaping.
            // Nothing to carry over; mark done so we never retry, and flag the
            // loss so MainActivity reports it once the error queue exists (A2).
            prefs.edit()
                .putBoolean("migrated_from_encrypted", true)
                .putBoolean("pending_migration_loss_report", true)
                .apply()
        }
    }
    // ... all existing accessors verbatim, plus:
    var wasLoggedIn: Boolean
        get() = prefs.getBoolean("was_logged_in", false)
        set(v) = prefs.edit().putBoolean("was_logged_in", v).apply()
}
```

Rules: keep `deviceId` generation + `clearSession()` key list EXACTLY as today (`clearSession` must NOT remove `device_id`, `last_login_username`, `was_logged_in` handling: explicit logout sets `wasLoggedIn=false` in the logout callback, not inside `clearSession`, so abnormal loss remains detectable). Add the three update-related Long/Int accessors (used by A4). **Do NOT remove the security-crypto dependency** — the migration needs it; removal is a v1.3 item.

- [ ] **Step 2: Tripwire in MainActivity**

In `onCreate` before `setContent`: if `!prefs.isLoggedIn() && prefs.wasLoggedIn` → enqueue a `session_lost` error event (A2's ErrorQueue — if A2 not merged yet, leave a `// A2 wires ErrorQueue here` seam and set `wasLoggedIn=false`). On successful login callback: `prefs.wasLoggedIn = true`. In the logout callback (`HomeScreen` onLogout lambda in MainActivity): `prefs.wasLoggedIn = false` before `clearSession()`.

- [ ] **Step 3: Unit-check + build**

Run: `cd pyra-calls-app; .\gradlew.bat assembleDebug` → BUILD SUCCESSFUL. (AppPrefs is Android-bound; behavior verified on-device in A5's upgrade-in-place test.)

- [ ] **Step 4: Commit**

```bash
git add pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/data/AppPrefs.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/MainActivity.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/HomeScreen.kt
git commit -m "fix(app): migrate session storage off EncryptedSharedPreferences + session-loss tripwire"
```

---

### Task A2: Error queue + crash handler + shipping + x-app-version header

**Files:**
- Create: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/ErrorQueueLogic.kt` (pure)
- Create: `pyra-calls-app/app/src/test/java/cloud/pyramedia/calls/core/ErrorQueueLogicTest.kt`
- Create: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/data/ErrorQueue.kt`
- Modify: `core/Payloads.kt`, `data/ApiClient.kt`, `PyraCallsApp.kt`, `sync/SyncWorker.kt`, `ui/MainActivity.kt` (session_lost + migration-loss seams), `ui/QuickAddActivity.kt` + `notify/IgnoreReceiver.kt` (Err catch points)

**Interfaces:**
- Consumes: `POST /api/mobile/log-error` contract from S2; `AppPrefs` from A1 (`pending_migration_loss_report` flag).
- Produces:
  - `@Serializable data class ErrorEvent(val message: String, val stack: String? = null, val source: String, val severity: String = "error", val occurred_at: String, val android_version: String, val app_version_code: Int)`
  - `ErrorQueueLogic.shouldEnqueue(existing: List<ErrorEvent>, candidate: ErrorEvent): Boolean` (dedupe: same `source`+`message` on the same Dubai day → false)
  - `ErrorQueueLogic.cap(lines: List<String>, max: Int = 50): List<String>` (keep newest)
  - `ErrorQueue(context)` — `enqueue(message, source, severity = "error", stack: String? = null)`, `snapshot(): List<ErrorEvent>` (≤20), `removeShipped(n: Int)`
  - `ApiClient.logErrors(events: List<ErrorEvent>): ApiResult<LogErrorData>`; ALL requests now send header `x-app-version`.

- [ ] **Step 1: TDD the pure logic**

Write `ErrorQueueLogicTest` first — cases: dedupe same source+message same Dubai day → false; different day → true; different message → true; cap keeps newest 50 (input 55 → first 5 dropped); Dubai day derived via existing `DubaiTime` helper (reuse — do not duplicate offset math).
Run: `cd pyra-calls-app; .\gradlew.bat test` → new tests FAIL (missing class), then implement `ErrorQueueLogic`, re-run → PASS.

- [ ] **Step 2: File-backed queue**

`ErrorQueue`: file `File(context.filesDir, "error-queue.jsonl")`. `enqueue` — parse existing lines (`runCatching` per line, drop corrupt), build candidate `ErrorEvent(message.take(500), stack?.take(8000), source, severity, occurred_at = ISO now, android_version = "android-" + Build.VERSION.RELEASE + "/sdk" + Build.VERSION.SDK_INT, app_version_code = BuildConfig.VERSION_CODE)`, apply `shouldEnqueue`, append + `cap`, write atomically (write temp file → rename). All IO wrapped in `runCatching` — the error logger must NEVER throw. `synchronized(ErrorQueue::class.java)` around read-modify-write (worker + UI threads).

- [ ] **Step 3: Payloads + ApiClient**

`Payloads.kt`: add `ErrorEvent`, `@Serializable data class LogErrorRequest(val errors: List<ErrorEvent>)`, `@Serializable data class LogErrorData(val received: Int)`.
`ApiClient`: constructor gains `private val appVersion: Int = BuildConfig.VERSION_CODE` (default arg — no call-site churn); both `get` and `post` builders add `.header("x-app-version", appVersion.toString())`; add `fun logErrors(events: List<ErrorEvent>) = post("/api/mobile/log-error", LogErrorRequest(events), LogErrorRequest.serializer(), LogErrorData.serializer(), withKey = true)`.

- [ ] **Step 4: Crash handler + catch points**

`PyraCallsApp.onCreate`:

```kotlin
val previous = Thread.getDefaultUncaughtExceptionHandler()
Thread.setDefaultUncaughtExceptionHandler { t, e ->
    runCatching {
        ErrorQueue(this).enqueue(
            message = e.toString().take(500),
            source = "crash",
            stack = e.stackTraceToString(),
        )
    }
    previous?.uncaughtException(t, e)
}
```

Catch points (each with a distinct `source`): `SyncWorker` `Err` branch → `sync_failed` message `"HTTP ${res.code}: ${res.message}"` (severity `"error"` for 5xx/401/403, `"warning"` otherwise) — enqueue BEFORE the existing `return Result.success()`; `QuickAddActivity` submit `Err` → `quick_add_failed` (warning); `IgnoreReceiver` `Err` → `ignore_failed` (warning); `MainActivity` tripwire → `session_lost` (error) + the A1 `pending_migration_loss_report` flag → `session_migration_failed` (error, then clear flag). NetworkError is NEVER enqueued (by design — offline is normal, the silent-device cron owns liveness).

- [ ] **Step 5: Ship during sync**

`SyncWorker.doWork` — after the main while-loop concludes successfully (both the empty-pass `break` and the paged path), add:

```kotlin
val queue = ErrorQueue(applicationContext)
val pending = queue.snapshot()
if (pending.isNotEmpty() && api.logErrors(pending) is ApiResult.Ok) {
    queue.removeShipped(pending.size)
}
```

Failure → keep lines, next cycle retries. No retry escalation, no new Result semantics.

- [ ] **Step 6: Test + build + commit**

Run: `.\gradlew.bat test` → PASS; `.\gradlew.bat assembleDebug` → SUCCESS.

```bash
git add pyra-calls-app/app/src/main pyra-calls-app/app/src/test
git commit -m "feat(app): file-backed error queue + crash handler + sync shipping + x-app-version"
```

---

### Task A3: Unused-app hibernation exemption step

**Files:**
- Modify: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/PermissionsScreen.kt`
- Modify: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/HomeScreen.kt`
- Modify: `pyra-calls-app/app/src/main/res/values/strings.xml`
- Maybe modify: `pyra-calls-app/gradle/libs.versions.toml` + `app/build.gradle.kts` (only if `androidx.concurrent:concurrent-futures` isn't already transitively available for the ListenableFuture callback — try without first)

**Interfaces:**
- Consumes: `PackageManagerCompat.getUnusedAppRestrictionsStatus(context)` + `IntentCompat.createManageUnusedAppRestrictionsIntent(context, packageName)` from androidx.core 1.15 (already a dependency).
- Produces: a reusable `@Composable fun rememberUnusedAppRestrictionsEnabled(): State<Boolean>` in PermissionsScreen.kt consumed by both screens.

**Why:** Android 11+ auto-revokes runtime permissions (READ_CALL_LOG!) and pauses apps the user doesn't OPEN — and agents never open this app by hand. This is logout-report suspect #2 and a silent data-loss vector.

- [ ] **Step 1: Status helper + Permissions step**

Helper: query `getUnusedAppRestrictionsStatus` (ListenableFuture — `.addListener({...}, ContextCompat.getMainExecutor(context))`); map `API_30_BACKPORT/API_30/API_31` → enabled=true, `DISABLED/FEATURE_NOT_AVAILABLE/ERROR` → false. In `PermissionsScreen`, after the runtime-permission cards add a card shown only when enabled=true: title `@string/hibernation_title` («مهم: منع الإيقاف التلقائي»), body `@string/hibernation_body` («أندرويد بيوقف التطبيقات اللي مش بتتفتح ويسحب صلاحياتها — ده بيقطع تسجيل المكالمات. اضغط وعطّل "إيقاف نشاط التطبيق مؤقتًا".»), button `@string/hibernation_button` («فتح الإعداد») launching the intent via `rememberLauncherForActivityResult(StartActivityForResult)` then re-querying status. The step is advisory: it must NOT block `onAllGranted` (employees can proceed), but the card stays visible until disabled.

- [ ] **Step 2: Home warning chip**

`HomeScreen`: when restrictions still enabled, show an amber warning row with the same button — status can regress after OS updates, so Home keeps nagging gently.

- [ ] **Step 3: Build + commit**

Run: `.\gradlew.bat assembleDebug` → SUCCESS (emulator behavior verified in A5).

```bash
git add pyra-calls-app/app/src/main
git commit -m "feat(app): unused-app hibernation exemption step + home warning"
```

---

### Task A4: Self-update — check, notify, download, verify, install

**Files:**
- Create: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/UpdatePolicy.kt` (pure)
- Create: `pyra-calls-app/app/src/test/java/cloud/pyramedia/calls/core/UpdatePolicyTest.kt`
- Create: `pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/UpdateActivity.kt`
- Create: `pyra-calls-app/app/src/main/res/xml/file_paths.xml`
- Modify: `core/Payloads.kt`, `data/ApiClient.kt`, `notify/Notifier.kt`, `sync/SyncWorker.kt`, `ui/HomeScreen.kt`, `AndroidManifest.xml`, `app/build.gradle.kts` (versionCode 2 / versionName "1.2.0" / APP_CHANNEL buildConfigField), `res/values/strings.xml`

**Interfaces:**
- Consumes: S2 endpoints; `AppPrefs` update-throttle accessors from A1; `ErrorQueue` from A2 (update failures → `update_failed`).
- Produces:
  - `UpdatePolicy.shouldCheck(nowMillis, lastCheckMillis): Boolean` (≥ 6h)
  - `UpdatePolicy.shouldNotify(latestCode, currentCode, lastNotifiedCode, lastNotifiedAtMillis, nowMillis): Boolean` (newer AND (new code OR ≥ 24h since last nag))
  - `ApiClient.appVersion(): ApiResult<AppVersionData>` / `appDownload(): ApiResult<AppDownloadData>` — both append `?app=` + `BuildConfig.APP_CHANNEL`
  - `Notifier.showUpdate(context, versionName)` on new channel `CHANNEL_UPDATES`
  - `UpdateActivity` — full download→verify→install flow.

- [ ] **Step 1: Gradle — version bump + channel field**

`defaultConfig`: `versionCode = 2`, `versionName = "1.2.0"`. Build types: debug adds `buildConfigField("String", "APP_CHANNEL", "\"pyra-calls-e2e\"")`, release adds `buildConfigField("String", "APP_CHANNEL", "\"pyra-calls\"")`. **The channel isolation is load-bearing:** it's what lets A5 publish throwaway test releases without the 3 production phones ever seeing them.

- [ ] **Step 2: TDD UpdatePolicy**

Tests: not-yet-6h → shouldCheck false; ≥6h → true; latest ≤ current → shouldNotify false; newer + never notified → true; newer + same code notified 2h ago → false; newer + same code notified 25h ago → true; newer + different code notified 1min ago → true. FAIL → implement → PASS.

- [ ] **Step 3: Payloads + ApiClient**

```kotlin
@Serializable data class AppVersionInfo(val version_code: Int, val version_name: String, val release_notes: String? = null)
@Serializable data class AppVersionData(val latest: AppVersionInfo? = null)
@Serializable data class AppDownloadData(val url: String, val version_code: Int, val sha256: String, val size_bytes: Long)
```

`ApiClient`: `fun appVersion() = get("/api/mobile/app-version?app=" + BuildConfig.APP_CHANNEL, AppVersionData.serializer())`, same shape for `appDownload()`.

- [ ] **Step 4: Notifier + SyncWorker check**

`Notifier`: `CHANNEL_UPDATES` (IMPORTANCE_DEFAULT) in `ensureChannels`; `showUpdate(context, versionName)` — fixed notification id `9001`, content intent → `UpdateActivity`, title `@string/notif_update_title` («تحديث جديد لتطبيق Pyra Calls»), text `@string/notif_update_body` with the version name, autoCancel.
`SyncWorker` (end of successful `doWork`, after error shipping):

```kotlin
val now = System.currentTimeMillis()
if (UpdatePolicy.shouldCheck(now, prefs.lastUpdateCheckAtMillis)) {
    prefs.lastUpdateCheckAtMillis = now
    val v = api.appVersion()
    if (v is ApiResult.Ok) {
        val latest = v.data.latest
        if (latest != null && UpdatePolicy.shouldNotify(
                latest.version_code, BuildConfig.VERSION_CODE,
                prefs.lastUpdateNotifiedCode, prefs.lastUpdateNotifiedAtMillis, now)) {
            Notifier.showUpdate(applicationContext, latest.version_name)
            prefs.lastUpdateNotifiedCode = latest.version_code
            prefs.lastUpdateNotifiedAtMillis = now
        }
    }
}
```

- [ ] **Step 5: UpdateActivity**

Compose screen (RTL like MainActivity): state machine `Idle → Downloading(progress) → Verifying → ReadyToInstall → Failed(msg)`. Flow on button press (IO coroutine):
1. `api.appDownload()` → Err/NetworkError → Failed (Arabic strings from strings.xml) + `ErrorQueue.enqueue(source="update_failed", ...)`.
2. Clear + recreate `File(cacheDir, "updates")`; OkHttp GET `data.url` (plain request, NO x-api-key — it's a signed URL), stream to `update-{version_code}.apk` updating progress from `size_bytes`.
3. Verify streaming SHA-256 equals `data.sha256` (case-insensitive) — mismatch → delete file + Failed + enqueue.
4. Guard: `packageManager.getPackageArchiveInfo(file.path, 0)` → `PackageInfoCompat.getLongVersionCode(it) > BuildConfig.VERSION_CODE.toLong()` else Failed («النسخة المحمّلة ليست أحدث») — prevents an update loop if a stale APK ever gets published.
5. If `!packageManager.canRequestPackageInstalls()` → launcher for `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` with `Uri.parse("package:$packageName")`, on return re-check and continue.
6. Install: `FileProvider.getUriForFile(this, "$packageName.fileprovider", file)` → `ACTION_VIEW` + `application/vnd.android.package-archive` + `FLAG_GRANT_READ_URI_PERMISSION`.

`file_paths.xml`: `<cache-path name="updates" path="updates/" />`. Manifest: `<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />`, `<activity android:name=".ui.UpdateActivity" android:exported="false" />`, `<provider android:name="androidx.core.content.FileProvider" android:authorities="${applicationId}.fileprovider" android:exported="false" android:grantUriPermissions="true"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" /></provider>`.

- [ ] **Step 6: Home — version + manual check**

Footer row: `@string/home_version` («الإصدار %s») with `BuildConfig.VERSION_NAME` + button `@string/home_check_update` («التحقق من تحديث») → coroutine `api.appVersion()`: newer → `startActivity(UpdateActivity)`; current → snackbar/toast `@string/home_up_to_date` («أنت على أحدث نسخة»); failure → `@string/home_check_failed`.

- [ ] **Step 7: Test + build + commit**

Run: `.\gradlew.bat test` → PASS; `.\gradlew.bat assembleDebug` → SUCCESS.

```bash
git add pyra-calls-app
git commit -m "feat(app): self-update flow (check/notify/download/verify/install) + v1.2.0 bump"
git push origin HEAD:integrate-pending-fixes
```

---

### Task A5: E2E verification + final signed release + docs + ledger

**Files:**
- Modify: `docs/CALL-TRACKING.md` (release runbook + provisioning checklist additions), `.superpowers/sdd/progress.md`
- Produces: signed `app-release.apk` v1.2.0 (versionCode 2) + its SHA-256; the `pyra-calls` prod channel row published.

**Prereqs:** local dev server (`pnpm dev`) + Android emulator (same setup as the original E2E; debug builds point at `http://10.0.2.2:3000` and channel `pyra-calls-e2e`).

- [ ] **Step 1: Upgrade-in-place session test (the logout fix proof)**

1. `git stash` nothing — instead grab the PREVIOUS release APK (pre-v1.2, versionCode 1): rebuild it from the merge-base if not on disk, or use the existing signed `app-release.apk` if it predates this branch (verify with `aapt2 dump badging`).
2. `adb install -r <old.apk>` → open → login as `sayed@pyra.local` → verify Home shows logged-in.
3. Build v1.2 **release** (signed, same keystore): `.\gradlew.bat assembleRelease` → `adb install -r app-release.apk` → open.
4. Expected: STILL LOGGED IN (encrypted→plain migration carried the session). `adb shell run-as` is unavailable on release builds — verify behaviorally: Home shows the agent name without a login prompt.

- [ ] **Step 2: Full self-update flow on the e2e channel**

1. Temporarily set `versionCode = 99` (do NOT commit), `.\gradlew.bat assembleDebug`, restore gradle file. Keep `app-debug-99.apk`.
2. `pnpm app:publish <path-to-app-debug-99.apk> --app pyra-calls-e2e --notes "e2e"` → verify summary + DB row.
3. Install the NORMAL v1.2 debug build (versionCode 2) on the emulator, login, then force a sync (make a short call in the emulator dialer or wait for the 15-min tick / trigger via app open + `syncNow`). To bypass the 6h throttle for the test: use the Home «التحقق من تحديث» button.
4. Expected: notification/direct flow → UpdateActivity → progress → sha verified → system installer sheet → install → app reopens as versionCode 99 (debug signature matches debug signature).
5. Negative check: corrupt test — publish once with a wrong `--code`? Skip; instead verify the archive-version guard by attempting the update again WHILE already on 99: Home check → «أنت على أحدث نسخة».
6. Cleanup: `pnpm db:query "DELETE FROM pyra_app_releases WHERE app = 'pyra-calls-e2e'"` + remove the e2e APK object from storage (script prints the path; delete via storage REST or leave — bucket is private; prefer delete).

- [ ] **Step 3: Error pipeline E2E**

1. On the emulator (logged in as sayed, debug build): deactivate sayed's device key: `pnpm db:query "UPDATE pyra_api_keys SET is_active = false WHERE name LIKE 'device:sayed:%' AND is_active = true"`.
2. Trigger sync (call or app open) → SyncWorker gets 401 → `sync_failed` queued.
3. Reactivate the key (`SET is_active = true` same row) → trigger sync again → queue ships.
4. Verify: `pnpm db:query "SELECT severity, message, metadata->>'app_source' AS src, metadata->>'agent' AS agent FROM pyra_error_logs WHERE metadata->>'source' = 'pyra-calls-app' ORDER BY created_at DESC LIMIT 5"` → expect the `sync_failed` row with agent=sayed, app_version_code=2. Also spot-check it renders in `/dashboard/admin/error-logs`.
5. Verify fleet stamping: `pnpm db:query "SELECT name, app_version_code FROM pyra_api_keys WHERE name LIKE 'device:%'"` → emulator key shows 2 (real phones still NULL until they get v1.2).

- [ ] **Step 4: Hibernation step check**

Fresh emulator install → PermissionsScreen shows the hibernation card (API 31+ emulator has restrictions on by default) → button opens the system screen → disable → back → card disappears.

- [ ] **Step 5: Publish the real v1.2.0 + hand-off assets**

1. `.\gradlew.bat assembleRelease` (final, versionCode 2) → record SHA-256 (`Get-FileHash -Algorithm SHA256`).
2. `pnpm app:publish pyra-calls-app\app\build\outputs\apk\release\app-release.apk --app pyra-calls --notes "v1.2.0: تحديث ذاتي + تتبع أخطاء + إصلاح تسجيل الخروج"` — safe: the fleet is on v1 which has no updater; this row becomes the baseline all future updates diff against.
3. Docs: `docs/CALL-TRACKING.md` — add «نشر تحديث جديد» runbook (build → `pnpm app:publish` → done; devices pick it up ≤6h; `--activate` rollback), extend the provisioning checklist (install-unknown-apps grant appears on first update; hibernation toggle step), document the error-tracking pipeline + `pyra_error_logs` filter (`metadata->>'source' = 'pyra-calls-app'`).
4. Ledger + memory: append the v1.2 wave to `.superpowers/sdd/progress.md`; update `call-tracking-project.md` memory (v1.2 shipped; ONE last manual install round needed on the 3 phones; then updates are self-serve).

- [ ] **Step 6: Final commit + push (branch only)**

```bash
git add docs/CALL-TRACKING.md .superpowers/sdd/progress.md
git commit -m "docs(mobile): v1.2 release runbook + error-tracking pipeline + E2E record"
git push origin HEAD:integrate-pending-fixes
```

---

## Self-Review Notes

- Spec coverage: self-update (S1–S3, A4, A5.2/5), error tracking (S2, A2, A5.3), logout fix (A1, A3, A5.1/4) — all three user asks have tasks; channel isolation covers the "real phones must never see test releases" hazard; publish-before-deactivate ordering covers mid-publish failure.
- Type consistency: `ErrorEvent`/`LogErrorRequest`/`AppVersionData`/`AppDownloadData` names match between A2/A4 (app) and S2 (server contract); `AppPrefs` update accessors introduced in A1 are the ones A4 consumes.
- Known deferred items (backlog, do not do now): remove security-crypto dep (v1.3, after one fleet-wide v1.2 cycle), admin UI for releases (script suffices), force-update blocking screen, PackageInstaller session API (ACTION_VIEW suffices at this fleet size).
