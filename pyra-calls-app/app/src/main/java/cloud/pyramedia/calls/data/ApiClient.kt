package cloud.pyramedia.calls.data

import cloud.pyramedia.calls.BuildConfig
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
    // Sent on every request as `x-app-version` — lets the server's device-auth
    // gate stamp pyra_api_keys.app_version_code for fleet-version visibility.
    // Default arg, kept BEFORE deviceKeyProvider so it stays the trailing
    // lambda param — every existing `ApiClient(url) { prefs.deviceKey }`
    // call site keeps compiling unchanged.
    private val appVersion: Int = BuildConfig.VERSION_CODE,
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

    fun logErrors(events: List<ErrorEvent>): ApiResult<LogErrorData> =
        post("/api/mobile/log-error", LogErrorRequest(events),
            LogErrorRequest.serializer(), LogErrorData.serializer(), withKey = true)

    // Heartbeat — the only GET in this client. Called on empty sync passes so
    // the server's pyra_api_keys.last_used_at still reflects device liveness
    // (see SyncWorker: normal syncs only touch the network when there ARE
    // calls to send, so an idle-but-alive phone would otherwise look
    // identical to a dead one).
    fun ping(): ApiResult<PingData> =
        get("/api/mobile/ping", PingData.serializer())

    private fun <T> get(path: String, dataSer: KSerializer<T>): ApiResult<T> {
        val key = deviceKeyProvider() ?: return ApiResult.Err(401, "لا يوجد مفتاح جهاز")
        val builder = Request.Builder()
            .url(baseUrl + path)
            .header("x-api-key", key)
            .header("x-app-version", appVersion.toString())
            .get()
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

    private fun <B, T> post(
        path: String, body: B,
        bodySer: KSerializer<B>, dataSer: KSerializer<T>, withKey: Boolean,
    ): ApiResult<T> {
        val builder = Request.Builder()
            .url(baseUrl + path)
            .header("x-app-version", appVersion.toString())
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
