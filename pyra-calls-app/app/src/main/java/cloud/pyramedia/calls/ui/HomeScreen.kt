package cloud.pyramedia.calls.ui

import android.content.Intent
import android.provider.CallLog
import android.content.Context
import android.text.format.DateFormat
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.CallCounts
import cloud.pyramedia.calls.core.CallLogFilter
import cloud.pyramedia.calls.core.DubaiTime
import cloud.pyramedia.calls.core.UpdatePolicy
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.sync.SyncScheduler
import cloud.pyramedia.calls.ui.components.*
import cloud.pyramedia.calls.ui.theme.LocalPyraColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Date

/**
 * Tally the local call log using the EXACT predicate the syncer uses, so the
 * number on Home and the number in the CRM are the same number at two points
 * in time — the only gap being sync lag, which the sync chip already shows.
 */
private fun countSince(context: Context, sinceMillis: Long): CallCounts {
    var total = 0
    var connected = 0
    context.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DURATION),
        "${CallLog.Calls.DATE} >= ?", arrayOf(sinceMillis.toString()), null,
    )?.use { c ->
        val iNum = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
        val iType = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
        val iDur = c.getColumnIndexOrThrow(CallLog.Calls.DURATION)
        while (c.moveToNext()) {
            val type = c.getInt(iType)
            if (!CallLogFilter.isSyncable(type, c.getString(iNum))) continue
            total++
            if (CallLogFilter.isConnected(type, c.getInt(iDur))) connected++
        }
    }
    return CallCounts(total, connected)
}

/** Per-day totals for the last 7 Dubai days, oldest first. Local only. */
private fun lastSevenDays(context: Context, now: Long): List<Int> {
    val dayStart = DubaiTime.dayStartMillis(now)
    val oneDay = 24L * 60 * 60 * 1000
    return (6 downTo 0).map { back ->
        val from = dayStart - back * oneDay
        val to = from + oneDay
        var n = 0
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE),
            "${CallLog.Calls.DATE} >= ? AND ${CallLog.Calls.DATE} < ?",
            arrayOf(from.toString(), to.toString()), null,
        )?.use { c ->
            val iNum = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
            val iType = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
            while (c.moveToNext()) {
                if (CallLogFilter.isSyncable(c.getInt(iType), c.getString(iNum))) n++
            }
        }
        n
    }
}

private sealed class WorkState {
    data object Loading : WorkState()
    data class Loaded(val followUps: Int, val cold: Int) : WorkState()
    data object Failed : WorkState()
}

@Composable
fun HomeScreen(
    prefs: AppPrefs,
    api: ApiClient,
    onOpenMyDay: () -> Unit,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    // Home is the back-stack root, so an unhandled back press closes the app.
    // With the drawer open that is the wrong answer — back should dismiss the
    // drawer first, which is what every drawer on this phone does. Enabled
    // only while it is open, so back still exits from Home as it always did.
    BackHandler(enabled = drawerState.isOpen) { scope.launch { drawerState.close() } }
    var refreshTick by remember { mutableIntStateOf(0) }
    var work by remember { mutableStateOf<WorkState>(WorkState.Loading) }

    val now = System.currentTimeMillis()
    val today = remember(refreshTick) { countSince(context, DubaiTime.dayStartMillis(now)) }
    val week = remember(refreshTick) { lastSevenDays(context, now) }
    val lastSync = prefs.lastSyncAtMillis
    val synced = lastSync > 0 && now - lastSync < 30 * 60 * 1000
    val hibernationRestricted by rememberUnusedAppRestrictionsEnabled()
    val pendingUpdate = rememberPendingUpdate(prefs)

    fun loadWork() {
        work = WorkState.Loading
        scope.launch {
            val res = withContext(Dispatchers.IO) { api.myDay() }
            work = when (res) {
                is ApiResult.Ok -> WorkState.Loaded(
                    followUps = res.data.counts.follow_ups,
                    cold = res.data.counts.going_cold,
                )
                else -> WorkState.Failed
            }
        }
    }

    LaunchedEffect(refreshTick) { loadWork() }

    // gesturesEnabled = false is mandatory, not a preference: this app runs
    // under RTL, where an edge swipe from the drawer's own edge is ALSO the
    // system Back gesture on gesture-nav devices. Leaving swipe-to-open on
    // makes the two fight over the same edge — the menu IconButton below is
    // the only opener.
    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = false,
        drawerContent = { AppDrawer(prefs = prefs, api = api, onLogout = onLogout) },
    ) {
        PyraScreen(
            bottomBar = {
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { SyncScheduler.syncNow(context); refreshTick++ },
                ) { Text(stringResource(R.string.home_sync_now)) }
            },
        ) {
            // Greeting + sync status. The status is a plain indicator, NOT a
            // button: the old AssistChip(onClick = {}) looked tappable and did
            // nothing (B-08). The real sync action lives in the bottom bar.
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { scope.launch { drawerState.open() } }) {
                    Icon(Icons.Filled.Menu, contentDescription = stringResource(R.string.cd_menu))
                }
                Text(
                    stringResource(R.string.home_hello, prefs.displayName ?: ""),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f),
                )
                SyncStatus(synced = synced)
            }

            if (UpdatePolicy.shouldShowBanner(pendingUpdate.value.versionCode, BuildConfig.VERSION_CODE)) {
                NoticeCard(
                    title = stringResource(R.string.home_update_banner_title),
                    body = stringResource(R.string.home_update_banner_body, pendingUpdate.value.versionName ?: ""),
                    action = {
                        Button(onClick = {
                            context.startActivity(Intent(context, UpdateActivity::class.java))
                        }) { Text(stringResource(R.string.home_update_banner_button)) }
                    },
                )
            }

            if (hibernationRestricted) {
                NoticeCard(
                    title = stringResource(R.string.hibernation_title),
                    body = stringResource(R.string.hibernation_body),
                    action = { HibernationExemptionButton() },
                )
            }

            WorkCard(state = work, onOpen = onOpenMyDay, onRetry = { loadWork() })

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile(
                    value = "${today.total}",
                    label = stringResource(R.string.home_calls_today),
                    accent = true,
                    modifier = Modifier.weight(1f),
                )
                StatTile(
                    value = "${today.connected}",
                    label = stringResource(R.string.home_calls_connected),
                    modifier = Modifier.weight(1f),
                )
            }

            WeekStrip(week)

            Text(
                if (lastSync > 0)
                    stringResource(R.string.home_last_sync, DateFormat.getTimeFormat(context).format(Date(lastSync)))
                else stringResource(R.string.home_last_sync_never),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SyncStatus(synced: Boolean) {
    val pyra = LocalPyraColors.current
    val color = if (synced) pyra.cool else pyra.danger
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        Text(
            stringResource(if (synced) R.string.home_synced else R.string.home_not_synced),
            style = MaterialTheme.typography.labelMedium,
            color = color,
        )
    }
}

