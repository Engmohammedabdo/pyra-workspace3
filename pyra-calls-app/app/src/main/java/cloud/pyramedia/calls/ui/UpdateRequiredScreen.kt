package cloud.pyramedia.calls.ui

import android.content.Intent
import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.UpdatePolicy
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.ui.components.PyraScreen
import kotlinx.coroutines.delay

private const val TAG = "UpdateRequiredScreen"

/**
 * Full-screen, non-dismissable block for a MANDATORY release the installed
 * app hasn't caught up to yet ([cloud.pyramedia.calls.core.UpdatePolicy.shouldBlock]).
 *
 * Lives ONLY inside MainActivity's `when {}` — it is a composition-level
 * gate on Home, nothing more. Background call syncing
 * (SyncWorker/SyncScheduler/PhoneStateReceiver) and the unknown-number
 * QuickAddActivity notification path are untouched by this screen's
 * presence: SyncWorker is a CoroutineWorker driven by WorkManager
 * (SyncScheduler.ensurePeriodic/syncNow), entirely independent of whatever
 * Activity/composition happens to be on screen, and QuickAddActivity is
 * launched directly from the "unmatched number" notification's own
 * PendingIntent (FLAG_ACTIVITY_NEW_TASK) — it never routes through
 * MainActivity's `when {}` at all. See the CA-C2 report for how this was
 * verified.
 *
 * ONE action: open [UpdateActivity]. No skip, no back — [BackHandler]
 * consumes the system back button so it can't dismiss this screen.
 *
 * [onRecheck] is the CA-C2 fix-round-1 belt-and-braces escape: MainActivity's
 * `blocked` already goes live on ON_RESUME (see `rememberPendingUpdate` in
 * PermissionsScreen.kt), but a rep who leaves the phone sitting on THIS
 * screen — never backgrounding/foregrounding the app — would never trigger
 * that.
 *
 * CA-C3 fix round 2 — round 1's poll only re-read [AppPrefs]' LOCAL cache,
 * and that cache is only ever refreshed by SyncWorker's OWN
 * `/api/mobile/app-version` poll, throttled to once per 6h
 * ([UpdatePolicy.CHECK_INTERVAL_MILLIS]). So a rep parked on this exact
 * screen could stay blocked for up to ~6h after the owner un-mandates or
 * rolls back the release that put them here — a safety valve that slow is
 * not a safety valve. The `LaunchedEffect` below now hits the server
 * DIRECTLY via [ApiClient.appVersion] every
 * [UpdatePolicy.BLOCKED_POLL_INTERVAL_MILLIS] (60s) instead, and writes
 * whatever it finds into [AppPrefs] before calling [onRecheck] to refresh
 * the live Compose state — this is the ONLY place in the app that bypasses
 * the 6h throttle, and only while this screen is actually composed.
 *
 * Failure handling is deliberate: a network error (or non-2xx response)
 * must NEVER clear the block — a rep offline in a basement must not slip
 * past a genuine mandatory update just because one poll failed — so only
 * the success branch below ever touches [AppPrefs]. Every other branch just
 * logs and waits for the next tick; nothing here can crash or spam (at most
 * one HTTP call per minute).
 *
 * The loop lives entirely inside this `@Composable`'s `LaunchedEffect(Unit)`,
 * so structured concurrency does the rest: the moment `blocked` in
 * MainActivity flips false (including as a direct result of THIS poll
 * succeeding) or the app backgrounds far enough to tear down the
 * composition, this screen leaves composition, its coroutine scope is
 * cancelled, and the `while (true)` loop stops — there is no separate
 * lifecycle to manage and nothing keeps polling once the screen is gone.
 */
@Composable
fun UpdateRequiredScreen(
    versionName: String,
    api: ApiClient,
    prefs: AppPrefs,
    onRecheck: () -> Unit,
) {
    val context = LocalContext.current

    BackHandler { /* consumed — no escape short of updating */ }

    LaunchedEffect(Unit) {
        while (true) {
            delay(UpdatePolicy.BLOCKED_POLL_INTERVAL_MILLIS)
            val res = api.appVersion()

            // B-15 — this poll is an AUTHENTICATED call, so its result is
            // evidence about the device key and must be recorded like every
            // other one (SyncWorker and HomeScreen already do this). Without
            // it, a key revoked while the rep is parked on this exact screen
            // is invisible here: the poll just logs 401 forever, `blocked`
            // never clears, and the download button cannot work either — the
            // dead end AppGate.Screen.SESSION_DEAD_BLOCKED exists to escape.
            // Recording it means two consecutive 401/403s (~2 min at this
            // interval) flip `sessionDead`, and `onRecheck` below re-reads it,
            // so the way out appears on its own with no action from the rep.
            //
            // Every branch records, including NetworkError: SessionHealth
            // ignores anything that is not 401/403, so a basement network
            // error neither accumulates toward "dead" nor clears a real
            // streak. Passing it through is what keeps that judgement in the
            // one place that owns it.
            prefs.recordAuthOutcome(
                ok = res is ApiResult.Ok,
                errorCode = (res as? ApiResult.Err)?.code,
            )

            when (res) {
                is ApiResult.Ok -> {
                    val latest = res.data.latest
                    // Mirrors SyncWorker's own "Self-update check" mapping
                    // byte-for-byte, so the two poll paths (the normal 6h one
                    // and this fast blocked-only one) can never disagree on
                    // what the pending-update cache should hold.
                    if (latest != null &&
                        UpdatePolicy.shouldShowBanner(latest.version_code, BuildConfig.VERSION_CODE)
                    ) {
                        prefs.pendingUpdateVersionCode = latest.version_code
                        prefs.pendingUpdateVersionName = latest.version_name
                        prefs.pendingUpdateMandatory = latest.is_mandatory
                    } else {
                        prefs.pendingUpdateVersionCode = 0
                        prefs.pendingUpdateVersionName = null
                        prefs.pendingUpdateMandatory = false
                    }
                }
                // Deliberately NOT clearing/touching the PENDING-UPDATE cache
                // here — see the failure-handling note in this function's doc
                // comment above. (The session-health write above is a separate
                // concern and deliberately happens on every branch.)
                is ApiResult.Err ->
                    Log.w(TAG, "blocked-poll app-version check failed: ${res.code} ${res.message}")
                ApiResult.NetworkError ->
                    Log.w(TAG, "blocked-poll app-version check: network error, will retry next tick")
            }

            // Unconditional, and that is the B-15 half: on the Ok branch it
            // publishes whatever the poll just wrote (as before), but on a 401
            // it is the ONLY thing that lets the freshly-flipped `sessionDead`
            // reach the gate. Leaving it inside the Ok branch would mean the
            // escape screen never appears for the rep who is actually stuck,
            // since a dead key can only ever produce the Err branch. Safe to
            // call either way: it only re-reads AppPrefs, and on a failed poll
            // the pending-update cache is unchanged, so that half is a no-op.
            onRecheck()
        }
    }

    PyraScreen(onBack = null) {
        // fillMaxWidth is what makes textAlign mean anything: a Text sizes to
        // its own content, and PyraScreen's content Column aligns Start (the
        // bare Column this replaced set CenterHorizontally itself). Without
        // it, textAlign = Center is a no-op and the text hugs the start edge.
        Text(
            stringResource(R.string.update_required_title),
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            stringResource(R.string.update_required_body, versionName),
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { context.startActivity(Intent(context, UpdateActivity::class.java)) },
        ) {
            Text(stringResource(R.string.update_required_button))
        }
        Spacer(Modifier.height(16.dp))
        Text(
            stringResource(R.string.update_required_contact_admin),
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
        )
    }
}
