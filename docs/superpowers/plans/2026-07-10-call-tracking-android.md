# Call Tracking — Android App (`pyra-calls-app`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the sideloaded Kotlin Android app that syncs the sales
agents' SIM call logs into Pyra CRM against the LOCKED server contract in
`docs/CALL-TRACKING.md` (server shipped 2026-07-10; all endpoints
live-verified).

**Architecture:** Single-module Compose app. Pure-Kotlin core (payloads,
direction mapping, cursor planner, Dubai time) is unit-tested with plain
JUnit — no Android deps. An OkHttp `ApiClient` speaks the 4 mobile
endpoints. `WorkManager` runs a 15-min periodic sync + a PHONE_STATE-
triggered immediate sync; the sync response drives local notifications
(unmatched → quick-add screen; after create → feedback deep-link). The
device key lives in `EncryptedSharedPreferences`.

**Tech Stack:** Kotlin 2.0.21 · Jetpack Compose (Material3) · OkHttp 4.12 ·
kotlinx-serialization 1.7.3 · WorkManager 2.10 · security-crypto
1.1.0-alpha06 · JUnit 4.

## Global Constraints

- **Toolchain (verified installed on this machine):** JDK 17 at
  `C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot`; `ANDROID_HOME
  = C:\Users\engmo\AppData\Local\Android\Sdk` with platform `android-36`,
  `build-tools;36.1.0`, `cmdline-tools\latest`, emulator +
  `system-images\android-36`. NO standalone gradle (Task 1 bootstraps the
  wrapper), NO AVD yet (Task 7 creates one).
- **Versions (pinned):** Gradle wrapper 8.11.1 · AGP 8.10.1 · Kotlin 2.0.21
  (+ `org.jetbrains.kotlin.plugin.compose`) · compileSdk 36 · targetSdk 34 ·
  minSdk 26 · JVM target 17.
- **Location:** `pyra-calls-app/` at the repo root (inside
  C:\xampp\htdocs\pyra-workspace-3). It must not affect `pnpm build` /
  `pnpm run check` (no package.json inside it; verify once in Task 1).
- **applicationId:** `cloud.pyramedia.calls`.
- **BASE_URL** via BuildConfig: debug = `http://10.0.2.2:3000` (emulator →
  local `pnpm dev`; debug-only cleartext for that host), release =
  `https://workspace.pyramedia.cloud`.
- **Contract rules (verbatim from docs/CALL-TRACKING.md — regressions are
  review failures):**
  - `device_call_key = "{deviceId}:{CallLog._ID}"`; `device_id` matches
    `^[a-zA-Z0-9._-]{4,64}$` and is app-generated + stable (NOT IMEI).
  - Batch ≤ 100 calls; `direction ∈ {outgoing, incoming, missed}`.
  - On ANY `'error'` result: keep those calls queued — do NOT advance the
    cursor past them; re-send on the next pass (duplicates are no-ops).
  - `'duplicate'` = already persisted; safe to advance past.
  - Unmatched → local notification prompting quick-add; quick-add
    validation mirrors server: name required; b2b → company required;
    b2c → no company field.
  - Feedback notification fires only when `already_existed: false`; its tap
    opens `BASE_URL + lead_url` in the browser.
  - Ignore can 409 (call already lead-linked) — show «المكالمة مرتبطة
    بعميل بالفعل» and drop the prompt.
- **CallLog type mapping (locked):** 1 (INCOMING) → `incoming`; 2
  (OUTGOING) → `outgoing`; 3 (MISSED) + 5 (REJECTED) → `missed`; every
  other type (voicemail/blocked/answered-externally) is skipped but its
  `_ID` still advances the cursor.
- **History rule:** first login stores `installDayStartMillis` = Dubai-day
  start (UTC+4, no DST) of that moment; sync NEVER reads CallLog rows with
  `DATE < installDayStartMillis`.
- **UI: Arabic, RTL forced** (`LocalLayoutDirection provides
  LayoutDirection.Rtl`); all user-visible strings in `res/values/strings.xml`
  (Arabic default — no hardcoded literals in composables).
- **Permissions gate:** the app refuses to proceed to login until
  `READ_CALL_LOG`, `READ_PHONE_STATE`, `POST_NOTIFICATIONS` are granted.
