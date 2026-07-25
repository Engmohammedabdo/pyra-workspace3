package cloud.pyramedia.calls.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.format.DateFormat
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.MyDayColdLead
import cloud.pyramedia.calls.core.MyDayData
import cloud.pyramedia.calls.core.MyDayFollowUp
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
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
 */
@Composable
fun MyDayScreen(api: ApiClient, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<MyDayState>(MyDayState.Loading) }
    val netErrorMsg = stringResource(R.string.net_error)

    fun fetch() {
        state = MyDayState.Loading
        scope.launch {
            val res = withContext(Dispatchers.IO) { api.myDay() }
            state = when (res) {
                is ApiResult.Ok -> MyDayState.Loaded(res.data)
                is ApiResult.Err -> MyDayState.Failed(res.message)
                ApiResult.NetworkError -> MyDayState.Failed(netErrorMsg)
            }
        }
    }

    LaunchedEffect(Unit) { fetch() }

    // ACTION_DIAL only — opens the dialer pre-filled, requires no permission,
    // and lets the agent confirm before the call is placed. ACTION_CALL would
    // need CALL_PHONE (the app must never hold that permission) and places
    // the call with no confirmation step.
    val onCall: (String) -> Unit = { phone ->
        context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
    }

    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(stringResource(R.string.my_day_back)) }
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.my_day_title), style = MaterialTheme.typography.titleLarge)
        }
        Spacer(Modifier.height(12.dp))

        when (val s = state) {
            is MyDayState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            is MyDayState.Failed -> Column(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(s.message, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
                Spacer(Modifier.height(12.dp))
                Button(onClick = { fetch() }) { Text(stringResource(R.string.my_day_retry)) }
            }
            is MyDayState.Loaded -> {
                val d = s.data
                LazyColumn(modifier = Modifier.fillMaxSize()) {
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
                    item { Spacer(Modifier.height(16.dp)) }
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
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String, shown: Int, total: Int) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(
            stringResource(R.string.my_day_count, shown, total),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun EmptySectionCard(message: String) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(message, Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun FollowUpRow(item: MyDayFollowUp, onCall: (String) -> Unit) {
    val context = LocalContext.current
    val overdue = item.status == "overdue"
    val dueLabel = remember(item.due_at) { formatIsoToLocal(context, item.due_at) }
    val phone = item.phone
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    item.lead_name ?: stringResource(R.string.my_day_unknown_lead),
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    stringResource(if (overdue) R.string.my_day_overdue_at else R.string.my_day_due_at, dueLabel),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (item.title.isNotBlank()) {
                    Text(
                        item.title, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (phone != null) {
                Spacer(Modifier.width(8.dp))
                Button(onClick = { onCall(phone) }) { Text(stringResource(R.string.my_day_call)) }
            }
        }
    }
}

@Composable
private fun ColdLeadRow(item: MyDayColdLead, onCall: (String) -> Unit) {
    val phone = item.phone
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(item.lead_name, style = MaterialTheme.typography.titleSmall)
                item.company?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    stringResource(R.string.my_day_cold_days, item.days_since_contact),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            if (phone != null) {
                Spacer(Modifier.width(8.dp))
                Button(onClick = { onCall(phone) }) { Text(stringResource(R.string.my_day_call)) }
            }
        }
    }
}

private fun formatIsoToLocal(context: Context, iso: String): String {
    val millis = runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull() ?: return iso
    val date = Date(millis)
    return "${DateFormat.getDateFormat(context).format(date)} ${DateFormat.getTimeFormat(context).format(date)}"
}
