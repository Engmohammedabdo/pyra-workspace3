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
                // one from the server's point of view. The ping result no
                // longer goes fully ignored: it is also the only auth signal
                // this pass produces (an empty batch never calls api.sync()),
                // so it still has to feed the dead-session tracker or a
                // revoked device key on a quiet phone would never trip it.
                val pong = api.ping()
                prefs.recordAuthOutcome(pong is ApiResult.Ok, (pong as? ApiResult.Err)?.code)
                break
            }
            when (val res = api.sync(batch.calls.map { it.entry })) {
                is ApiResult.Ok -> {
                    prefs.recordAuthOutcome(true, null)
                    val byKey = batch.calls.associateBy { it.entry.device_call_key }
                    for (r in res.data.results) {
                        if (r.status == "unmatched") {
                            byKey[r.device_call_key]?.let {
                                Notifier.showUnmatched(applicationContext, it.entry.phone, r.device_call_key)
                            }
                        }
                        if (r.status == "matched" && r.lead_id != null && r.lead_name != null) {
                            // Whole-wave review Gap 1: the server echoes 'matched' for
                            // ANY phone match, connected or not (measured in prod: 312
                            // of 843 matched calls over 30 days were not connected, 293
                            // of those 0-second outgoing dials). Notifying on those is
                            // worse than noise — the notification's primary action opens
                            // CallOutcomeActivity to log an outcome, and logging an
                            // outcome bumps last_contact_at for a call that never
                            // happened. That re-opens by hand the exact fake-contact
                            // channel the urgent-fix wave spent days purging (257
                            // backfilled activities, UF-T1/UF-T2). Mirror the server's
                            // isConnectedCall rule (lib/calls/match.ts) locally using the
                            // CallLogReader-derived entry already keyed in `byKey`.
                            val entry = byKey[r.device_call_key]?.entry
                            val connected = entry != null && entry.direction != "missed" &&
                                entry.duration_seconds > 0
                            // Gap 2: the server's lead index is system-wide, so a call
                            // can match a COLLEAGUE's lead. r.owned is additive (v1.4+
                            // server only) — treat null as owned so an OLDER server
                            // (field absent) can never silently silence a legitimate
                            // notification. owned=false means the outcome-logging action
                            // would guaranteed-403 (ownership gate), so skip it entirely.
                            val owned = r.owned != false
                            if (connected && owned) {
                                Notifier.showMatched(
                                    applicationContext, r.lead_name, r.lead_id, r.open_follow_up_id,
                                    r.open_follow_up_title, r.open_follow_up_due_at,
                                    r.open_follow_up_overdue,
                                )
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
                    prefs.recordAuthOutcome(false, res.code)
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
        if (pending.isNotEmpty()) {
            val logRes = api.logErrors(pending)
            prefs.recordAuthOutcome(logRes is ApiResult.Ok, (logRes as? ApiResult.Err)?.code)
            if (logRes is ApiResult.Ok) queue.removeShipped(pending.size)
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
                // Reported inside this runCatching on purpose (Fix 2): a
                // throw anywhere in this block — including from this call —
                // must never fail the sync cycle, and that guarantee has to
                // cover the auth-outcome write too.
                prefs.recordAuthOutcome(v is ApiResult.Ok, (v as? ApiResult.Err)?.code)
                if (v is ApiResult.Ok) {
                    val latest = v.data.latest
                    // Cache what THIS poll found so Home's banner and
                    // MainActivity's blocking screen can react without
                    // re-polling (CA-C2 Step 1) — mirrors
                    // UpdatePolicy.shouldShowBanner's own "newer" test so the
                    // cache and the pure decision functions never disagree.
                    // Also clears back to "none" the moment the server no
                    // longer reports anything newer: AppPrefs'
                    // clearPendingUpdateIfInstalled only covers the device
                    // catching up by installing — without this "else"
                    // branch, a release pulled/rolled back after being
                    // published could leave a phone stuck behind a
                    // mandatory block it can never satisfy.
                    if (latest != null && UpdatePolicy.shouldShowBanner(latest.version_code, BuildConfig.VERSION_CODE)) {
                        prefs.pendingUpdateVersionCode = latest.version_code
                        prefs.pendingUpdateVersionName = latest.version_name
                        prefs.pendingUpdateMandatory = latest.is_mandatory
                    } else {
                        prefs.pendingUpdateVersionCode = 0
                        prefs.pendingUpdateVersionName = null
                        prefs.pendingUpdateMandatory = false
                    }
                    if (latest != null && UpdatePolicy.shouldNotify(
                            latest.version_code, BuildConfig.VERSION_CODE,
                            prefs.lastUpdateNotifiedCode, prefs.lastUpdateNotifiedAtMillis, now,
                            latest.is_mandatory)) {
                        Notifier.showUpdate(applicationContext, latest.version_name, latest.is_mandatory)
                        prefs.lastUpdateNotifiedCode = latest.version_code
                        prefs.lastUpdateNotifiedAtMillis = now
                    }
                }
            }
        }

        return Result.success()
    }
}