- **Secrets discipline:** the device key only in EncryptedSharedPreferences;
  never logged. Release keystore lives OUTSIDE the repo
  (`C:\Users\engmo\pyra-keys\`) and is gitignored by pattern anyway.
- **Documented deviation from the spec's storage note:** the spec mentioned
  DataStore for the sync cursor; this plan keeps the cursor in the same
  EncryptedSharedPreferences as the session (one storage, atomic
  clearSession) — functionally identical, deliberately simpler.
- Each task ends: build green (`.\gradlew.bat` from `pyra-calls-app\`),
  unit tests green, commit (Task 1 message sets the `feat(calls-app):`
  prefix convention), push per repo workflow (fetch first).

## File Structure (final)

```
pyra-calls-app/
├── settings.gradle.kts, build.gradle.kts, gradle.properties
├── gradle/libs.versions.toml, gradle/wrapper/*
├── gradlew.bat, .gitignore, local.properties (gitignored)
└── app/
    ├── build.gradle.kts
    └── src/
        ├── main/AndroidManifest.xml
        ├── main/res/values/strings.xml            (Arabic)
        ├── main/res/xml/network_security_config.xml (debug cleartext 10.0.2.2)
        ├── main/java/cloud/pyramedia/calls/
        │   ├── core/Payloads.kt      (serializable request/response models)
        │   ├── core/CallMapping.kt   (CallLog type → direction)
        │   ├── core/SyncPlanner.kt   (cursor-advance decision)
        │   ├── core/DubaiTime.kt     (day/month start, ISO format)
        │   ├── data/AppPrefs.kt      (EncryptedSharedPreferences wrapper)
        │   ├── data/ApiClient.kt     (OkHttp; 4 endpoints; sealed ApiResult)
        │   ├── data/CallLogReader.kt (cursor query → List<PendingCall>)
        │   ├── sync/SyncWorker.kt    (batch loop + result handling)
        │   ├── sync/SyncScheduler.kt (periodic + immediate enqueue)
        │   ├── sync/PhoneStateReceiver.kt
        │   ├── notify/Notifier.kt    (channels; unmatched/feedback)
        │   ├── notify/IgnoreReceiver.kt (notification action → POST ignore)
        │   ├── ui/MainActivity.kt    (nav: Permissions → Login → Home)
        │   ├── ui/PermissionsScreen.kt, ui/LoginScreen.kt, ui/HomeScreen.kt
        │   ├── ui/QuickAddActivity.kt (form: b2b/b2c per locked rules)
        │   └── PyraCallsApp.kt       (Application: channels + periodic work)
        └── test/java/cloud/pyramedia/calls/core/   (JUnit for core/*)
```

---

### Task 1: Toolchain bootstrap + project scaffold

**Files:**
- Create: everything under `pyra-calls-app/` listed below
- Modify: repo root `.gitignore` (append Android ignores)

**Interfaces:**
- Produces: a building Gradle project; `.\gradlew.bat assembleDebug`
  emits `app\build\outputs\apk\debug\app-debug.apk`. Version catalog alias
  names used by all later tasks: `libs.okhttp`, `libs.kotlinx.serialization.json`,
  `libs.androidx.work.runtime`, `libs.androidx.security.crypto`,
  `libs.androidx.core.ktx`, `libs.androidx.activity.compose`,
  `libs.androidx.compose.bom`, `libs.androidx.material3`, `libs.junit`.

- [ ] **Step 1: Bootstrap Gradle (no standalone gradle installed)**

```powershell
$tools = "C:\Users\engmo\pyra-tools"
New-Item -ItemType Directory -Force $tools
Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-8.11.1-bin.zip" -OutFile "$tools\gradle-8.11.1-bin.zip"
Expand-Archive "$tools\gradle-8.11.1-bin.zip" -DestinationPath $tools -Force
```
Expected: `C:\Users\engmo\pyra-tools\gradle-8.11.1\bin\gradle.bat` exists.

- [ ] **Step 2: Create the project skeleton**

Create `pyra-calls-app/settings.gradle.kts`:
```kotlin
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositories { google(); mavenCentral() }
}
rootProject.name = "pyra-calls-app"
include(":app")
```

`pyra-calls-app/build.gradle.kts`:
```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
```

`pyra-calls-app/gradle/libs.versions.toml`:
```toml
[versions]
agp = "8.10.1"
kotlin = "2.0.21"
coreKtx = "1.15.0"
activityCompose = "1.9.3"
composeBom = "2024.12.01"
okhttp = "4.12.0"
kotlinxSerialization = "1.7.3"
work = "2.10.0"
securityCrypto = "1.1.0-alpha06"
junit = "4.13.2"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "coreKtx" }
androidx-activity-compose = { group = "androidx.activity", name = "activity-compose", version.ref = "activityCompose" }
androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
androidx-material3 = { group = "androidx.compose.material3", name = "material3" }
androidx-compose-ui = { group = "androidx.compose.ui", name = "ui" }
androidx-work-runtime = { group = "androidx.work", name = "work-runtime-ktx", version.ref = "work" }
androidx-security-crypto = { group = "androidx.security", name = "security-crypto", version.ref = "securityCrypto" }
okhttp = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }
kotlinx-serialization-json = { group = "org.jetbrains.kotlinx", name = "kotlinx-serialization-json", version.ref = "kotlinxSerialization" }
junit = { group = "junit", name = "junit", version.ref = "junit" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
```

`pyra-calls-app/app/build.gradle.kts`:
```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "cloud.pyramedia.calls"
    compileSdk = 36

    defaultConfig {
        applicationId = "cloud.pyramedia.calls"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildFeatures { compose = true; buildConfig = true }

    buildTypes {
        debug {
            buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:3000\"")
        }
        release {
            buildConfigField("String", "BASE_URL", "\"https://workspace.pyramedia.cloud\"")
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.security.crypto)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
}
```

`pyra-calls-app/gradle.properties`:
```properties
org.gradle.jvmargs=-Xmx2048m
android.useAndroidX=true
kotlin.code.style=official
```

`pyra-calls-app/local.properties` (gitignored):
```properties
sdk.dir=C\:\\Users\\engmo\\AppData\\Local\\Android\\Sdk
```

`pyra-calls-app/.gitignore`:
```
.gradle/
build/
local.properties
*.keystore
```

Minimal `app/src/main/AndroidManifest.xml` (permissions land fully in Task 5):
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity android:name=".ui.MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

`app/src/main/res/values/strings.xml` (seed — later tasks append):
```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Pyra Calls</string>
</resources>
```

`app/src/main/java/cloud/pyramedia/calls/ui/MainActivity.kt` (placeholder,
replaced in Task 4):
```kotlin
package cloud.pyramedia.calls.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Text

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { Text("Pyra Calls") }
    }
}
```

- [ ] **Step 3: Generate the wrapper + first build**

```powershell
cd C:\xampp\htdocs\pyra-workspace-3\pyra-calls-app
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot"
& "C:\Users\engmo\pyra-tools\gradle-8.11.1\bin\gradle.bat" wrapper --gradle-version 8.11.1
.\gradlew.bat assembleDebug
```
Expected: `BUILD SUCCESSFUL`; `app\build\outputs\apk\debug\app-debug.apk`
exists. (First run downloads AGP/deps — several minutes.)

- [ ] **Step 4: Repo hygiene**

Append to the REPO ROOT `.gitignore`:
```
# Android app (pyra-calls-app)
pyra-calls-app/.gradle/
pyra-calls-app/build/
pyra-calls-app/app/build/
pyra-calls-app/local.properties
*.keystore
```
Then verify the Next.js side is untouched: `pnpm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add pyra-calls-app .gitignore
git commit -m "feat(calls-app): android project scaffold (compose, sdk36/min26)"
```

---

### Task 2: Pure core — payloads, mapping, cursor planner, Dubai time (TDD)

**Files:**
- Create: `app/src/main/java/cloud/pyramedia/calls/core/{Payloads,CallMapping,SyncPlanner,DubaiTime}.kt`
- Test: `app/src/test/java/cloud/pyramedia/calls/core/{CallMappingTest,SyncPlannerTest,DubaiTimeTest,PayloadsTest}.kt`

**Interfaces:**
- Produces (used by ALL later tasks — exact signatures):
  - `Payloads.kt`: `@Serializable` classes `LoginRequest(email, password, device_id)`,
    `LoginData(device_key, username, display_name)`,
    `CallEntry(device_call_key, phone, direction, duration_seconds: Int, called_at)`,
    `SyncRequest(calls: List<CallEntry>)`,
    `SyncResult(device_call_key, status, lead_id: String? = null, lead_name: String? = null)`,
    `SyncData(results: List<SyncResult>)`,
    `QuickAddRequest(device_call_key, name, lead_type, company: String? = null)`,
    `QuickAddData(lead_id, lead_name, lead_url, already_existed: Boolean)`,
    `IgnoreRequest(device_call_key)`, `IgnoreData(ignored: Boolean, updated_calls: Int)`,
    `Envelope<T>(data: T? = null, error: String? = null)`; plus
    `val PyraJson = Json { ignoreUnknownKeys = true; explicitNulls = false }`.
  - `CallMapping.directionFor(callLogType: Int): String?` (1→incoming,
    2→outgoing, 3|5→missed, else null).
  - `SyncPlanner.nextCursor(current: Long, batchMaxId: Long, results: List<SyncResult>): Long?`
    — null when any result has `status == "error"` (cursor frozen), else
    `maxOf(current, batchMaxId)`.
  - `DubaiTime.dayStartMillis(nowMillis: Long): Long`,
    `DubaiTime.monthStartMillis(nowMillis: Long): Long`,
    `DubaiTime.isoUtc(millis: Long): String` (ISO-8601 `Z` string).

- [ ] **Step 1: Write the failing tests**

`CallMappingTest.kt`:
```kotlin
package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CallMappingTest {
    @Test fun mapsKnownTypes() {
        assertEquals("incoming", CallMapping.directionFor(1))
        assertEquals("outgoing", CallMapping.directionFor(2))
        assertEquals("missed", CallMapping.directionFor(3))
        assertEquals("missed", CallMapping.directionFor(5)) // rejected
    }
    @Test fun skipsUnknownTypes() {
        assertNull(CallMapping.directionFor(4)) // voicemail
        assertNull(CallMapping.directionFor(6)) // blocked
        assertNull(CallMapping.directionFor(7)) // answered externally
    }
}
```

`SyncPlannerTest.kt`:
```kotlin
package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SyncPlannerTest {
    private fun r(status: String) = SyncResult(device_call_key = "d:1", status = status)

    @Test fun advancesToBatchMax() {
        assertEquals(50L, SyncPlanner.nextCursor(10L, 50L, listOf(r("matched"), r("duplicate"))))
    }
    @Test fun neverGoesBackwards() {
        assertEquals(99L, SyncPlanner.nextCursor(99L, 50L, listOf(r("unmatched"))))
    }
    @Test fun freezesOnAnyError() {
        assertNull(SyncPlanner.nextCursor(10L, 50L, listOf(r("matched"), r("error"))))
    }
}
```

`DubaiTimeTest.kt`:
```kotlin
package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Test

class DubaiTimeTest {
    // 2026-07-10T22:30:00Z == 2026-07-11T02:30 Dubai → Dubai day start = 2026-07-11T00:00+04 = 2026-07-10T20:00:00Z
    @Test fun dayStartCrossesUtcMidnightCorrectly() {
        val nowUtc = 1783722600000L // 2026-07-10T22:30:00Z
        assertEquals(1783713600000L, DubaiTime.dayStartMillis(nowUtc)) // 2026-07-10T20:00:00Z
    }
    @Test fun monthStartIsDubaiFirstOfMonth() {
        val nowUtc = 1783722600000L
        // 2026-07-01T00:00+04:00 = 2026-06-30T20:00:00Z
        assertEquals(1782849600000L, DubaiTime.monthStartMillis(nowUtc))
    }
    @Test fun isoUtcFormats() {
        assertEquals("2026-07-10T12:00:00Z", DubaiTime.isoUtc(1783684800000L))
    }
}
```

`PayloadsTest.kt`:
```kotlin
package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PayloadsTest {
    @Test fun decodesSyncEnvelopeIgnoringUnknownKeys() {
        val body = """{"data":{"results":[{"device_call_key":"d:1","status":"matched","lead_id":"sl_1","lead_name":"X","extra":1}]},"error":null,"meta":null}"""
        val env = PyraJson.decodeFromString<Envelope<SyncData>>(body)
        assertEquals("matched", env.data!!.results[0].status)
        assertEquals("sl_1", env.data!!.results[0].lead_id)
    }
    @Test fun encodesQuickAddWithoutNullCompany() {
        val json = PyraJson.encodeToString(QuickAddRequest.serializer(),
            QuickAddRequest("d:1", "عميل", "b2c"))
        assertTrue(!json.contains("company"))
    }
}
```

- [ ] **Step 2: Run tests, verify they FAIL**

Run (from `pyra-calls-app\`): `.\gradlew.bat testDebugUnitTest`
Expected: compilation failure — classes not found.

- [ ] **Step 3: Implement**

`Payloads.kt`:
```kotlin
package cloud.pyramedia.calls.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

val PyraJson = Json { ignoreUnknownKeys = true; explicitNulls = false }

@Serializable data class LoginRequest(val email: String, val password: String, val device_id: String)
@Serializable data class LoginData(val device_key: String, val username: String, val display_name: String)
@Serializable data class CallEntry(
    val device_call_key: String, val phone: String, val direction: String,
    val duration_seconds: Int, val called_at: String,
)
@Serializable data class SyncRequest(val calls: List<CallEntry>)
@Serializable data class SyncResult(
    val device_call_key: String, val status: String,
    val lead_id: String? = null, val lead_name: String? = null,
)
@Serializable data class SyncData(val results: List<SyncResult>)
@Serializable data class QuickAddRequest(
    val device_call_key: String, val name: String, val lead_type: String,
    val company: String? = null,
)
@Serializable data class QuickAddData(
    val lead_id: String, val lead_name: String, val lead_url: String,
    val already_existed: Boolean,
)
@Serializable data class IgnoreRequest(val device_call_key: String)
@Serializable data class IgnoreData(val ignored: Boolean, val updated_calls: Int)
@Serializable data class Envelope<T>(val data: T? = null, val error: String? = null)
```

`CallMapping.kt`:
```kotlin
package cloud.pyramedia.calls.core

object CallMapping {
    /** CallLog.Calls.TYPE → server direction; null = skip (still consumes cursor). */
    fun directionFor(callLogType: Int): String? = when (callLogType) {
        1 -> "incoming"
        2 -> "outgoing"
        3, 5 -> "missed" // missed + rejected both count as missed
        else -> null
    }
}
```

`SyncPlanner.kt`:
```kotlin
package cloud.pyramedia.calls.core

