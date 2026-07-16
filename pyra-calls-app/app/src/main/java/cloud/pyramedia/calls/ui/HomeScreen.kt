package cloud.pyramedia.calls.ui

import android.content.Intent
import android.provider.CallLog
import android.content.Context
import android.text.format.DateFormat
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.DubaiTime
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.sync.SyncScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Date

private fun countSince(context: Context, sinceMillis: Long): Int {
    context.contentResolver.query(
        CallLog.Calls.CONTENT_URI, arrayOf(CallLog.Calls._ID),
        "${CallLog.Calls.DATE} >= ?", arrayOf(sinceMillis.toString()), null,
    )?.use { return it.count }
    return 0
}

@Composable
fun HomeScreen(prefs: AppPrefs, onLogout: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var refreshTick by remember { mutableStateOf(0) }
    var checkingUpdate by remember { mutableStateOf(false) }
    val upToDateMsg = stringResource(R.string.home_up_to_date)
    val checkFailedMsg = stringResource(R.string.home_check_failed)
    val now = System.currentTimeMillis()
    val todayCount = remember(refreshTick) { countSince(context, DubaiTime.dayStartMillis(now)) }
    val monthCount = remember(refreshTick) { countSince(context, DubaiTime.monthStartMillis(now)) }
    val lastSync = prefs.lastSyncAtMillis
    val synced = lastSync > 0 && now - lastSync < 30 * 60 * 1000
    val hibernationRestricted by rememberUnusedAppRestrictionsEnabled()

    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.home_hello, prefs.displayName ?: ""),
                style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            AssistChip(onClick = {}, label = {
                Text(stringResource(if (synced) R.string.home_synced else R.string.home_not_synced))
            })
        }

        // Persistent nag, not a one-time card: restriction status can regress
        // after an OS update even after the user already disabled it once
        // from the Permissions screen — so Home keeps re-checking (ON_RESUME,
        // see rememberUnusedAppRestrictionsEnabled) and keeps warning.
        if (hibernationRestricted) {
            Spacer(Modifier.height(12.dp))
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3CD)),
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        stringResource(R.string.hibernation_title),
                        style = MaterialTheme.typography.titleSmall,
                        color = Color(0xFF664D03),
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(R.string.hibernation_body),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF664D03),
                    )
                    Spacer(Modifier.height(8.dp))
                    HibernationExemptionButton()
                }
            }
        }

        Spacer(Modifier.height(24.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(stringResource(R.string.home_today), style = MaterialTheme.typography.labelMedium)
                Text("$todayCount", style = MaterialTheme.typography.displaySmall)
            }
        }
        Spacer(Modifier.height(12.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(stringResource(R.string.home_month), style = MaterialTheme.typography.labelMedium)
                Text("$monthCount", style = MaterialTheme.typography.displaySmall)
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            if (lastSync > 0)
                stringResource(R.string.home_last_sync,
                    DateFormat.getTimeFormat(context).format(Date(lastSync)))
            else stringResource(R.string.home_last_sync_never),
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.weight(1f))
        Button(modifier = Modifier.fillMaxWidth(), onClick = {
            SyncScheduler.syncNow(context); refreshTick++
        }) { Text(stringResource(R.string.home_sync_now)) }
        Spacer(Modifier.height(8.dp))
        TextButton(modifier = Modifier.fillMaxWidth(), onClick = onLogout) {
            Text(stringResource(R.string.home_logout))
        }

        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(
                stringResource(R.string.home_version, BuildConfig.VERSION_NAME),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                enabled = !checkingUpdate,
                onClick = {
                    checkingUpdate = true
                    scope.launch {
                        // Manual check bypasses UpdatePolicy.shouldCheck's 6h
                        // throttle by design — the user explicitly asked.
                        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }
                        val res = withContext(Dispatchers.IO) { api.appVersion() }
                        checkingUpdate = false
                        when (res) {
                            is ApiResult.Ok -> {
                                val latest = res.data.latest
                                if (latest != null && latest.version_code > BuildConfig.VERSION_CODE) {
                                    context.startActivity(Intent(context, UpdateActivity::class.java))
                                } else {
                                    Toast.makeText(context, upToDateMsg, Toast.LENGTH_SHORT).show()
                                }
                            }
                            else -> Toast.makeText(context, checkFailedMsg, Toast.LENGTH_SHORT).show()
                        }
                    }
                },
            ) {
                Text(stringResource(
                    if (checkingUpdate) R.string.home_checking_update else R.string.home_check_update,
                ))
            }
        }
    }
}
