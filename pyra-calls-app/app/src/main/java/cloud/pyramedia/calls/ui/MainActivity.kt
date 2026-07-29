package cloud.pyramedia.calls.ui

import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.content.ContextCompat
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.core.DubaiTime
import cloud.pyramedia.calls.core.UpdatePolicy
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.ErrorQueue
import cloud.pyramedia.calls.sync.SyncScheduler

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = AppPrefs(this)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }

        // CA-C2 — the OTHER clearing direction for the pending-update cache:
        // if this launch is already running the version SyncWorker last
        // cached as pending (the update installed and the process
        // restarted), drop the cache so the banner/blocking screen vanish
        // with no extra poll. Must run before `blocked` is computed below.
        prefs.clearPendingUpdateIfInstalled(BuildConfig.VERSION_CODE)

        // Session-loss tripwire: true iff the device was logged in on a prior
        // run but isn't now, with no explicit logout in between — the exact
        // signature of the EncryptedSharedPreferences keyset failure this
        // migration exists to escape. consumeSessionLossEvent() resets the
        // flag (fires once) and sets pendingSessionLossReport.
        // A2: ErrorQueue reports pending_session_loss_report + pending_migration_loss_report
        prefs.consumeSessionLossEvent()

        // Flag consumption (both flags follow the identical check → enqueue →
        // clear pattern): pendingSessionLossReport was just set above (if the
        // tripwire fired); pendingMigrationLossReport was set at AppPrefs
        // init time if the old encrypted store existed but couldn't be read.
        if (prefs.pendingSessionLossReport) {
            ErrorQueue(this).enqueue(
                message = "device session lost without explicit logout",
                source = "session_lost",
                severity = "error",
            )
            prefs.pendingSessionLossReport = false
        }
        if (prefs.pendingMigrationLossReport) {
            ErrorQueue(this).enqueue(
                message = "encrypted session store unreadable at migration",
                source = "session_migration_failed",
                severity = "error",
            )
            prefs.pendingMigrationLossReport = false
        }

        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme {
                    Surface {
                        var granted by remember { mutableStateOf(allPermissionsGranted()) }
                        var loggedIn by remember { mutableStateOf(prefs.isLoggedIn()) }
                        // Per-release mandatory block (CA-C2). Deliberately
                        // placed AFTER the permissions/login branches below
                        // and BEFORE the normal Home branch: a logged-out
                        // user who is also behind a mandatory release must
                        // still see LoginScreen, not a screen with one
                        // action they have no session to complete anything
                        // from — trapping them here would be worse than not
                        // blocking at all.
                        //
                        // CA-C2 fix round 1: `blocked` derives from
                        // rememberPendingUpdate's LIVE state, not a raw
                        // SharedPreferences read — a raw read is frozen for
                        // the life of this composition, so a mandatory flag
                        // SyncWorker later clears/un-mandates (owner fixes or
                        // rolls back the release) would otherwise never be
                        // seen again, trapping whoever is already on
                        // UpdateRequiredScreen until they force-close the
                        // app. See PermissionsScreen.kt's rememberPendingUpdate
                        // doc for the full idiom this reuses.
                        val pendingUpdate = rememberPendingUpdate(prefs)
                        val blocked = UpdatePolicy.shouldBlock(
                            pendingUpdate.value.versionCode, BuildConfig.VERSION_CODE, pendingUpdate.value.mandatory,
                        )
                        when {
                            !granted -> PermissionsScreen(onAllGranted = { granted = true })
                            !loggedIn -> LoginScreen(api, prefs.deviceId) { data ->
                                prefs.deviceKey = data.device_key
                                prefs.username = data.username
                                prefs.displayName = data.display_name
                                // Agent-handover guard: if this phone previously belonged to a
                                // DIFFERENT agent, pin the sync window to "now" instead of the
                                // usual day-start — otherwise the new agent's first sync would
                                // re-ingest the previous agent's same-day calls under the new
                                // agent's name (double-counted + re-notified).
                                val priorUsername = prefs.lastLoginUsername
                                if (priorUsername != null && priorUsername != data.username) {
                                    prefs.installDayStartMillis = System.currentTimeMillis()
                                } else if (prefs.installDayStartMillis == 0L) {
                                    prefs.installDayStartMillis =
                                        DubaiTime.dayStartMillis(System.currentTimeMillis())
                                }
                                prefs.lastLoginUsername = data.username
                                prefs.lastSyncedCallLogId = 0L
                                prefs.wasLoggedIn = true
                                SyncScheduler.ensurePeriodic(this@MainActivity)
                                SyncScheduler.syncNow(this@MainActivity)
                                loggedIn = true
                            }
                            blocked -> UpdateRequiredScreen(
                                versionName = pendingUpdate.value.versionName ?: BuildConfig.VERSION_NAME,
                                onRecheck = pendingUpdate::refresh,
                            )
                            else -> {
                                // "شغل النهاردة" is a sub-screen of Home, not a new
                                // top-level `when` branch — same pattern as the
                                // granted/loggedIn flags above, just nested one level
                                // in so Home's own state (refreshTick etc.) survives
                                // the round trip.
                                var showMyDay by remember { mutableStateOf(false) }
                                if (showMyDay) {
                                    MyDayScreen(api = api, onBack = { showMyDay = false })
                                } else {
                                    HomeScreen(prefs, onOpenMyDay = { showMyDay = true }) {
                                        // Explicit logout — flip the tripwire off FIRST so a
                                        // clean logout is never mistaken for abnormal session
                                        // loss on the next launch.
                                        prefs.wasLoggedIn = false
                                        prefs.clearSession()
                                        loggedIn = false
                                    }
                                }
                            }
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