object SyncPlanner {
    /**
     * Contract (docs/CALL-TRACKING.md): an 'error' result means nothing was
     * persisted server-side — the cursor must NOT advance past it. Whole
     * batch is re-sent next pass; already-persisted items echo 'duplicate'.
     */
    fun nextCursor(current: Long, batchMaxId: Long, results: List<SyncResult>): Long? {
        if (results.any { it.status == "error" }) return null
        return maxOf(current, batchMaxId)
    }
}
```

`DubaiTime.kt`:
```kotlin
package cloud.pyramedia.calls.core

import java.time.Instant
import java.time.ZoneOffset

object DubaiTime {
    private val DUBAI: ZoneOffset = ZoneOffset.ofHours(4) // no DST

    fun dayStartMillis(nowMillis: Long): Long =
        Instant.ofEpochMilli(nowMillis).atOffset(DUBAI).toLocalDate()
            .atStartOfDay().toInstant(DUBAI).toEpochMilli()

    fun monthStartMillis(nowMillis: Long): Long =
        Instant.ofEpochMilli(nowMillis).atOffset(DUBAI).toLocalDate()
            .withDayOfMonth(1).atStartOfDay().toInstant(DUBAI).toEpochMilli()

    fun isoUtc(millis: Long): String = Instant.ofEpochMilli(millis).toString()
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `.\gradlew.bat testDebugUnitTest`
Expected: all tests pass, `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
git add pyra-calls-app/app/src
git commit -m "feat(calls-app): pure core - payloads, call mapping, cursor planner, dubai time"
```

---

### Task 3: ApiClient + AppPrefs (secure storage)

**Files:**
- Create: `app/src/main/java/cloud/pyramedia/calls/data/ApiClient.kt`
- Create: `app/src/main/java/cloud/pyramedia/calls/data/AppPrefs.kt`
- Create: `app/src/main/res/xml/network_security_config.xml` + manifest wiring

**Interfaces:**
- Consumes: Task 2 payloads + `PyraJson`.
- Produces:
  - `sealed class ApiResult<out T>`: `Ok<T>(val data: T)` ·
    `Err(val code: Int, val message: String)` · `object NetworkError`.
  - `class ApiClient(baseUrl: String, deviceKeyProvider: () -> String?)` with
    BLOCKING methods (call from Dispatchers.IO / workers only):
    `login(email: String, password: String, deviceId: String): ApiResult<LoginData>`,
    `sync(calls: List<CallEntry>): ApiResult<SyncData>`,
    `quickAdd(req: QuickAddRequest): ApiResult<QuickAddData>`,
    `ignore(deviceCallKey: String): ApiResult<IgnoreData>`.
  - `class AppPrefs(context: Context)` (EncryptedSharedPreferences):
    `var deviceKey: String?` · `var username: String?` ·
    `var displayName: String?` · `val deviceId: String` (lazily generated,
    16-char `[a-z0-9]`, stable) · `var lastSyncedCallLogId: Long` (default 0) ·
    `var installDayStartMillis: Long` (default 0) · `var lastSyncAtMillis: Long`
    (default 0) · `fun isLoggedIn(): Boolean` · `fun clearSession()`.

- [ ] **Step 1: Implement ApiClient**

```kotlin
package cloud.pyramedia.calls.data

import cloud.pyramedia.calls.core.*
import kotlinx.serialization.KSerializer
import kotlinx.serialization.serializer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

sealed class ApiResult<out T> {
    data class Ok<T>(val data: T) : ApiResult<T>()
    data class Err(val code: Int, val message: String) : ApiResult<Nothing>()
    data object NetworkError : ApiResult<Nothing>()
}

class ApiClient(
    private val baseUrl: String,
    private val deviceKeyProvider: () -> String?,
) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    fun login(email: String, password: String, deviceId: String): ApiResult<LoginData> =
        post("/api/mobile/auth/login", LoginRequest(email, password, deviceId),
            LoginRequest.serializer(), LoginData.serializer(), withKey = false)

    fun sync(calls: List<CallEntry>): ApiResult<SyncData> =
        post("/api/mobile/calls/sync", SyncRequest(calls),
            SyncRequest.serializer(), SyncData.serializer(), withKey = true)

    fun quickAdd(req: QuickAddRequest): ApiResult<QuickAddData> =
        post("/api/mobile/leads", req,
            QuickAddRequest.serializer(), QuickAddData.serializer(), withKey = true)

    fun ignore(deviceCallKey: String): ApiResult<IgnoreData> =
        post("/api/mobile/calls/ignore", IgnoreRequest(deviceCallKey),
            IgnoreRequest.serializer(), IgnoreData.serializer(), withKey = true)

    private fun <B, T> post(
        path: String, body: B,
        bodySer: KSerializer<B>, dataSer: KSerializer<T>, withKey: Boolean,
    ): ApiResult<T> {
        val builder = Request.Builder()
            .url(baseUrl + path)
            .post(PyraJson.encodeToString(bodySer, body).toRequestBody(jsonMedia))
        if (withKey) {
            val key = deviceKeyProvider() ?: return ApiResult.Err(401, "لا يوجد مفتاح جهاز")
            builder.header("x-api-key", key)
        }
        return try {
            http.newCall(builder.build()).execute().use { res ->
                val text = res.body?.string().orEmpty()
                val env = runCatching {
                    PyraJson.decodeFromString(Envelope.serializer(dataSer), text)
                }.getOrNull()
                when {
                    res.isSuccessful && env?.data != null -> ApiResult.Ok(env.data)
                    else -> ApiResult.Err(res.code, env?.error ?: "خطأ غير متوقع (${res.code})")
                }
            }
        } catch (e: IOException) {
            ApiResult.NetworkError
        }
    }
}
```

- [ ] **Step 2: Implement AppPrefs**

```kotlin
package cloud.pyramedia.calls.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class AppPrefs(context: Context) {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context, "pyra_calls_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var deviceKey: String?
        get() = prefs.getString("device_key", null)
        set(v) = prefs.edit().putString("device_key", v).apply()

    var username: String?
        get() = prefs.getString("username", null)
        set(v) = prefs.edit().putString("username", v).apply()

    var displayName: String?
        get() = prefs.getString("display_name", null)
        set(v) = prefs.edit().putString("display_name", v).apply()

    /** Stable app-generated device id — matches ^[a-zA-Z0-9._-]{4,64}$. */
    val deviceId: String
        get() = prefs.getString("device_id", null) ?: buildString {
            val chars = "abcdefghijklmnopqrstuvwxyz0123456789"
            repeat(16) { append(chars.random()) }
        }.also { prefs.edit().putString("device_id", it).apply() }

    var lastSyncedCallLogId: Long
        get() = prefs.getLong("last_synced_call_log_id", 0L)
        set(v) = prefs.edit().putLong("last_synced_call_log_id", v).apply()

    var installDayStartMillis: Long
        get() = prefs.getLong("install_day_start_millis", 0L)
        set(v) = prefs.edit().putLong("install_day_start_millis", v).apply()

    var lastSyncAtMillis: Long
        get() = prefs.getLong("last_sync_at_millis", 0L)
        set(v) = prefs.edit().putLong("last_sync_at_millis", v).apply()

    fun isLoggedIn(): Boolean = deviceKey != null

    fun clearSession() {
        prefs.edit()
            .remove("device_key").remove("username").remove("display_name")
            .remove("last_synced_call_log_id").remove("install_day_start_millis")
            .remove("last_sync_at_millis")
            .apply()
    }
}
```

- [ ] **Step 3: Debug-only cleartext for the emulator host**

`app/src/main/res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">10.0.2.2</domain>
    </domain-config>
</network-security-config>
```
Wire it in the manifest `<application>` tag:
`android:networkSecurityConfig="@xml/network_security_config"` and add
`<uses-permission android:name="android.permission.INTERNET" />` above
`<application>`.

- [ ] **Step 4: Build + unit tests still green**

Run: `.\gradlew.bat testDebugUnitTest assembleDebug`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
git add pyra-calls-app/app/src
git commit -m "feat(calls-app): okhttp api client + encrypted prefs + debug network config"
```

---

### Task 4: Permission gate + Login + navigation shell

**Files:**
- Create: `app/src/main/java/cloud/pyramedia/calls/ui/{PermissionsScreen,LoginScreen}.kt`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/MainActivity.kt` (replace placeholder)
- Modify: `app/src/main/res/values/strings.xml` (append)
- Modify: manifest (add `READ_CALL_LOG`, `READ_PHONE_STATE`, `POST_NOTIFICATIONS` uses-permission)

**Interfaces:**
- Consumes: `ApiClient.login`, `AppPrefs`, `DubaiTime.dayStartMillis`.
- Produces: `MainActivity` renders (RTL-forced): permissions not granted →
  `PermissionsScreen(onAllGranted)`; granted + not logged in →
  `LoginScreen(onLoggedIn)`; logged in → `HomeScreen(...)` (Task 6 supplies
  the real HomeScreen; until then MainActivity may show a temporary
  `Text(stringResource(R.string.home_placeholder))` behind the same
  branching — replaced in Task 6). On successful login MainActivity's
  callback MUST: store `deviceKey/username/displayName`, set
  `installDayStartMillis = DubaiTime.dayStartMillis(System.currentTimeMillis())`
  ONLY if currently 0, reset `lastSyncedCallLogId = 0`, then call
  `SyncScheduler.ensurePeriodic(context)` (Task 5 — until Task 5 lands,
  leave a clearly-marked call-site comment `// SyncScheduler.ensurePeriodic(this) — wired in Task 5`).

- [ ] **Step 1: strings.xml additions**

```xml
<string name="perm_title">أذونات مطلوبة</string>
<string name="perm_body">التطبيق يحتاج الوصول لسجل المكالمات وحالة الهاتف والإشعارات ليعمل تلقائيًا. لن يعمل بدونها.</string>
<string name="perm_grant">منح الأذونات</string>
<string name="login_title">تسجيل الدخول</string>
<string name="login_subtitle">نفس حساب النظام — مرة واحدة فقط</string>
<string name="login_email">البريد الإلكتروني</string>
<string name="login_password">كلمة المرور</string>
<string name="login_button">دخول</string>
<string name="login_loading">جارٍ الدخول…</string>
<string name="login_network_error">تعذر الاتصال بالخادم — تأكد من الإنترنت</string>
<string name="home_placeholder">تم تسجيل الدخول</string>
```

- [ ] **Step 2: PermissionsScreen**

```kotlin
package cloud.pyramedia.calls.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R

val REQUIRED_PERMISSIONS: Array<String> = buildList {
    add(Manifest.permission.READ_CALL_LOG)
    add(Manifest.permission.READ_PHONE_STATE)
    if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
}.toTypedArray()

@Composable
fun PermissionsScreen(onAllGranted: () -> Unit) {
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants -> if (grants.values.all { it }) onAllGranted() }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(stringResource(R.string.perm_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.perm_body), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(24.dp))
        Button(onClick = { launcher.launch(REQUIRED_PERMISSIONS) }) {
            Text(stringResource(R.string.perm_grant))
        }
    }
}
```

- [ ] **Step 3: LoginScreen**

```kotlin
package cloud.pyramedia.calls.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.LoginData
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun LoginScreen(api: ApiClient, deviceId: String, onLoggedIn: (LoginData) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(stringResource(R.string.login_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.login_subtitle), style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = email, onValueChange = { email = it },
            label = { Text(stringResource(R.string.login_email)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true, modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password, onValueChange = { password = it },
            label = { Text(stringResource(R.string.login_password)) },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true, modifier = Modifier.fillMaxWidth(),
        )
        error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error) }
        Spacer(Modifier.height(24.dp))
        Button(
            enabled = !loading && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                loading = true; error = null
                scope.launch {
                    val result = withContext(Dispatchers.IO) {
                        api.login(email.trim(), password, deviceId)
                    }
                    loading = false
                    when (result) {
                        is ApiResult.Ok -> onLoggedIn(result.data)
                        is ApiResult.Err -> error = result.message
                        ApiResult.NetworkError -> error = null.let {
                            // resource lookup needs a Context-free path; simplest:
                            "تعذر الاتصال بالخادم — تأكد من الإنترنت"
                        }
                    }
                }
            },
        ) { Text(stringResource(if (loading) R.string.login_loading else R.string.login_button)) }
    }
}
```
(Note for the implementer: replacing that inline network-error literal with
`stringResource` read outside the coroutine is the correct final shape —
hoist `val netErr = stringResource(R.string.login_network_error)` above the
Button and use it. Do that; the literal above only illustrates the message.)

- [ ] **Step 4: MainActivity with RTL + branching**

```kotlin
package cloud.pyramedia.calls.ui

import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.content.ContextCompat
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.DubaiTime
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.AppPrefs

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = AppPrefs(this)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }

        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme {
                    Surface {
                        var granted by remember { mutableStateOf(allPermissionsGranted()) }
                        var loggedIn by remember { mutableStateOf(prefs.isLoggedIn()) }
                        when {
                            !granted -> PermissionsScreen(onAllGranted = { granted = true })
                            !loggedIn -> LoginScreen(api, prefs.deviceId) { data ->
                                prefs.deviceKey = data.device_key
                                prefs.username = data.username
                                prefs.displayName = data.display_name
                                if (prefs.installDayStartMillis == 0L) {
                                    prefs.installDayStartMillis =
                                        DubaiTime.dayStartMillis(System.currentTimeMillis())
                                }
                                prefs.lastSyncedCallLogId = 0L
                                // SyncScheduler.ensurePeriodic(this@MainActivity) — wired in Task 5
                                loggedIn = true
                            }
                            else -> Text(stringResource(R.string.home_placeholder)) // HomeScreen in Task 6
                        }
                    }
                }
            }
        }
    }

    private fun allPermissionsGranted(): Boolean = REQUIRED_PERMISSIONS.all {
        ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }
}
```
Manifest additions (above `<application>`):
```xml
<uses-permission android:name="android.permission.READ_CALL_LOG" />
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

- [ ] **Step 5: Build + tests + commit**

Run: `.\gradlew.bat testDebugUnitTest assembleDebug` → `BUILD SUCCESSFUL`.
```bash
git add pyra-calls-app/app/src
git commit -m "feat(calls-app): permission gate + login screen + rtl shell"
```

---

### Task 5: Sync engine — CallLogReader, SyncWorker, scheduler, receiver, unmatched notifications

**Files:**
- Create: `app/src/main/java/cloud/pyramedia/calls/data/CallLogReader.kt`
- Create: `app/src/main/java/cloud/pyramedia/calls/sync/{SyncWorker,SyncScheduler,PhoneStateReceiver}.kt`
- Create: `app/src/main/java/cloud/pyramedia/calls/notify/Notifier.kt`
- Create: `app/src/main/java/cloud/pyramedia/calls/PyraCallsApp.kt`
- Modify: manifest (application name, receiver), `MainActivity` (uncomment the
  `SyncScheduler.ensurePeriodic` call site), strings.xml (append)

**Interfaces:**
- Consumes: Task 2 core (`CallMapping`, `SyncPlanner`, `DubaiTime`,
  `CallEntry`), Task 3 (`ApiClient`, `AppPrefs`, `ApiResult`).
- Produces:
  - `data class PendingCall(val callLogId: Long, val entry: CallEntry)`
  - `CallLogReader.readBatch(context, prefs, limit: Int = 100): List<PendingCall>`
    — rows with `_ID > prefs.lastSyncedCallLogId AND DATE >= prefs.installDayStartMillis`,
    ordered `_ID ASC`; unmapped types are EXCLUDED from the list but their
    `_ID` participates in the batch max via `PendingCall` omission — to keep
    the cursor correct, `readBatch` returns the batch and callers advance to
    the max `_ID` SCANNED (see `lastScannedId` below).
    Exact produced shape: `data class CallLogBatch(val calls: List<PendingCall>, val lastScannedId: Long)`
    and `CallLogReader.readBatch(...): CallLogBatch` — `lastScannedId` = max
    `_ID` among ALL scanned rows (mapped + skipped), or `prefs.lastSyncedCallLogId`
    when nothing scanned.
  - `SyncWorker` (CoroutineWorker): loops `readBatch` → `api.sync` →
    unmatched results → `Notifier.showUnmatched(context, phone, deviceCallKey)`
    → cursor via `SyncPlanner.nextCursor(current, batch.lastScannedId, results)`
    (null → `Result.retry()`); sets `prefs.lastSyncAtMillis` on success;
    401/403 from sync → clear nothing, stop quietly (account/key issue —
    surfaced on Home as "غير متزامن"); loops until a batch returns < limit.
  - `SyncScheduler.ensurePeriodic(context)` — unique periodic work
    `"pyra-sync"` every 15 min (KEEP) + `SyncScheduler.syncNow(context, delaySeconds: Long = 0)`
    — unique one-time `"pyra-sync-now"` (REPLACE), used by the receiver (10s)
    and the Home screen's manual refresh (0s).
  - `PhoneStateReceiver` — manifest-registered for
    `android.intent.action.PHONE_STATE`; on `EXTRA_STATE_IDLE` →
    `SyncScheduler.syncNow(context, 10)`.
  - `Notifier.ensureChannels(context)`; `Notifier.showUnmatched(context, phone, deviceCallKey)`
    (channel `unmatched`, id = `deviceCallKey.hashCode()`, tap →
    `QuickAddActivity` with extras `phone`,`device_call_key`; action button
    «تجاهل — رقم شخصي» → `IgnoreReceiver` [Task 6]);
    `Notifier.showFeedback(context, leadName, leadUrl)` (channel `feedback`,
    tap → `ACTION_VIEW BuildConfig.BASE_URL + leadUrl`, autoCancel).
    (In THIS task, wire the unmatched tap-intent to QuickAddActivity via an
    explicit `Intent(context, QuickAddActivity::class.java)` — Task 6 creates
    that activity; to keep Task 5 compiling standalone, create in THIS task a
    minimal `ui/QuickAddActivity.kt` stub that Task 6 replaces:
    `class QuickAddActivity : ComponentActivity()` with empty `setContent {}`.)

- [ ] **Step 1: strings.xml additions**

```xml
<string name="notif_channel_unmatched">أرقام غير مسجلة</string>
<string name="notif_channel_feedback">تذكير الفيدباك</string>
<string name="notif_unmatched_title">رقم غير مسجل في النظام</string>
<string name="notif_unmatched_body">اضغط لإضافة بيانات العميل — %1$s</string>
<string name="notif_ignore_action">تجاهل — رقم شخصي</string>
<string name="notif_feedback_title">مطلوب: إضافة فيدباك</string>
<string name="notif_feedback_body">تم إنشاء %1$s — ادخل وسجّل نتيجة المكالمة</string>
```

- [ ] **Step 2: CallLogReader**

```kotlin
package cloud.pyramedia.calls.data

import android.content.Context
import android.provider.CallLog
import cloud.pyramedia.calls.core.CallEntry
import cloud.pyramedia.calls.core.CallMapping
import cloud.pyramedia.calls.core.DubaiTime

data class PendingCall(val callLogId: Long, val entry: CallEntry)
data class CallLogBatch(val calls: List<PendingCall>, val lastScannedId: Long)

object CallLogReader {
    fun readBatch(context: Context, prefs: AppPrefs, limit: Int = 100): CallLogBatch {
        val calls = mutableListOf<PendingCall>()
        var lastScannedId = prefs.lastSyncedCallLogId
        val projection = arrayOf(
            CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE,
            CallLog.Calls.DURATION, CallLog.Calls.DATE,
        )
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI, projection,
            "${CallLog.Calls._ID} > ? AND ${CallLog.Calls.DATE} >= ?",
            arrayOf(prefs.lastSyncedCallLogId.toString(), prefs.installDayStartMillis.toString()),
            "${CallLog.Calls._ID} ASC",
        )?.use { c ->
            val iId = c.getColumnIndexOrThrow(CallLog.Calls._ID)
            val iNum = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
            val iType = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
            val iDur = c.getColumnIndexOrThrow(CallLog.Calls.DURATION)
            val iDate = c.getColumnIndexOrThrow(CallLog.Calls.DATE)
            while (c.moveToNext() && calls.size < limit) {
                val id = c.getLong(iId)
                lastScannedId = maxOf(lastScannedId, id)
                val direction = CallMapping.directionFor(c.getInt(iType)) ?: continue
                val phone = c.getString(iNum).orEmpty()
                if (phone.isBlank()) continue // withheld/private number — nothing to match or count against a lead
                calls.add(PendingCall(id, CallEntry(
                    device_call_key = "${prefs.deviceId}:$id",
                    phone = phone,
                    direction = direction,
                    duration_seconds = c.getInt(iDur).coerceAtLeast(0),
                    called_at = DubaiTime.isoUtc(c.getLong(iDate)),
                )))
            }
        }
        return CallLogBatch(calls, lastScannedId)
    }
}
```

- [ ] **Step 3: SyncWorker + SyncScheduler + PhoneStateReceiver**

`SyncWorker.kt`:
```kotlin
package cloud.pyramedia.calls.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.core.SyncPlanner
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.CallLogReader
import cloud.pyramedia.calls.notify.Notifier

class SyncWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val prefs = AppPrefs(applicationContext)
        if (!prefs.isLoggedIn()) return Result.success()
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }

        while (true) {
            val batch = CallLogReader.readBatch(applicationContext, prefs)
            if (batch.calls.isEmpty()) {
                // nothing to send; still advance past scanned-but-skipped rows
                prefs.lastSyncedCallLogId = batch.lastScannedId
                break
            }
            when (val res = api.sync(batch.calls.map { it.entry })) {
                is ApiResult.Ok -> {
                    val byKey = batch.calls.associateBy { it.entry.device_call_key }
                    for (r in res.data.results) {
                        if (r.status == "unmatched") {
                            byKey[r.device_call_key]?.let {
                                Notifier.showUnmatched(applicationContext, it.entry.phone, r.device_call_key)
                            }
                        }
                    }
                    val next = SyncPlanner.nextCursor(
                        prefs.lastSyncedCallLogId, batch.lastScannedId, res.data.results,
                    ) ?: return Result.retry() // 'error' in batch — re-send later
                    prefs.lastSyncedCallLogId = next
                    prefs.lastSyncAtMillis = System.currentTimeMillis()
                    if (batch.calls.size < 100) break // last page
                }
                is ApiResult.Err -> return Result.success() // 401/403/422: not retryable here; Home shows staleness
                ApiResult.NetworkError -> return Result.retry()
            }
        }
        return Result.success()
    }
}
```

`SyncScheduler.kt`:
```kotlin
package cloud.pyramedia.calls.sync

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

