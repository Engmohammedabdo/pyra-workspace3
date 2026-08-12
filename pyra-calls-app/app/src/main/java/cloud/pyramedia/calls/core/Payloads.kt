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
    // Additive (wave C). The agent's earliest OPEN follow-up on the matched
    // lead, so the "مكالمة مع…" notification can hand it straight to
    // CallOutcomeActivity and the rep closes the loop without opening a list.
    // Null both when the server is older (field absent) and when the lead
    // genuinely has no open follow-up — the app treats both the same way.
    val open_follow_up_id: String? = null,
    // Wave C audit Fix 1 — the follow-up's IDENTITY, so the outcome sheet can
    // actually show the rep what it is about to close instead of a bare
    // switch with no title or date. All three are present iff
    // open_follow_up_id is non-null; each still needs its own default
    // because PyraJson's explicitNulls=false means an older server (field
    // absent) must decode cleanly instead of throwing.
    val open_follow_up_title: String? = null,
    val open_follow_up_due_at: String? = null, // ISO timestamptz
    val open_follow_up_overdue: Boolean = false,
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

// `is_mandatory` (CA-C2, migration 056) — field name cross-checked against
// app/api/mobile/app-version/route.ts:36's
// `.select('version_code, version_name, release_notes, is_mandatory')`
// EXACTLY, not against the task brief — PyraJson's ignoreUnknownKeys means a
// drifted name here would silently decode to the `false` default below
// instead of failing loudly, which for THIS field means "never blocks"
// rather than a visible crash. Defaults false so a pre-CA-C1 server response
// (or one that omits the column) can never accidentally trigger a block.
@Serializable data class AppVersionInfo(
    val version_code: Int, val version_name: String, val release_notes: String? = null,
    val is_mandatory: Boolean = false,
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
    // Wave C. REQUIRED by the server when outcome == "not_interested" (≥5
    // chars after trim) and REJECTED with a 422 alongside any other outcome —
    // so this must be null unless the rep picked «غير مهتم».
    // PyraJson's explicitNulls=false omits the key entirely when null, which
    // is what keeps the "rejected with other outcomes" rule satisfiable.
    val not_interested_reason: String? = null,
    // Wave C. The follow-up this call answers. Server checks it belongs to the
    // SAME lead and to the calling agent, else 403.
    val complete_follow_up_id: String? = null,
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
    // Wave C warn-don't-fail flags: the outcome WAS saved, but the stage move
    // and/or the follow-up close did not land. Default false so an older
    // server (fields absent) never reads as a failure.
    val stage_error: Boolean = false, val complete_error: Boolean = false,
)

// POST /api/mobile/follow-ups/complete — close a follow-up with no call.
// `reason` is a closed server-side set: "duplicate" | "wrong_number".
@Serializable data class CompleteFollowUpRequest(val follow_up_id: String, val reason: String)
@Serializable data class CompleteFollowUpData(val follow_up_id: String, val closed: Boolean = true)

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
// Wave د+ #06 — a never-contacted lead row. Field names mirror
// app/api/mobile/my-day/route.ts's `never_contacted` mapping EXACTLY
// (id/name/phone/created_at), not the task brief's `MyDayLead` sketch.
@Serializable data class MyDayLead(
    val id: String, val name: String, val phone: String? = null, val created_at: String,
)
@Serializable data class MyDayCounts(
    val follow_ups: Int, val going_cold: Int,
    // Wave C, nullable BY CONTRACT: the server reports null when its count
    // query failed rather than taking the whole screen down. Null means "I
    // don't know" — the screen falls back to two tabs, never to zero.
    val overdue: Int? = null,
    // Additive (wave د+ #06). Defaulted so an older server response — or a
    // rollback — decodes fine and simply shows no fourth tab. Unlike
    // `overdue`, this is NOT read from the response's `counts` object — the
    // server reports it as a top-level `never_contacted_count` sibling
    // instead (see `MyDayData` below) — so this field only ever gets a value
    // if the caller assembles a `MyDayCounts` by hand from that sibling.
    val neverContacted: Int? = null,
)
@Serializable data class MyDayData(
    val follow_ups: List<MyDayFollowUp>, val going_cold: List<MyDayColdLead>,
    val counts: MyDayCounts,
    // Additive (wave د+ #06). Defaulted so an older server response — or a
    // rollback — decodes fine and simply shows no fourth tab.
    val never_contacted: List<MyDayLead> = emptyList(),
    // Wave د+ #07 — nullable to distinguish "unknown" (null on query error)
    // from "confirmed zero" (0 when count succeeds). Defaults null so an
    // older server response decodes fine and the app shows no fourth tab.
    val never_contacted_count: Int? = null,
)
