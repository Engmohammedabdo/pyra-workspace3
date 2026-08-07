package cloud.pyramedia.calls.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.format.DateFormat
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.CompleteFollowUpRequest
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
 * Three tabs («متأخرة / النهاردة / برد») once the server reports
 * `counts.overdue`; two when it reports null, because a count we cannot stand
 * behind is worse than a coarser one. Each follow-up row carries «تم» (opens
 * the outcome sheet with the follow-up attached) and a «⋯» menu with
 * «اقفل من غير مكالمة» — deliberately a visible menu and not a long-press: a
 * gesture nobody discovers is a feature nobody uses, and the duplicate
 * follow-ups keep piling up while we believe we shipped a fix.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MyDayScreen(api: ApiClient, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<MyDayState>(MyDayState.Loading) }
    var tab by remember { mutableIntStateOf(0) }
    var refreshing by remember { mutableStateOf(false) }
    var pendingClose by remember { mutableStateOf<MyDayFollowUp?>(null) }
    var closing by remember { mutableStateOf(false) }
    val netErrorMsg = stringResource(R.string.net_error)
    val closedMsg = stringResource(R.string.my_day_closed)

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

    fun openOutcome(ctx: Context, fu: MyDayFollowUp) {
        ctx.startActivity(
            Intent(ctx, CallOutcomeActivity::class.java)
                .putExtra("lead_id", fu.lead_id.orEmpty())
                .putExtra("lead_name", fu.lead_name.orEmpty())
                .putExtra("follow_up_id", fu.id)
                .putExtra("follow_up_title", fu.title)
                .putExtra("follow_up_due_at", fu.due_at)
                .putExtra("follow_up_overdue", fu.status == "overdue"),
        )
    }

    fun closeWith(fu: MyDayFollowUp, reason: String) {
        closing = true
        scope.launch {
            val res = withContext(Dispatchers.IO) {
                api.completeFollowUp(CompleteFollowUpRequest(follow_up_id = fu.id, reason = reason))
            }
            closing = false
            pendingClose = null
            when (res) {
                is ApiResult.Ok -> {
                    Toast.makeText(context, closedMsg, Toast.LENGTH_SHORT).show()
                    // Refetch rather than mutate the list in place: closing a
                    // follow-up also changes the overdue count AND can move the
                    // lead into "going cold", and the server is the only thing
                    // that knows both.
                    refreshing = true
                    fetch(isRefresh = true)
                }
                is ApiResult.Err -> Toast.makeText(context, res.message, Toast.LENGTH_LONG).show()
                ApiResult.NetworkError -> Toast.makeText(context, netErrorMsg, Toast.LENGTH_LONG).show()
            }
        }
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
                // The server reports counts.overdue = null when its count query
                // failed. Null means "I don't know", NOT zero — fall back to the
                // two-tab layout rather than render a number we can't stand behind.
                val overdueCount = d.counts.overdue
                val threeTabs = overdueCount != null
                // overdue ⊆ follow_ups by construction (an overdue row is past
                // due, so it always satisfies the server's due_at <= now+1d
                // filter). coerceAtLeast(0) is belt and braces.
                val todayCount = if (overdueCount != null) {
                    (d.counts.follow_ups - overdueCount).coerceAtLeast(0)
                } else d.counts.follow_ups

                item {
                    // FlowRow, not Row. Two chips with weight(1f) each were safe;
                    // three are not — that is literally B-02. verticalArrangement
                    // matters too: at large font scales these chips wrap onto a
                    // second line, and without spacing the wrapped rows touch
                    // (the same defect Task 10 fixed on the outcome sheet's
                    // three FlowRows).
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (threeTabs) {
                            PyraChip(
                                label = "${stringResource(R.string.my_day_tab_overdue)} $overdueCount",
                                selected = tab == 0, onClick = { tab = 0 },
                            )
                            PyraChip(
                                label = "${stringResource(R.string.my_day_tab_today)} $todayCount",
                                selected = tab == 1, onClick = { tab = 1 },
                            )
                        } else {
                            PyraChip(
                                label = "${stringResource(R.string.my_day_tab_follow_ups)} ${d.counts.follow_ups}",
                                selected = tab == 0 || tab == 1, onClick = { tab = 0 },
                            )
                        }
                        PyraChip(
                            label = "${stringResource(R.string.my_day_tab_cold)} ${d.counts.going_cold}",
                            selected = tab == 2, onClick = { tab = 2 },
                        )
                    }
                }

                when {
                    tab == 2 -> {
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
                    else -> {
                        // With three tabs the two follow-up tabs split the SAME
                        // capped 20-row array. SectionHeader still shows
                        // "shown of total", so a rep with 108 overdue sees
                        // "20 من 108" and knows the list is a window.
                        val rows = when {
                            !threeTabs -> d.follow_ups
                            tab == 0 -> d.follow_ups.filter { it.status == "overdue" }
                            else -> d.follow_ups.filter { it.status != "overdue" }
                        }
                        val total = when {
                            !threeTabs -> d.counts.follow_ups
                            tab == 0 -> overdueCount ?: rows.size
                            else -> todayCount
                        }
                        // Resource id only here (no stringResource call) — this
                        // branch runs directly inside the LazyListScope
                        // receiver, not a @Composable item{} lambda.
                        val emptyMsgRes = when {
                            !threeTabs -> R.string.my_day_empty_follow_ups
                            tab == 0 -> R.string.my_day_empty_overdue
                            else -> R.string.my_day_empty_today
                        }
                        item {
                            SectionHeader(
                                stringResource(R.string.my_day_section_follow_ups),
                                rows.size, total,
                            )
                        }
                        if (rows.isEmpty()) {
                            item { EmptySectionCard(stringResource(emptyMsgRes)) }
                        } else {
                            items(rows, key = { it.id }) { fu ->
                                FollowUpRow(
                                    item = fu,
                                    onCall = onCall,
                                    onDone = { openOutcome(context, fu) },
                                    onCloseNoCall = { pendingClose = fu },
                                )
                            }
                        }
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

    pendingClose?.let { fu ->
        AlertDialog(
            onDismissRequest = { if (!closing) pendingClose = null },
            title = { Text(stringResource(R.string.my_day_close_title)) },
            text = {
                Column {
                    Text(
                        fu.lead_name ?: stringResource(R.string.my_day_unknown_lead),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Spacer(Modifier.height(12.dp))
                    // Exactly two reasons, and they are the server's whole
                    // enum. "We spoke off-system" does not exist (every
                    // conversation goes through a company line) and "not
                    // interested" is a stage move, not a close — it belongs to
                    // the outcome sheet.
                    TextButton(
                        enabled = !closing,
                        onClick = { closeWith(fu, "duplicate") },
                    ) { Text(stringResource(R.string.my_day_close_reason_duplicate)) }
                    TextButton(
                        enabled = !closing,
                        onClick = { closeWith(fu, "wrong_number") },
                    ) { Text(stringResource(R.string.my_day_close_reason_wrong_number)) }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(enabled = !closing, onClick = { pendingClose = null }) {
                    Text(stringResource(R.string.my_day_close_cancel))
                }
            },
        )
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
private fun FollowUpRow(
    item: MyDayFollowUp,
    onCall: (String) -> Unit,
    onDone: () -> Unit,
    onCloseNoCall: () -> Unit,
) {
    val context = LocalContext.current
    val overdue = item.status == "overdue"
    val dueLabel = remember(item.due_at) { formatIsoToLocal(context, item.due_at) }
    var menuOpen by remember { mutableStateOf(false) }
    LeadRow(
        name = item.lead_name ?: stringResource(R.string.my_day_unknown_lead),
        subtitle = item.title.ifBlank { null },
        chipText = stringResource(
            if (overdue) R.string.my_day_overdue_at else R.string.my_day_due_at, dueLabel,
        ),
        tone = if (overdue) LeadTone.Overdue else LeadTone.Neutral,
        onCall = item.phone?.let { p -> { onCall(p) } },
        footer = {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDone, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.my_day_action_done))
                }
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(
                            Icons.Filled.MoreVert,
                            contentDescription = stringResource(R.string.my_day_action_more),
                        )
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.my_day_action_close_no_call)) },
                            onClick = { menuOpen = false; onCloseNoCall() },
                        )
                    }
                }
            }
        },
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
