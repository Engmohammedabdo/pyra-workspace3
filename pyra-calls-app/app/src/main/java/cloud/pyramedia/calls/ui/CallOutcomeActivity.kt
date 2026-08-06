package cloud.pyramedia.calls.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.CallOutcomeRequest
import cloud.pyramedia.calls.core.DubaiTime
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.ErrorQueue
import cloud.pyramedia.calls.notify.Notifier
import cloud.pyramedia.calls.ui.theme.PyraTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// Mirrors the 3 outcomes app/api/mobile/call-outcome/route.ts's OUTCOMES
// tuple accepts verbatim (route.ts:11) — the server is the single source of
// truth for the allowed values; this list only supplies the button labels.
private data class OutcomeOption(val value: String, val labelRes: Int)
private val OUTCOME_OPTIONS = listOf(
    OutcomeOption("interested", R.string.co_outcome_interested),
    OutcomeOption("not_interested", R.string.co_outcome_not_interested),
    OutcomeOption("call_again", R.string.co_outcome_call_again),
)

// Relative day presets for the optional "call again on…" field — a
// date-picker dialog would add real weight to this screen for a choice that
// only needs day granularity. Day is fixed at 10:00 Dubai time
// (DubaiTime.followUpPresetMillis) so every scheduled follow-up lands inside
// business hours without also asking the agent to pick a time.
private data class FollowUpPreset(val days: Int, val labelRes: Int)
private val FOLLOW_UP_PRESETS = listOf(
    FollowUpPreset(1, R.string.co_preset_tomorrow),
    FollowUpPreset(3, R.string.co_preset_in_3_days),
    FollowUpPreset(7, R.string.co_preset_next_week),
)

/**
 * Post-call outcome capture — launched from [Notifier.showMatched]'s content
 * intent with extras `lead_id` + `lead_name`. Same structure as
 * [QuickAddActivity]: RTL wrapper, single Compose screen, submit/error
 * handling via [ApiClient.callOutcome].
 */
class CallOutcomeActivity : ComponentActivity() {
    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val leadId = intent.getStringExtra("lead_id").orEmpty()
        val leadName = intent.getStringExtra("lead_name").orEmpty()
        if (leadId.isEmpty()) { finish(); return }
        val prefs = AppPrefs(this)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }

        setContent {
            PyraTheme {
                var outcomeIndex by remember { mutableStateOf<Int?>(null) }
                var note by remember { mutableStateOf("") }
                var presetDays by remember { mutableStateOf<Int?>(null) }
                var saving by remember { mutableStateOf(false) }
                var error by remember { mutableStateOf<String?>(null) }
                val scope = rememberCoroutineScope()
                val unknownLead = stringResource(R.string.my_day_unknown_lead)
                val outcomeRequired = stringResource(R.string.co_outcome_required)
                val netError = stringResource(R.string.net_error)
                val saved = stringResource(R.string.co_saved)
                val followUpErrorMsg = stringResource(R.string.co_follow_up_error)

                Column(Modifier.fillMaxSize().padding(24.dp)) {
                    Text(stringResource(R.string.co_title), style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.co_lead_label, leadName.ifBlank { unknownLead }))
                    Spacer(Modifier.height(16.dp))
                    Row {
                        OUTCOME_OPTIONS.forEachIndexed { index, opt ->
                            if (index != 0) Spacer(Modifier.width(8.dp))
                            FilterChip(
                                selected = outcomeIndex == index,
                                onClick = { outcomeIndex = index },
                                label = { Text(stringResource(opt.labelRes)) },
                            )
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    OutlinedTextField(
                        value = note, onValueChange = { note = it },
                        label = { Text(stringResource(R.string.co_note_label)) },
                        modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4,
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(stringResource(R.string.co_follow_up_label), style = MaterialTheme.typography.labelLarge)
                    Spacer(Modifier.height(8.dp))
                    Row {
                        FOLLOW_UP_PRESETS.forEachIndexed { index, preset ->
                            if (index != 0) Spacer(Modifier.width(8.dp))
                            FilterChip(
                                selected = presetDays == preset.days,
                                onClick = { presetDays = if (presetDays == preset.days) null else preset.days },
                                label = { Text(stringResource(preset.labelRes)) },
                            )
                        }
                    }
                    error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error) }
                    Spacer(Modifier.height(24.dp))
                    Button(
                        enabled = !saving, modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            error = null
                            val idx = outcomeIndex
                            if (idx == null) { error = outcomeRequired; return@Button }
                            saving = true
                            scope.launch {
                                val nextFollowUpAtIso = presetDays?.let { days ->
                                    DubaiTime.isoUtc(DubaiTime.followUpPresetMillis(System.currentTimeMillis(), days))
                                }
                                val req = CallOutcomeRequest(
                                    lead_id = leadId,
                                    outcome = OUTCOME_OPTIONS[idx].value,
                                    note = note.trim().ifBlank { null },
                                    next_follow_up_at = nextFollowUpAtIso,
                                )
                                val res = withContext(Dispatchers.IO) { api.callOutcome(req) }
                                saving = false
                                when (res) {
                                    is ApiResult.Ok -> {
                                        // Success covers BOTH the plain-success and
                                        // deduplicated=true cases (a 60s retry match is
                                        // not an error — route.ts:67-79). follow_up_error
                                        // still means the outcome itself was saved, so
                                        // this is still an ApiResult.Ok, just with a
                                        // different toast — never treated as a failure.
                                        Notifier.cancel(this@CallOutcomeActivity, leadId.hashCode())
                                        val msg = if (res.data.follow_up_error) followUpErrorMsg else saved
                                        Toast.makeText(this@CallOutcomeActivity, msg, Toast.LENGTH_LONG).show()
                                        finish()
                                    }
                                    is ApiResult.Err -> {
                                        ErrorQueue(this@CallOutcomeActivity).enqueue(
                                            message = "HTTP ${res.code}: ${res.message}",
                                            source = "call_outcome_failed",
                                            severity = "warning",
                                        )
                                        error = res.message
                                    }
                                    ApiResult.NetworkError -> error = netError
                                }
                            }
                        },
                    ) { Text(stringResource(if (saving) R.string.co_saving else R.string.co_save)) }
                }
            }
        }
    }
}
