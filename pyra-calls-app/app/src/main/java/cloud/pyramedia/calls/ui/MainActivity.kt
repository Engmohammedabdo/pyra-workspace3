package cloud.pyramedia.calls.ui

import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.content.ContextCompat
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.DubaiTime
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.AppPrefs

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
                                if (prefs.installDayStartMillis == 0L) {
                                    prefs.installDayStartMillis =
                                        DubaiTime.dayStartMillis(System.currentTimeMillis())
                                }
                                prefs.lastSyncedCallLogId = 0L
                                // SyncScheduler.ensurePeriodic(this@MainActivity) — wired in Task 5
                                loggedIn = true
                            }
                            else -> Text(stringResource(R.string.home_placeholder)) // HomeScreen in Task 6
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
