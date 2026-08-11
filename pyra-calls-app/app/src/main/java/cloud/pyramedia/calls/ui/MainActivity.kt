package cloud.pyramedia.calls.ui

import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.core.AppGate
import cloud.pyramedia.calls.core.DubaiTime
import cloud.pyramedia.calls.core.UpdatePolicy
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.ErrorQueue
import cloud.pyramedia.calls.sync.SyncScheduler
import cloud.pyramedia.calls.ui.theme.PyraTheme

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
        // run but isn't now, with no explicit logout in between. It was built
        // for the EncryptedSharedPreferences keyset failure, and outlives that
        // store (T-01) on purpose — a session vanishing for ANY reason is worth
        // knowing. consumeSessionLossEvent() resets the flag (fires once) and
        // sets pendingSessionLossReport.
        // ErrorQueue reports pending_session_loss_report.
        prefs.consumeSessionLossEvent()

        // Flag consumption (check → enqueue → clear). The sibling
        // pendingMigrationLossReport went with the migration itself in T-01.
        if (prefs.pendingSessionLossReport) {
            ErrorQueue(this).enqueue(
                message = "device session lost without explicit logout",
                source = "session_lost",
                severity = "error",
            )
            prefs.pendingSessionLossReport = false
        }

        setContent {
            PyraTheme {
                var granted by remember { mutableStateOf(allPermissionsGranted()) }
                var loggedIn by remember { mutableStateOf(prefs.isLoggedIn()) }
                // B-15 — hoisted to the gate because the dead-session verdict
                // now decides WHICH screen shows, not just whether Home draws a
                // banner. HomeScreen keeps its own instance: it refreshes that
                // one straight after its own authenticated myDay() call, and
                // both read the same AppPrefs value, so they cannot disagree
                // about anything that matters here.
                val sessionDead = rememberSessionDead(prefs)
                // Per-release mandatory block (CA-C2). Where this sits relative
                // to the login/permissions branches — and why — now lives in
                // AppGate.decide's doc, next to the B-15 case that was missing
                // from the same rule.
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
                // The branch ORDER lives in AppGate (pure, unit-tested against
                // the full 16-case matrix) rather than in this `when`, because
                // the order IS the fix: B-15 was a missing case in it, and a
                // `when` inside an Activity cannot be tested.
                val screen = AppGate.decide(
                    granted = granted,
                    loggedIn = loggedIn,
                    sessionDead = sessionDead.value,
                    blocked = blocked,
                )
                when (screen) {
                    AppGate.Screen.PERMISSIONS -> PermissionsScreen(onAllGranted = { granted = true })
                    AppGate.Screen.LOGIN -> LoginScreen(api, prefs.deviceId) { data ->
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
                    AppGate.Screen.SESSION_DEAD_BLOCKED -> SessionDeadBlockedScreen(
                        versionName = pendingUpdate.value.versionName ?: BuildConfig.VERSION_NAME,
                        onRelogin = {
                            // Identical to Home's logout, and for the identical
                            // reason: flip the tripwire off FIRST so this
                            // deliberate re-login is never reported as an
                            // abnormal session loss on the next launch.
                            // clearSession() also clears the auth-failure
                            // streak and the session_dead flag, so a successful
                            // sign-in leaves the phone genuinely healthy rather
                            // than one poll away from this screen again.
                            prefs.wasLoggedIn = false
                            prefs.clearSession()
                            loggedIn = false
                        },
                    )
                    AppGate.Screen.UPDATE_REQUIRED -> UpdateRequiredScreen(
                        versionName = pendingUpdate.value.versionName ?: BuildConfig.VERSION_NAME,
                        api = api,
                        prefs = prefs,
                        // Refreshes BOTH live flags: the poll inside that screen
                        // now records its own auth outcome, so a key revoked
                        // while the rep sits there flips `sessionDead` and this
                        // is what carries it into the gate — otherwise the
                        // escape screen would wait for the next app resume.
                        onRecheck = {
                            pendingUpdate.refresh()
                            sessionDead.refresh()
                        },
                    )
                    AppGate.Screen.HOME -> {
                        // "شغل النهاردة" is a sub-screen of Home, not a new
                        // top-level `when` branch — same pattern as the
                        // granted/loggedIn flags above, just nested one level
                        // in so Home's own state (refreshTick etc.) survives
                        // the round trip.
                        var showMyDay by remember { mutableStateOf(false) }
                        if (showMyDay) {
                            MyDayScreen(api = api, onBack = { showMyDay = false })
                        } else {
                            HomeScreen(prefs, api, onOpenMyDay = { showMyDay = true }) {
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

    private fun allPermissionsGranted(): Boolean = REQUIRED_PERMISSIONS.all {
        ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }
}
