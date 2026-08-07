package cloud.pyramedia.calls.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.format.DateFormat
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.MyDayColdLead
import cloud.pyramedia.calls.core.MyDayData
import cloud.pyramedia.calls.core.MyDayFollowUp
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.ui.components.LeadRow
import cloud.pyramedia.calls.ui.components.LeadTone
import cloud.pyramedia.calls.ui.components.PyraChip
import cloud.pyramedia.calls.ui.components.PyraListScreen
import cloud.pyramedia.calls.ui.components.SectionHeader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.util.Date

private sealed class MyDayState {
    data object Loading : MyDayState()
    data class Loaded(val data: MyDayData) : MyDayState()
    data class Failed(val message: String) : MyDayState()
}

/**
 * "شغل النهاردة" — today's due/overdue follow-ups + going-cold leads, each
 * row with a one-tap `ACTION_DIAL` call button. Reached from a button on
 * [HomeScreen]; `MainActivity` toggles it in via a plain boolean flag next
 * to its existing `when {}` screen switch — no nav library.
 *
 * Two tabs, not the three the design shows («متأخرة / النهاردة / برد»):
 * `counts.follow_ups` merges overdue and pending into one number, and the
 * `follow_ups` array is capped at 20 rows, so counting the returned items to
 * derive an overdue-only tally would be wrong for any rep with more than
 * twenty. A coarser true number beats a precise false one — the three-tab
 * split lands once the server computes the overdue count separately.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyDayScreen(api: ApiClient, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<MyDayState>(MyDayState.Loading) }
    var tab by remember { mutableIntStateOf(0) }
    var refreshing by remember { mutableStateOf(false) }
    val netErrorMsg = stringResource(R.string.net_error)

    fun fetch(isRefresh: Boolean = false) {
        if (!isRefresh) state = MyDayState.Loading
        scope.launch {
            val res = withContext(Dispatchers.IO) { api.myDay() }
            state = when (res) {
                is ApiResult.Ok -> MyDayState.Loaded(res.data)
                is ApiResult.Err -> MyDayState.Failed(res.message)
                ApiResult.NetworkError -> MyDayState.Failed(netErrorMsg)
            }
            refreshing = false
        }
    }

    LaunchedEffect(Unit) { fetch() }

    // ACTION_DIAL only — opens the dialer pre-filled, needs no permission, and
    // lets the agent confirm. ACTION_CALL would need CALL_PHONE (the app must
    // never hold it) and would place the call with no confirmation.
    val onCall: (String) -> Unit = { phone ->
        context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
    }

    PyraListScreen(title = stringResource(R.string.my_day_title), onBack = onBack) {
        when (val s = state) {
            is MyDayState.Loading -> item {
                Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is MyDayState.Failed -> item {
                Column(
                    Modifier.fillMaxWidth().padding(top = 48.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(s.message, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { fetch() }) { Text(stringResource(R.string.my_day_retry)) }
                }
            }
            is MyDayState.Loaded -> {
                val d = s.data
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PyraChip(
                            label = "${stringResource(R.string.my_day_tab_follow_ups)} ${d.counts.follow_ups}",
                            selected = tab == 0,
                            onClick = { tab = 0 },
                            modifier = Modifier.weight(1f),
                        )
                        PyraChip(
                            label = "${stringResource(R.string.my_day_tab_cold)} ${d.counts.going_cold}",
                            selected = tab == 1,
                            onClick = { tab = 1 },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                if (tab == 0) {
                    item {
                        SectionHeader(
                            stringResource(R.string.my_day_section_follow_ups),
                            d.follow_ups.size, d.counts.follow_ups,
                        )
                    }
                    if (d.follow_ups.isEmpty()) {
                        item { EmptySectionCard(stringResource(R.string.my_day_empty_follow_ups)) }
                    } else {
                        items(d.follow_ups, key = { it.id }) { FollowUpRow(it, onCall) }
                    }
                } else {
                    item {
                        SectionHeader(
                            stringResource(R.string.my_day_section_going_cold),
                            d.going_cold.size, d.counts.going_cold,
                        )
                    }
                    if (d.going_cold.isEmpty()) {
                        item { EmptySectionCard(stringResource(R.string.my_day_empty_going_cold)) }
                    } else {
                        items(d.going_cold, key = { it.lead_id }) { ColdLeadRow(it, onCall) }
                    }
                }
                item { Spacer(Modifier.height(8.dp)) }
                item {
                    TextButton(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { refreshing = true; fetch(isRefresh = true) },
                        enabled = !refreshing,
                    ) { Text(stringResource(R.string.my_day_refresh)) }
                }
            }
        }
    }
}

@Composable
private fun EmptySectionCard(message: String) {
    Card(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Text(message, Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun FollowUpRow(item: MyDayFollowUp, onCall: (String) -> Unit) {
    val context = LocalContext.current
    val overdue = item.status == "overdue"
    val dueLabel = remember(item.due_at) { formatIsoToLocal(context, item.due_at) }
    LeadRow(
        name = item.lead_name ?: stringResource(R.string.my_day_unknown_lead),
        subtitle = item.title.ifBlank { null },
        chipText = stringResource(
            if (overdue) R.string.my_day_overdue_at else R.string.my_day_due_at, dueLabel,
        ),
        tone = if (overdue) LeadTone.Overdue else LeadTone.Neutral,
        onCall = item.phone?.let { p -> { onCall(p) } },
    )
}

@Composable
private fun ColdLeadRow(item: MyDayColdLead, onCall: (String) -> Unit) {
    LeadRow(
        name = item.lead_name,
        subtitle = item.company,
        chipText = stringResource(R.string.my_day_cold_days, item.days_since_contact),
        tone = LeadTone.Cold,
        onCall = item.phone?.let { p -> { onCall(p) } },
    )
}

private fun formatIsoToLocal(context: Context, iso: String): String {
    val millis = runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull() ?: return iso
    val date = Date(millis)
    return "${DateFormat.getDateFormat(context).format(date)} ${DateFormat.getTimeFormat(context).format(date)}"
}
