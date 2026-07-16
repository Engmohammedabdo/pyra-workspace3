package cloud.pyramedia.calls.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.core.SyncPlanner
import cloud.pyramedia.calls.core.UpdatePolicy
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.CallLogReader
import cloud.pyramedia.calls.data.ErrorQueue
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
                // empty pass is still a successful heartbeat — Home's staleness pill depends on it
                prefs.lastSyncAtMillis = System.currentTimeMillis()
                // Ping the server so pyra_api_keys.last_used_at reflects that
                // the app is still alive even when there's nothing to sync —
                // otherwise a background-killed app looks identical to an idle
                // one from the server's point of view. Result is intentionally
                // ignored: a failed ping must not change worker behavior, it
                // exists purely as a liveness signal for the device-silent-check
                // cron.
                api.ping()
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
                is ApiResult.Err -> {
                    // 5xx/401/403 are server/auth-side failures worth flagging loudly;
                    // everything else (e.g. 422 validation) is a lower-severity warning.
                    val severity =
                        if (res.code >= 500 || res.code == 401 || res.code == 403) "error" else "warning"
                    ErrorQueue(applicationContext).enqueue(
                        message = "HTTP ${res.code}: ${res.message}",
                        source = "sync_failed",
                        severity = severity,
                    )
                    return Result.success() // 401/403/422: not retryable here; Home shows staleness
                }
                ApiResult.NetworkError -> return Result.retry()
            }
        }

        // Ship whatever the queue holds — up to 20 events — now that this
        // cycle finished successfully (either an empty pass or the last
        // page). Failure just leaves the lines in place for the next cycle;
        // no retry escalation, no new Result semantics.
        val queue = ErrorQueue(applicationContext)
        val pending = queue.snapshot()
        if (pending.isNotEmpty() && api.logErrors(pending) is ApiResult.Ok) {
            queue.removeShipped(pending.size)
        }

        // Self-update check — throttled to once per 6h (UpdatePolicy). Wrapped
        // in runCatching so a failure here (network hiccup, unexpected
        // payload shape) can NEVER turn an otherwise-successful sync cycle
        // into a retry/failure; this is purely a side-channel notification.
        runCatching {
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
        }

        return Result.success()
    }
}
