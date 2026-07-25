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
    // Additive (v1.4+ server, whole-wave review Gap 2) — only meaningful
    // when status="matched". The server's lead index is system-wide, so a
    // call can match a COLLEAGUE's lead; owned=false means the calling
    // agent is NOT that lead's assigned_to and must not be offered the
    // outcome-logging action (that POST 403s — see SyncWorker's `r.owned !=
    // false` gate). Defaults null so an OLD server response (field absent)
    // never gets misread as "not owned".
    val owned: Boolean? = null,
)
@Serializable data class SyncData(val results: List<SyncResult>)
@Serializable data class QuickAddRequest(
    val device_call_key: String, val name: String, val lead_type: String,
    val company: String? = null,
    // v1.3 — CRM-aligned source picker. Appended after the existing fields so
    // this stays backwards-compatible in either direction: the server
    // whitelists+defaults to 'phone_call' on absence (pre-v1.3 encoders never
    // sent this key), and PyraJson's explicitNulls=false omits it entirely
    // when null.
    val source: String? = null,
)
@Serializable data class QuickAddData(
    val lead_id: String, val lead_name: String, val lead_url: String,
    val already_existed: Boolean,
)
@Serializable data class IgnoreRequest(val device_call_key: String)
@Serializable data class IgnoreData(val ignored: Boolean, val updated_calls: Int)
@Serializable data class PingData(val ok: Boolean)
@Serializable data class Envelope<T>(val data: T? = null, val error: String? = null)

@Serializable data class ErrorEvent(
    val message: String,
    val stack: String? = null,
    val source: String,
    val severity: String = "error",
    val occurred_at: String,
    val android_version: String,
    val app_version_code: Int,
)
@Serializable data class LogErrorRequest(val errors: List<ErrorEvent>)
@Serializable data class LogErrorData(val received: Int)

@Serializable data class AppVersionInfo(
    val version_code: Int, val version_name: String, val release_notes: String? = null,
)
@Serializable data class AppVersionData(val latest: AppVersionInfo? = null)
@Serializable data class AppDownloadData(
    val url: String, val version_code: Int, val sha256: String, val size_bytes: Long,
)

// POST /api/mobile/call-outcome — field names mirror
// app/api/mobile/call-outcome/route.ts EXACTLY (cross-checked against the
// route, not the task brief): request reads body.lead_id/outcome/note/
// next_follow_up_at (route.ts:90-93); response is apiSuccess({ activity_id,
// follow_up_id, follow_up_error, deduplicated }) (route.ts:303). `outcome`
// is a free string here (not a Kotlin enum) — the server is the single
// source of truth for the 3 allowed values (interested/not_interested/
// call_again); duplicating them as a Kotlin enum would just be a second
// place to keep in sync.
@Serializable data class CallOutcomeRequest(
    val lead_id: String, val outcome: String,
    val note: String? = null, val next_follow_up_at: String? = null,
)
@Serializable data class CallOutcomeData(
    val activity_id: String, val follow_up_id: String? = null,
    // Flip-and-warn (route.ts:58-65): the route returns HTTP 200 with
    // follow_up_error=true when the optional follow-up insert failed AFTER
    // the outcome itself was already saved — this is NOT a request failure.
    // deduplicated=true means a 60s retry matched an existing outcome and is
    // also NOT an error — both booleans default false for forward-compat if
    // a future response ever omits them.
    val follow_up_error: Boolean = false, val deduplicated: Boolean = false,
)

// GET /api/mobile/my-day — field names mirror app/api/mobile/my-day/route.ts's
// followUpItems/goingCold/counts mapping EXACTLY (cross-checked against the
// route, not the original task plan — PyraJson's ignoreUnknownKeys silently
// nulls a renamed field instead of failing loudly).
@Serializable data class MyDayFollowUp(
    val id: String, val lead_id: String? = null, val lead_name: String? = null,
    val phone: String? = null, val title: String, val due_at: String,
    val status: String, // "overdue" | "pending"
)
@Serializable data class MyDayColdLead(
    val lead_id: String, val lead_name: String, val phone: String? = null,
    val company: String? = null, val days_since_contact: Int,
)
@Serializable data class MyDayCounts(val follow_ups: Int, val going_cold: Int)
@Serializable data class MyDayData(
    val follow_ups: List<MyDayFollowUp>, val going_cold: List<MyDayColdLead>,
    val counts: MyDayCounts,
)
