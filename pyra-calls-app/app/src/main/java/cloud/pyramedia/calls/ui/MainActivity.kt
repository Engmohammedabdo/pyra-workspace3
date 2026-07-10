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
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.sync.SyncScheduler

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = AppPrefs(this)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }

        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme {
                    Surface {
                        var granted by remember { mutableStateOf(allPermissionsGranted()) }
                        var loggedIn by remember { mutableStateOf(prefs.isLoggedIn()) }
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
                                SyncScheduler.ensurePeriodic(this@MainActivity)
                                SyncScheduler.syncNow(this@MainActivity)
                                loggedIn = true
                            }
                            else -> HomeScreen(prefs) {
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
