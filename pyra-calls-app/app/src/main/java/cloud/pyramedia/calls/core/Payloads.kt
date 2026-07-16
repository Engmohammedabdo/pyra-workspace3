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