object SyncScheduler {
    private val network = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun ensurePeriodic(context: Context) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "pyra-sync", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(network).build(),
        )
    }

    fun syncNow(context: Context, delaySeconds: Long = 0) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            "pyra-sync-now", ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<SyncWorker>()
                .setInitialDelay(delaySeconds, TimeUnit.SECONDS)
                .setConstraints(network).build(),
        )
    }
}
```

`PhoneStateReceiver.kt`:
```kotlin
package cloud.pyramedia.calls.sync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager

class PhoneStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
        if (state == TelephonyManager.EXTRA_STATE_IDLE) {
            // call just ended — CallLog row lands within a few seconds
            SyncScheduler.syncNow(context, delaySeconds = 10)
        }
    }
}
```

- [ ] **Step 4: Notifier + Application class + manifest**

`Notifier.kt`:
```kotlin
package cloud.pyramedia.calls.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.ui.QuickAddActivity

object Notifier {
    const val CHANNEL_UNMATCHED = "unmatched"
    const val CHANNEL_FEEDBACK = "feedback"

    fun ensureChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(
            CHANNEL_UNMATCHED, context.getString(R.string.notif_channel_unmatched),
            NotificationManager.IMPORTANCE_HIGH,
        ))
        nm.createNotificationChannel(NotificationChannel(
            CHANNEL_FEEDBACK, context.getString(R.string.notif_channel_feedback),
            NotificationManager.IMPORTANCE_HIGH,
        ))
    }

    fun showUnmatched(context: Context, phone: String, deviceCallKey: String) {
        val openForm = PendingIntent.getActivity(
            context, deviceCallKey.hashCode(),
            Intent(context, QuickAddActivity::class.java)
                .putExtra("phone", phone)
                .putExtra("device_call_key", deviceCallKey)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val ignore = PendingIntent.getBroadcast(
            context, deviceCallKey.hashCode() + 1,
            Intent(context, IgnoreReceiver::class.java)
                .putExtra("device_call_key", deviceCallKey),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        notifySafe(context, deviceCallKey.hashCode(),
            NotificationCompat.Builder(context, CHANNEL_UNMATCHED)
                .setSmallIcon(android.R.drawable.sym_call_missed)
                .setContentTitle(context.getString(R.string.notif_unmatched_title))
                .setContentText(context.getString(R.string.notif_unmatched_body, phone))
                .setContentIntent(openForm)
                .addAction(0, context.getString(R.string.notif_ignore_action), ignore)
                .setAutoCancel(true)
                .build())
    }

    fun showFeedback(context: Context, leadName: String, leadUrl: String) {
        val open = PendingIntent.getActivity(
            context, leadUrl.hashCode(),
            Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.BASE_URL + leadUrl)),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        notifySafe(context, leadUrl.hashCode(),
            NotificationCompat.Builder(context, CHANNEL_FEEDBACK)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(context.getString(R.string.notif_feedback_title))
                .setContentText(context.getString(R.string.notif_feedback_body, leadName))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build())
    }

    fun cancel(context: Context, id: Int) = NotificationManagerCompat.from(context).cancel(id)

    private fun notifySafe(context: Context, id: Int, n: android.app.Notification) {
        try { NotificationManagerCompat.from(context).notify(id, n) }
        catch (_: SecurityException) { /* POST_NOTIFICATIONS revoked — sync continues silently */ }
    }
}
```

`PyraCallsApp.kt`:
```kotlin
package cloud.pyramedia.calls