/**
 * The thesis of the screen: what the rep should do, before how much he has
 * already done. The whole card is the button — there is no separate
 * "open my day" control any more.
 *
 * The numbers come from the server, but the call counts above do not. A
 * network failure therefore darkens this card only; the rep in the street
 * with no signal still sees his own call tally.
 */
@Composable
private fun WorkCard(state: WorkState, onOpen: () -> Unit, onRetry: () -> Unit) {
    val shape = MaterialTheme.shapes.large
    Surface(
        onClick = if (state is WorkState.Failed) onRetry else onOpen,
        shape = shape,
        color = MaterialTheme.colorScheme.primary,
        contentColor = Color.White,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(
                stringResource(R.string.home_work_card_title),
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(Modifier.height(14.dp))
            when (state) {
                is WorkState.Loading -> Text(
                    stringResource(R.string.home_work_loading),
                    style = MaterialTheme.typography.bodyMedium,
                )
                is WorkState.Failed -> Text(
                    stringResource(R.string.home_work_failed),
                    style = MaterialTheme.typography.bodyMedium,
                )
                is WorkState.Loaded ->
                    if (state.followUps == 0 && state.cold == 0) {
                        Text(
                            stringResource(R.string.home_work_empty),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            WorkCell(state.followUps, stringResource(R.string.home_work_follow_ups), Modifier.weight(1f))
                            WorkCell(state.cold, stringResource(R.string.home_work_cold), Modifier.weight(1f))
                        }
                    }
            }
        }
    }
}

@Composable
private fun WorkCell(value: Int, label: String, modifier: Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = Color.White.copy(alpha = 0.16f),
        contentColor = Color.White,
    ) {
        Column(Modifier.padding(13.dp)) {
            Text("$value", style = MaterialTheme.typography.displaySmall)
            Text(label, style = MaterialTheme.typography.bodySmall)
        }
    }
}

/** Calls per day for the last 7 Dubai days. Local data — always available. */
@Composable
private fun WeekStrip(days: List<Int>) {
    val max = (days.maxOrNull() ?: 0).coerceAtLeast(1)
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(15.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    stringResource(R.string.home_week_title),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    stringResource(R.string.home_week_total, days.sum()),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                days.forEach { n ->
                    Column(
                        Modifier.weight(1f),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Bottom,
                    ) {
                        Box(
                            Modifier.height(44.dp).fillMaxWidth(),
                            contentAlignment = Alignment.BottomCenter,
                        ) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .height((44f * n / max).dp.coerceAtLeast(3.dp))
                                    .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                                    .background(LocalPyraColors.current.brandAccent),
                            )
                        }
                        Spacer(Modifier.height(5.dp))
                        Text(
                            "$n",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}
