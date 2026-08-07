package cloud.pyramedia.calls.ui

import android.os.Bundle
import android.text.format.DateFormat
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.CallOutcomeRequest
import cloud.pyramedia.calls.core.DubaiTime
import cloud.pyramedia.calls.core.OutcomeForm
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.ErrorQueue
import cloud.pyramedia.calls.notify.Notifier
import cloud.pyramedia.calls.ui.components.PyraChip
import cloud.pyramedia.calls.ui.components.PyraScreen
import cloud.pyramedia.calls.ui.theme.LocalPyraColors
import cloud.pyramedia.calls.ui.theme.PyraTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.util.Date

// Mirrors the 3 outcomes app/api/mobile/call-outcome/route.ts's OUTCOMES
// tuple accepts verbatim — the server is the single source of truth for the
// allowed values; this list only supplies the button labels.
private data class OutcomeOption(val value: String, val labelRes: Int)
private val OUTCOME_OPTIONS = listOf(
    OutcomeOption("interested", R.string.co_outcome_interested),
    OutcomeOption(OutcomeForm.OUTCOME_NOT_INTERESTED, R.string.co_outcome_not_interested),
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

// Taken from the web's LOST_REASON_CHIP_KEYS (components/crm/pipeline/
// move-stage-confirm-modal.tsx) rather than invented here — MINUS
// «تأجل القرار», which is not "not interested" at all, it is "call again".
// Leaving it in the list would invite the wrong classification.
private val REASON_CHIPS = listOf(
    R.string.co_reason_price,
    R.string.co_reason_competitor,
    R.string.co_reason_other,
)

/**
 * Post-call outcome capture — launched from [Notifier.showMatched]'s content
 * intent with extras `lead_id` + `lead_name`, and OPTIONALLY `follow_up_id` /
 * `follow_up_title` / `follow_up_due_at` / `follow_up_overdue` when the call
 * answered a scheduled follow-up.
 *
 * Wave C: one save now carries up to three CRM writes — the outcome note, a
 * stage move to «غير مهتم», and closing the follow-up — so the rep never
 * opens a list to finish the job.
 */
class CallOutcomeActivity : ComponentActivity() {
    @OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val leadId = intent.getStringExtra("lead_id").orEmpty()
        val leadName = intent.getStringExtra("lead_name").orEmpty()
        val followUpId = intent.getStringExtra("follow_up_id")?.takeIf { it.isNotBlank() }
        val followUpTitle = intent.getStringExtra("follow_up_title").orEmpty()
        val followUpDueAt = intent.getStringExtra("follow_up_due_at").orEmpty()
        val followUpOverdue = intent.getBooleanExtra("follow_up_overdue", false)
        if (leadId.isEmpty()) { finish(); return }
        val prefs = AppPrefs(this)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }

        setContent {
            PyraTheme {
                // Fix 4 (rotation wipes the form): all five are the sheet's
                // typed/picked state, so a config change (rotation — this
                // screen is NOT orientation-locked, landscape is supported)
                // must not silently reset them. All are primitives or
                // nullable primitives, which rememberSaveable's default
                // Saver already supports — including the null case for the
                // two Int? fields — so no custom Saver is needed.
                var outcomeIndex by rememberSaveable { mutableStateOf<Int?>(null) }
                var note by rememberSaveable { mutableStateOf("") }
                var reason by rememberSaveable { mutableStateOf("") }
                var presetDays by rememberSaveable { mutableStateOf<Int?>(null) }
                // Fix 1c safety net: pre-check the switch ONLY when the rep
                // can actually SEE which follow-up this is (a title or a due
                // date rendered below) — never from followUpId alone. Before
                // the server sent the identity fields, this defaulted to
                // `followUpId != null` and could silently complete a
                // follow-up the rep never saw (e.g. a September renewal
                // reminder closed by a call about something unrelated). Do
                // NOT "simplify" this back to `followUpId != null` — a switch
                // that would silently complete something the rep cannot see
                // must never start on.
                var closeFollowUp by rememberSaveable {
                    mutableStateOf(
                        followUpId != null && (followUpTitle.isNotBlank() || followUpDueAt.isNotBlank()),
                    )
                }
                var saving by remember { mutableStateOf(false) }
                var error by remember { mutableStateOf<String?>(null) }
                val scope = rememberCoroutineScope()
                val context = this@CallOutcomeActivity

                // A transient validation/network message must never outlive the
                // state it described. This screen can disable Save (reasonOk),
                // so an uncleanable message becomes a dead end — e.g. a
                // network error shown while the reason was valid must not
                // stay pinned once the rep edits the reason back below the
                // floor, describing a blocker that is no longer the real one.
                // Both outcomeIndex AND reason are watched: any input change
                // makes a previous validation-or-network message stale.
                LaunchedEffect(outcomeIndex, reason) { error = null }

                val selectedOutcome = outcomeIndex?.let { OUTCOME_OPTIONS[it].value }
                val needsReason = OutcomeForm.requiresReason(selectedOutcome)
                val showPresets = OutcomeForm.allowsFollowUp(selectedOutcome)
                val reasonOk = OutcomeForm.reasonSatisfied(selectedOutcome, reason)

                val unknownLead = stringResource(R.string.my_day_unknown_lead)
                val outcomeRequired = stringResource(R.string.co_outcome_required)
                val netError = stringResource(R.string.net_error)
                val saved = stringResource(R.string.co_saved)
                val followUpErrorMsg = stringResource(R.string.co_follow_up_error)
                val stageErrorMsg = stringResource(R.string.co_stage_error)
                val completeErrorMsg = stringResource(R.string.co_complete_error)
                val reasonRequiredHint = stringResource(
                    R.string.co_reason_required_hint, OutcomeForm.MIN_REASON_LENGTH,
                )

                PyraScreen(
                    title = stringResource(R.string.co_title),
                    bottomBar = {
                        Column {
                            // Precedence: a real error always wins. Otherwise,
                            // if Save is disabled because the reason is too
                            // short, say so HERE — the only other explanation
                            // (the muted counter near the reason field) lives
                            // inside the scroll area and can scroll out of
                            // view at large font scales, leaving a greyed-out
                            // button with no visible reason anywhere.
                            val bottomBarMessage = error ?: reasonRequiredHint.takeIf { !reasonOk }
                            bottomBarMessage?.let {
                                Text(
                                    it,
                                    color = if (error != null) MaterialTheme.colorScheme.error
                                    else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.height(8.dp))
                            }
                            Button(
                                // Locked only on the reason rule — an unpicked
                                // outcome falls through to the inline error
                                // below, which explains itself.
                                enabled = !saving && reasonOk,
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    error = null
                                    val idx = outcomeIndex
                                    if (idx == null) { error = outcomeRequired; return@Button }
                                    saving = true
                                    scope.launch {
                                        val outcomeValue = OUTCOME_OPTIONS[idx].value
                                        // Belt and braces: the presets are hidden for
                                        // not_interested, but a stale selection made
                                        // BEFORE the rep changed their mind would
                                        // otherwise still be sent.
                                        val days = OutcomeForm.effectiveFollowUpDays(outcomeValue, presetDays)
                                        val nextFollowUpAtIso = days?.let {
                                            DubaiTime.isoUtc(
                                                DubaiTime.followUpPresetMillis(System.currentTimeMillis(), it),
                                            )
                                        }
                                        val req = CallOutcomeRequest(
                                            lead_id = leadId,
                                            outcome = outcomeValue,
                                            note = note.trim().ifBlank { null },
                                            next_follow_up_at = nextFollowUpAtIso,
                                            not_interested_reason =
                                                if (OutcomeForm.requiresReason(outcomeValue)) reason.trim() else null,
                                            complete_follow_up_id =
                                                if (closeFollowUp) followUpId else null,
                                        )
                                        val res = withContext(Dispatchers.IO) { api.callOutcome(req) }
                                        saving = false
                                        when (res) {
                                            is ApiResult.Ok -> {
                                                // Ok covers plain success AND deduplicated
                                                // (a 60s retry match is not an error). The
                                                // three *_error flags mean the outcome WAS
                                                // saved but a side effect did not land —
                                                // still a success, just a different toast.
                                                Notifier.cancel(context, leadId.hashCode())
                                                // Flags are independent — two can be true at
                                                // once (e.g. the stage move AND the follow-up
                                                // close both fail). Reporting only the first
                                                // would let the rep assume the other side
                                                // effect landed when it didn't.
                                                val warnings = OutcomeForm.outcomeWarnings(
                                                    stageError = res.data.stage_error,
                                                    completeError = res.data.complete_error,
                                                    followUpError = res.data.follow_up_error,
                                                ).map { warning ->
                                                    when (warning) {
                                                        OutcomeForm.OutcomeWarning.STAGE -> stageErrorMsg
                                                        OutcomeForm.OutcomeWarning.CLOSE -> completeErrorMsg
                                                        OutcomeForm.OutcomeWarning.FOLLOW_UP -> followUpErrorMsg
                                                    }
                                                }
                                                val msg = if (warnings.isEmpty()) saved else warnings.joinToString("\n")
                                                Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                                                finish()
                                            }
                                            is ApiResult.Err -> {
                                                ErrorQueue(context).enqueue(
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
                    },
                ) {
                    Card(
                        Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = LocalPyraColors.current.noticeContainer,
                        ),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text(
                                stringResource(R.string.co_lead_eyebrow),
                                style = MaterialTheme.typography.labelMedium,
                                color = LocalPyraColors.current.onNoticeContainer,
                            )
                            Text(
                                leadName.ifBlank { unknownLead },
                                style = MaterialTheme.typography.titleLarge,
                                // Fix 2 (audit): explicit colour, matching the
                                // eyebrow above and NoticeCard's own pattern of
                                // colouring EVERY child Text on a
                                // noticeContainer background. Leaving this to
                                // whatever CardDefaults derives for a
                                // non-scheme container is the same class of
                                // defect that once left black text on a dark
                                // background — and the lead's name is the one
                                // piece of context that matters on this screen.
                                color = LocalPyraColors.current.onNoticeContainer,
                            )
                        }
                    }

                    Text(
                        stringResource(R.string.co_outcome_heading),
                        style = MaterialTheme.typography.labelLarge,
                    )
                    // FlowRow, not Row — three chips in a plain Row clipped
                    // «يحتاج إعادة اتصال» off screen at larger system font
                    // sizes (B-02).
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OUTCOME_OPTIONS.forEachIndexed { index, opt ->
                            PyraChip(
                                label = stringResource(opt.labelRes),
                                selected = outcomeIndex == index,
                                onClick = {
                                    outcomeIndex = index
                                    // Clear a date picked before the rep changed
                                    // their mind — the presets are about to
                                    // disappear and a hidden-but-set control is
                                    // exactly how wrong data gets sent.
                                    if (!OutcomeForm.allowsFollowUp(opt.value)) presetDays = null
                                    // `reason`, unlike presetDays above, is
                                    // DELIBERATELY left alone here — this
                                    // asymmetry is intentional, not a miss.
                                    // Keeping typed text is the same principle
                                    // as note surviving a mis-tap: a rep who
                                    // taps the wrong chip and comes back should
                                    // find their words still there. presetDays
                                    // is cleared instead because sending a
                                    // follow-up date together with
                                    // not_interested is a contradiction the
                                    // server would accept — it must be made
                                    // impossible to send, not just hidden.
                                },
                            )
                        }
                    }

                    if (needsReason) {
                        Text(
                            stringResource(R.string.co_reason_heading),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            REASON_CHIPS.forEach { chipRes ->
                                val chip = stringResource(chipRes)
                                PyraChip(
                                    label = chip,
                                    selected = reason.trim() == chip,
                                    // Replace only — matches the web's setReason(chip)
                                    // (move-stage-confirm-modal.tsx:296). A toggle-to-
                                    // empty here would destroy a typed custom reason on
                                    // the first tap, and re-tapping the selected chip
                                    // would re-disable Save with one accidental tap.
                                    onClick = { reason = chip },
                                )
                            }
                        }
                        OutlinedTextField(
                            value = reason, onValueChange = { reason = it },
                            label = { Text(stringResource(R.string.co_reason_label)) },
                            modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4,
                            // A request already in flight must not be edited
                            // out from under itself.
                            enabled = !saving,
                        )
                        if (!reasonOk) {
                            // Muted, not error-coloured: an untouched field right
                            // after picking «غير مهتم» is not yet "wrong" — the
                            // disabled Save button already signals the blocker.
                            // Matches the web's counter styling (text-xs
                            // text-muted-foreground, no isError on the textarea) —
                            // move-stage-confirm-modal.tsx:322.
                            Text(
                                stringResource(
                                    R.string.co_reason_min,
                                    reason.trim().length, OutcomeForm.MIN_REASON_LENGTH,
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    OutlinedTextField(
                        value = note, onValueChange = { note = it },
                        label = { Text(stringResource(R.string.co_note_label)) },
                        modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4,
                        // A request already in flight must not be edited out
                        // from under itself.
                        enabled = !saving,
                    )

                    if (followUpId != null) {
                        Text(
                            stringResource(R.string.co_close_follow_up_heading),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        Card(
                            Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surface,
                            ),
                        ) {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    // The whole row is one labelled control — the
                                    // Switch alone has no text riding along with
                                    // it (the Card has no onClick, so nothing
                                    // merges the sibling text into it), which left
                                    // TalkBack announcing a bare "off, switch" for
                                    // a toggle that writes to a customer record.
                                    // This also gives the rep a much larger touch
                                    // target than the Switch's own hit area.
                                    .toggleable(
                                        value = closeFollowUp,
                                        onValueChange = { closeFollowUp = it },
                                        role = Role.Switch,
                                    )
                                    .padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        followUpTitle.ifBlank {
                                            stringResource(R.string.co_close_follow_up_switch)
                                        },
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                    if (followUpDueAt.isNotBlank()) {
                                        val dueLabel = remember(followUpDueAt) {
                                            formatIsoToLocalDateTime(context, followUpDueAt)
                                        }
                                        Text(
                                            stringResource(
                                                if (followUpOverdue) R.string.co_close_follow_up_overdue
                                                else R.string.co_close_follow_up_due,
                                                dueLabel,
                                            ),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = if (followUpOverdue) LocalPyraColors.current.danger
                                            else MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                Spacer(Modifier.width(8.dp))
                                // onCheckedChange = null: the parent Row's
                                // toggleable already handles the tap/click and
                                // the TalkBack double-tap. The Switch here is a
                                // pure state mirror — checked still tracks
                                // closeFollowUp, so it stays visually correct on
                                // every recomposition.
                                Switch(checked = closeFollowUp, onCheckedChange = null)
                            }
                        }
                    }

                    if (showPresets) {
                        Text(
                            stringResource(R.string.co_follow_up_label),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            FOLLOW_UP_PRESETS.forEach { preset ->
                                PyraChip(
                                    label = stringResource(preset.labelRes),
                                    selected = presetDays == preset.days,
                                    onClick = {
                                        presetDays = if (presetDays == preset.days) null else preset.days
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun formatIsoToLocalDateTime(context: android.content.Context, iso: String): String {
    val millis = runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull() ?: return iso
    val date = Date(millis)
    return "${DateFormat.getDateFormat(context).format(date)} ${DateFormat.getTimeFormat(context).format(date)}"
}