import android.app.Application
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.notify.Notifier
import cloud.pyramedia.calls.sync.SyncScheduler

class PyraCallsApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifier.ensureChannels(this)
        if (AppPrefs(this).isLoggedIn()) SyncScheduler.ensurePeriodic(this)
    }
}
```

Stub `ui/QuickAddActivity.kt` (replaced in Task 6):
```kotlin
package cloud.pyramedia.calls.ui

import androidx.activity.ComponentActivity

class QuickAddActivity : ComponentActivity()
```

Stub `notify/IgnoreReceiver.kt` (replaced in Task 6):
```kotlin
package cloud.pyramedia.calls.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class IgnoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { /* Task 6 */ }
}
```

Manifest: set `android:name=".PyraCallsApp"` on `<application>`; inside it add:
```xml
<activity android:name=".ui.QuickAddActivity" android:exported="false" />
<receiver android:name=".sync.PhoneStateReceiver" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.PHONE_STATE" />
    </intent-filter>
</receiver>
<receiver android:name=".notify.IgnoreReceiver" android:exported="false" />
```
And in `MainActivity`, replace the Task-4 comment with the real call:
`SyncScheduler.ensurePeriodic(this@MainActivity)` followed by
`SyncScheduler.syncNow(this@MainActivity)` (first sync right after login).

- [ ] **Step 5: Build + tests + commit**

Run: `.\gradlew.bat testDebugUnitTest assembleDebug` → `BUILD SUCCESSFUL`.
```bash
git add pyra-calls-app/app/src
git commit -m "feat(calls-app): call-log sync engine + phone-state trigger + notifications"
```

---

### Task 6: Quick-add form + ignore action + feedback notification + Home screen

**Files:**
- Replace: `ui/QuickAddActivity.kt` (real Compose form), `notify/IgnoreReceiver.kt` (real POST)
- Create: `ui/HomeScreen.kt`
- Modify: `ui/MainActivity.kt` (render HomeScreen; drop placeholder), strings.xml (append)

**Interfaces:**
- Consumes: everything above. `ApiClient.quickAdd/ignore`, `Notifier.showFeedback/cancel`,
  `CallLogReader`-free local counting via `android.provider.CallLog` +
  `DubaiTime.dayStartMillis/monthStartMillis`, `SyncScheduler.syncNow`,
  `AppPrefs.clearSession`.
- Produces: final v1 UI. Locked form rules: toggle شركة/فرد
  (default شركة); name required always; company field VISIBLE+required only
  for شركة (b2b); فرد (b2c) hides company entirely. Server 422 messages
  surface as-is; `already_existed: true` → toast-equivalent (snackbar text
  «الرقم مسجل بالفعل — تم ربط المكالمة») + NO feedback notification (matches
  server contract); success (`already_existed: false`) → `Notifier.showFeedback`
  + cancel the originating unmatched notification + finish the activity.
  409 on ignore → cancel the notification anyway (the call is already linked).

- [ ] **Step 1: strings.xml additions**

```xml
<string name="qa_title">إضافة عميل جديد</string>
<string name="qa_phone_label">الرقم</string>
<string name="qa_type_b2b">شركة</string>
<string name="qa_type_b2c">فرد</string>
<string name="qa_name">اسم العميل</string>
<string name="qa_company">اسم الشركة</string>
<string name="qa_save">حفظ كعميل</string>
<string name="qa_saving">جارٍ الحفظ…</string>
<string name="qa_already_existed">الرقم مسجل بالفعل — تم ربط المكالمة</string>
<string name="qa_name_required">اسم العميل مطلوب</string>
<string name="qa_company_required">اسم الشركة مطلوب لعميل شركة</string>
<string name="home_hello">أهلًا، %1$s</string>
<string name="home_synced">متزامن</string>
<string name="home_not_synced">غير متزامن</string>
<string name="home_today">مكالمات اليوم</string>
<string name="home_month">الشهر</string>
<string name="home_last_sync">آخر مزامنة: %1$s</string>
<string name="home_last_sync_never">لم تتم مزامنة بعد</string>
<string name="home_sync_now">مزامنة الآن</string>
<string name="home_logout">تسجيل الخروج</string>
<string name="net_error">تعذر الاتصال بالخادم</string>
```

- [ ] **Step 2: QuickAddActivity (real)**

```kotlin
package cloud.pyramedia.calls.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.QuickAddRequest
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.notify.Notifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class QuickAddActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val phone = intent.getStringExtra("phone").orEmpty()
        val deviceCallKey = intent.getStringExtra("device_call_key").orEmpty()
        if (deviceCallKey.isEmpty()) { finish(); return }
        val prefs = AppPrefs(this)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }

        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme { Surface {
                    var isB2b by remember { mutableStateOf(true) }
                    var name by remember { mutableStateOf("") }
                    var company by remember { mutableStateOf("") }
                    var saving by remember { mutableStateOf(false) }
                    var error by remember { mutableStateOf<String?>(null) }
                    val scope = rememberCoroutineScope()
                    val nameRequired = stringResource(R.string.qa_name_required)
                    val companyRequired = stringResource(R.string.qa_company_required)
                    val alreadyExisted = stringResource(R.string.qa_already_existed)
                    val netError = stringResource(R.string.net_error)

                    Column(Modifier.fillMaxSize().padding(24.dp)) {
                        Text(stringResource(R.string.qa_title), style = MaterialTheme.typography.headlineSmall)
                        Spacer(Modifier.height(8.dp))
                        Text("${stringResource(R.string.qa_phone_label)}: $phone")
                        Spacer(Modifier.height(16.dp))
                        Row {
                            FilterChip(selected = isB2b, onClick = { isB2b = true },
                                label = { Text(stringResource(R.string.qa_type_b2b)) })
                            Spacer(Modifier.width(8.dp))
                            FilterChip(selected = !isB2b, onClick = { isB2b = false },
                                label = { Text(stringResource(R.string.qa_type_b2c)) })
                        }
                        Spacer(Modifier.height(16.dp))
                        OutlinedTextField(value = name, onValueChange = { name = it },
                            label = { Text(stringResource(R.string.qa_name)) },
                            singleLine = true, modifier = Modifier.fillMaxWidth())
                        if (isB2b) {
                            Spacer(Modifier.height(12.dp))
                            OutlinedTextField(value = company, onValueChange = { company = it },
                                label = { Text(stringResource(R.string.qa_company)) },
                                singleLine = true, modifier = Modifier.fillMaxWidth())
                        }
                        error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error) }
                        Spacer(Modifier.height(24.dp))
                        Button(
                            enabled = !saving, modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                error = null
                                if (name.isBlank()) { error = nameRequired; return@Button }
                                if (isB2b && company.isBlank()) { error = companyRequired; return@Button }
                                saving = true
                                scope.launch {
                                    val req = QuickAddRequest(
                                        device_call_key = deviceCallKey,
                                        name = name.trim(),
                                        lead_type = if (isB2b) "b2b" else "b2c",
                                        company = if (isB2b) company.trim() else null,
                                    )
                                    val res = withContext(Dispatchers.IO) { api.quickAdd(req) }
                                    saving = false
                                    when (res) {
                                        is ApiResult.Ok -> {
                                            Notifier.cancel(this@QuickAddActivity, deviceCallKey.hashCode())
                                            if (res.data.already_existed) {
                                                Toast.makeText(this@QuickAddActivity, alreadyExisted, Toast.LENGTH_LONG).show()
                                            } else {
                                                Notifier.showFeedback(this@QuickAddActivity, res.data.lead_name, res.data.lead_url)
                                            }
                                            finish()
                                        }
                                        is ApiResult.Err -> error = res.message
                                        ApiResult.NetworkError -> error = netError
                                    }
                                }
                            },
                        ) { Text(stringResource(if (saving) R.string.qa_saving else R.string.qa_save)) }
                    }
                } }
            }
        }
    }
}
```

- [ ] **Step 3: IgnoreReceiver (real)**

```kotlin
package cloud.pyramedia.calls.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.AppPrefs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class IgnoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val key = intent.getStringExtra("device_call_key") ?: return
        val pending = goAsync()
        val prefs = AppPrefs(context)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // 200 → ignored; 409 → already lead-linked; either way the prompt is obsolete
                api.ignore(key)
                Notifier.cancel(context, key.hashCode())
            } finally {
                pending.finish()
            }
        }
    }
}
```

- [ ] **Step 4: HomeScreen + MainActivity wiring**

`HomeScreen.kt`:
```kotlin
package cloud.pyramedia.calls.ui

