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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.CompleteFollowUpRequest
import cloud.pyramedia.calls.core.MyDayColdLead
import cloud.pyramedia.calls.core.MyDayData
import cloud.pyramedia.calls.core.MyDayFollowUp
import cloud.pyramedia.calls.core.myDayFollowUpSelection
import cloud.pyramedia.calls.core.myDayTabs
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
 *
 * Refetches on every resume after the first (see the `hasResumed` guard
 * below): «تم» hands off to [CallOutcomeActivity], which closes the attached
 * follow-up server-side, so coming back to this screen its list and counts
 * are stale until it re-asks the server — the same reason `closeWith` below
 * refetches instead of mutating the list in place.
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

    // «تم» hands off to CallOutcomeActivity, which closes the attached
    // follow-up server-side. Coming back, this list and its counts are stale —
    // the same reason closeWith() refetches instead of mutating in place: only
    // the server knows the new overdue count, and the lead may have moved into
    // «برد». Skip the first resume: LaunchedEffect(Unit) above already
    // fetched, and firing both would double-request on every open.
    var hasResumed by remember { mutableStateOf(false) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (hasResumed) {
            // Mirrors the manual «تحديث» button: refreshing = true disables
            // it for the duration, so a rep landing back from the outcome
            // sheet can't fire a second overlapping fetch by also tapping it.
            refreshing = true
            fetch(isRefresh = true)
        } else {
            hasResumed = true
        }
    }

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
        // `enabled = !closing` on the dialog buttons only takes effect on the
        // NEXT recomposition — two clicks landing in the same frame (a fast
        // double-tap, or two separate reason buttons) both reach here before
        // that recomposition happens. This early return is the real guard.
        if (closing) return
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
                // See MyDayView.kt (core/) for the derivation + its unit tests
                // — pulled out so "null means unknown, not zero" is locked by
                // a test, not just a comment.
                val tabs = myDayTabs(d.counts)
                val threeTabs = tabs.threeTabs
                val overdueCount = tabs.overdueCount
                val todayCount = tabs.todayCount

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
                        val selection = myDayFollowUpSelection(tab, tabs, d.follow_ups, d.counts)
                        val rows = selection.rows
                        val total = selection.total
                        // Resource id only here (no stringResource call) — this
                        // branch runs directly inside the LazyListScope
                        // receiver, not a @Composable item{} lambda.
                        //
                        // The `tab != 0` empty branch splits in two: with 108
                        // overdue and a 20-row window, the «النهاردة» tab's
                        // rows can be empty while its OWN total is still > 0
                        // — the window is entirely consumed by overdue rows,
                        // which sort first (due_at ASC, and an overdue row's
                        // due_at is always earlier than a pending one's). That
                        // is exactly the case this task exists for, and
                        // "مفيش متابعات مستحقة النهاردة" would flatly
                        // contradict the "٠ من 5" header sitting right above
                        // it. Tab 0 («متأخرة») gets NO such split: by the same
                        // due_at-ASC ordering, overdue rows always occupy the
                        // front of the window, so tab 0's rows can only be
                        // empty when its own total (overdueCount) is also
                        // zero — there is no case where the header and the
                        // empty message would disagree.
                        val emptyMsgRes = when {
                            !threeTabs -> R.string.my_day_empty_follow_ups
                            tab == 0 -> R.string.my_day_empty_overdue
                            rows.isEmpty() && total > 0 -> R.string.my_day_empty_today_window_full
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
                                    // A follow-up with no parent lead (soft-
                                    // deleted / never linked) has nothing for
                                    // the outcome sheet to attach an outcome
                                    // to — CallOutcomeActivity would just
                                    // finish() instantly with no signal to
                                    // the rep. null here means FollowUpRow
                                    // skips the button entirely instead of
                                    // rendering a silent no-op.
                                    onDone = fu.lead_id?.let { { openOutcome(context, fu) } },
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
                // verticalScroll: at font_scale 1.5 in landscape, the title +
                // two reason buttons + the in-flight row below can exceed the
                // dialog's available height with no other way to reach the
                // clipped buttons — AlertDialog's `text` slot does not scroll
                // on its own.
                Column(Modifier.verticalScroll(rememberScrollState())) {
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
                    if (closing) {
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                stringResource(R.string.my_day_closing),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
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
    // Null when item.lead_id == null — see the call site's comment. Mirrors
    // LeadRow's own nullable onCall.
    onDone: (() -> Unit)?,
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
                // Skip the button rather than render one that silently does
                // nothing: a follow-up with no parent lead has no outcome to
                // log, and CallOutcomeActivity would just finish() on open.
                if (onDone != null) {
                    TextButton(onClick = onDone, modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.my_day_action_done))
                    }
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
