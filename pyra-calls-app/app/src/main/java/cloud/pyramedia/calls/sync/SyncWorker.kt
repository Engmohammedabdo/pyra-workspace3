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
                // empty pass is still a successful heartbeat — Home's staleness pill depends on it
                prefs.lastSyncAtMillis = System.currentTimeMillis()
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