import android.provider.CallLog
import android.content.Context
import android.text.format.DateFormat
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.DubaiTime
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.sync.SyncScheduler
import java.util.Date

private fun countSince(context: Context, sinceMillis: Long): Int {
    context.contentResolver.query(
        CallLog.Calls.CONTENT_URI, arrayOf(CallLog.Calls._ID),
        "${CallLog.Calls.DATE} >= ?", arrayOf(sinceMillis.toString()), null,
    )?.use { return it.count }
    return 0
}

@Composable
fun HomeScreen(prefs: AppPrefs, onLogout: () -> Unit) {
    val context = LocalContext.current
    var refreshTick by remember { mutableStateOf(0) }
    val now = System.currentTimeMillis()
    val todayCount = remember(refreshTick) { countSince(context, DubaiTime.dayStartMillis(now)) }
    val monthCount = remember(refreshTick) { countSince(context, DubaiTime.monthStartMillis(now)) }
    val lastSync = prefs.lastSyncAtMillis
    val synced = lastSync > 0 && now - lastSync < 30 * 60 * 1000

    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.home_hello, prefs.displayName ?: ""),
                style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            AssistChip(onClick = {}, label = {
                Text(stringResource(if (synced) R.string.home_synced else R.string.home_not_synced))
            })
        }
        Spacer(Modifier.height(24.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(stringResource(R.string.home_today), style = MaterialTheme.typography.labelMedium)
                Text("$todayCount", style = MaterialTheme.typography.displaySmall)
            }
        }
        Spacer(Modifier.height(12.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(stringResource(R.string.home_month), style = MaterialTheme.typography.labelMedium)
                Text("$monthCount", style = MaterialTheme.typography.displaySmall)
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            if (lastSync > 0)
                stringResource(R.string.home_last_sync,
                    DateFormat.getTimeFormat(context).format(Date(lastSync)))
            else stringResource(R.string.home_last_sync_never),
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.weight(1f))
        Button(modifier = Modifier.fillMaxWidth(), onClick = {
            SyncScheduler.syncNow(context); refreshTick++
        }) { Text(stringResource(R.string.home_sync_now)) }
        Spacer(Modifier.height(8.dp))
        TextButton(modifier = Modifier.fillMaxWidth(), onClick = onLogout) {
            Text(stringResource(R.string.home_logout))
        }
    }
}
```
In `MainActivity`, replace the `Text(...)` placeholder branch with:
```kotlin
else -> HomeScreen(prefs) {
    prefs.clearSession()
    loggedIn = false
}
```

- [ ] **Step 5: Build + tests + commit**

Run: `.\gradlew.bat testDebugUnitTest assembleDebug` → `BUILD SUCCESSFUL`.
```bash
git add pyra-calls-app/app/src
git commit -m "feat(calls-app): quick-add form + ignore action + feedback deep-link + home"
```

---

### Task 7: Emulator E2E + release APK + docs

**Files:**
- Create: release keystore at `C:\Users\engmo\pyra-keys\pyra-calls-release.keystore` (OUTSIDE the repo)
- Modify: `app/build.gradle.kts` (release signing from `local.properties`-style
  private file `C:\Users\engmo\pyra-keys\signing.properties`)
- Modify: `docs/CALL-TRACKING.md` (append "Building & installing the APK" section)

- [ ] **Step 1: Create AVD + boot emulator**

```powershell
$sdk = "C:\Users\engmo\AppData\Local\Android\Sdk"
& "$sdk\cmdline-tools\latest\bin\avdmanager.bat" list  # find the exact installed system-image id under android-36
# then (substitute the exact image id found):
echo no | & "$sdk\cmdline-tools\latest\bin\avdmanager.bat" create avd -n pyra_a15_test -k "system-images;android-36;google_apis;x86_64"
Start-Process "$sdk\emulator\emulator.exe" -ArgumentList "-avd","pyra_a15_test","-no-snapshot","-no-audio"
& "$sdk\platform-tools\adb.exe" wait-for-device
```
Expected: emulator boots (`adb devices` shows `emulator-5554 device`).
(The installed system image directory is `system-images\android-36` — list
its subfolders to get the exact `google_apis`/ABI segment before creating.)

- [ ] **Step 2: Prepare the server side (same pattern as server Task 8)**

Start `pnpm dev` in the workspace repo. Create a TEMP test agent
(`calltest2.temp@pyramedia.internal`, role `sales_agent`, active) via the
same scratch-script approach documented in `.superpowers/sdd/task-8-report.md`.

- [ ] **Step 3: Install + walk the full flow on the emulator**

```powershell
cd C:\xampp\htdocs\pyra-workspace-3\pyra-calls-app
.\gradlew.bat installDebug
& "$sdk\platform-tools\adb.exe" shell am start -n cloud.pyramedia.calls/.ui.MainActivity
```
Then, driving via adb (screenshots with `adb exec-out screencap -p > shotN.png`
after each stage, saved to the scratchpad):
1. Grant the 3 permissions via the on-screen dialog (`adb shell input tap` on
   the dialog buttons, or `adb shell pm grant cloud.pyramedia.calls android.permission.READ_CALL_LOG` etc. for the two non-notification ones).
2. Log in with the temp agent (adb `input text` — email/password fields).
   Verify: `pyra_api_keys` has `device:calltest2.temp:<deviceId>` active.
3. Simulate calls: incoming `adb emu gsm call 0568112299` → `adb emu gsm accept`
   → wait 10s → `adb emu gsm cancel`; missed: `gsm call` then `gsm cancel`
   without accept; outgoing: `adb shell am start -a android.intent.action.CALL -d tel:0568112288`
   then `adb emu gsm cancel`.
4. Wait ~15s (PHONE_STATE listener) → verify `pyra_agent_calls` rows appear
   (via `pnpm db:query`) with correct directions + `device_call_key`
   `<deviceId>:<n>`, and that an "رقم غير مسجل" notification is present:
   `adb shell dumpsys notification --noredact | findstr /i "unmatched pyra"`.
5. Tap the notification (`adb shell input tap` on coordinates from
   `dumpsys` / screenshot) → quick-add form shows prefilled phone → fill
   name/company (b2b) → save → verify: lead row + `call_feedback_required`
   notification in DB + the feedback notification on the emulator + tapping
   it opens the browser at `http://10.0.2.2:3000/dashboard/crm/leads/<id>`.
6. Ignore flow: simulate another call from a new number → tap «تجاهل» action
   → verify `pyra_ignored_numbers` row + notification dismissed → call the
   same number again → sync returns `ignored`, NO new notification.
7. Cursor freeze test is NOT live-triggerable (needs a server 'error') —
   covered by `SyncPlannerTest`; note it in the report.
8. **CLEANUP (production DB — zero trace, verify counts):** delete
   pyra_agent_calls for the temp agent, the test leads + activities +
   notifications + ignored-numbers + device keys + pyra_users row + Auth
   user (same list as server Task 8).

- [ ] **Step 4: Release signing + APK**

```powershell
New-Item -ItemType Directory -Force "C:\Users\engmo\pyra-keys"
& "C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot\bin\keytool.exe" -genkeypair -v `
  -keystore "C:\Users\engmo\pyra-keys\pyra-calls-release.keystore" `
  -alias pyracalls -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass <GENERATE-AND-RECORD> -dname "CN=Pyramedia X, O=Pyramedia, C=AE"
```
Write `C:\Users\engmo\pyra-keys\signing.properties`:
```properties
storeFile=C\:\\Users\\engmo\\pyra-keys\\pyra-calls-release.keystore
storePassword=<same>
keyAlias=pyracalls
keyPassword=<same>
```
In `app/build.gradle.kts`, load it if present (release stays buildable
unsigned-debug otherwise):
```kotlin
val signingProps = java.util.Properties().apply {
    val f = file("C:/Users/engmo/pyra-keys/signing.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
android {
    signingConfigs {
        if (signingProps.isNotEmpty()) {
            create("release") {
                storeFile = file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        release {
            // ...existing...
            if (signingProps.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
    }
}
```
Build: `.\gradlew.bat assembleRelease` →
`app\build\outputs\apk\release\app-release.apk`. Record its SHA-256
(`Get-FileHash`). Install-verify on the emulator: `adb install -r app-release.apk`
(release build hits PRODUCTION `workspace.pyramedia.cloud` — do NOT log in
with real credentials during this step; installing + reaching the login
screen is the verification).

- [ ] **Step 5: Docs + final verify + commit**

Append to `docs/CALL-TRACKING.md` a "## Building & installing the APK"
section: wrapper build commands, keystore location + backup warning (losing
it means new signature → uninstall/reinstall on phones), `adb install`
step, and where the APK lands. Run `pnpm run check` (workspace untouched →
0 errors). Commit:
```bash
git add pyra-calls-app docs/CALL-TRACKING.md
git commit -m "feat(calls-app): release signing + emulator e2e + build docs"
```

---

## After this plan

Physical rollout (operational, with Abdou): install the release APK on
youssef's A15 → run the provisioning checklist in docs/CALL-TRACKING.md
(permissions → battery Unrestricted + Never-sleeping → login as youssef →
test call → verify in /dashboard/crm/calls). sayed has left the company —
his account stays inactive; a future hire logs into the same app on his
old phone with their own account.
