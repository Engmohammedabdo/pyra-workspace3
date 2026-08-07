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
import cloud.pyramedia.calls.core.QuickAddRequest
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.ErrorQueue
import cloud.pyramedia.calls.notify.Notifier
import cloud.pyramedia.calls.ui.components.PyraChip
import cloud.pyramedia.calls.ui.components.PyraScreen
import cloud.pyramedia.calls.ui.theme.PyraTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// v1.3 — CRM-aligned source picker (mirrors add-lead-modal.tsx SOURCE_VALUES
// plus the mobile-only "phone_call" default). Order + default match the
// locked design: phone_call is first/preselected so zero-friction save stays
// possible and honest.
private data class SourceOption(val value: String, val labelRes: Int)
private val SOURCE_OPTIONS = listOf(
    SourceOption("phone_call", R.string.qa_source_phone_call),
    SourceOption("whatsapp", R.string.qa_source_whatsapp),
    SourceOption("referral", R.string.qa_source_referral),
    SourceOption("manual", R.string.qa_source_manual),
    SourceOption("ad", R.string.qa_source_ad),
    SourceOption("social", R.string.qa_source_social),
    SourceOption("website", R.string.qa_source_website),
)

class QuickAddActivity : ComponentActivity() {
    // ExposedDropdownMenuBox/ExposedDropdownMenu/TrailingIcon are still
    // @ExperimentalMaterial3Api in the pinned compose-bom (2024.12.01) —
    // opted in here rather than project-wide so the experimental surface is
    // scoped to this one screen.
    @OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val phone = intent.getStringExtra("phone").orEmpty()
        val deviceCallKey = intent.getStringExtra("device_call_key").orEmpty()
        if (deviceCallKey.isEmpty()) { finish(); return }
        val prefs = AppPrefs(this)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }

        setContent {
            PyraTheme {
                var isB2b by remember { mutableStateOf(true) }
                var name by remember { mutableStateOf("") }
                var company by remember { mutableStateOf("") }
                var sourceIndex by remember { mutableIntStateOf(0) }
                var sourceExpanded by remember { mutableStateOf(false) }
                var saving by remember { mutableStateOf(false) }
                var error by remember { mutableStateOf<String?>(null) }
                val scope = rememberCoroutineScope()
                val nameRequired = stringResource(R.string.qa_name_required)
                val companyRequired = stringResource(R.string.qa_company_required)
                val alreadyExisted = stringResource(R.string.qa_already_existed)
                val netError = stringResource(R.string.net_error)

                PyraScreen(
                    title = stringResource(R.string.qa_title),
                    bottomBar = {
                        Column {
                        error?.let {
                            Text(it, color = MaterialTheme.colorScheme.error)
                            Spacer(Modifier.height(8.dp))
                        }
                        Button(
                            enabled = !saving,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                error = null
                                if (name.isBlank()) { error = nameRequired; return@Button }
                                if (isB2b && company.isBlank()) { error = companyRequired; return@Button }
                                saving = true
                                scope.launch {
                                    val req = QuickAddRequest(
                                        device_call_key = deviceCallKey,
                                        name = name.trim(),
                                        lead_type = if (isB2b) "b2b" else "b2c",
                                        company = if (isB2b) company.trim() else null,
                                        source = SOURCE_OPTIONS[sourceIndex].value,
                                    )
                                    val res = withContext(Dispatchers.IO) { api.quickAdd(req) }
                                    saving = false
                                    when (res) {
                                        is ApiResult.Ok -> {
                                            Notifier.cancel(this@QuickAddActivity, deviceCallKey.hashCode())
                                            if (res.data.already_existed) {
                                                Toast.makeText(this@QuickAddActivity, alreadyExisted, Toast.LENGTH_LONG).show()
                                            } else {
                                                Notifier.showFeedback(this@QuickAddActivity, res.data.lead_name, res.data.lead_url)
                                            }
                                            finish()
                                        }
                                        is ApiResult.Err -> {
                                            ErrorQueue(this@QuickAddActivity).enqueue(
                                                message = "HTTP ${res.code}: ${res.message}",
                                                source = "quick_add_failed",
                                                severity = "warning",
                                            )
                                            error = res.message
                                        }
                                        ApiResult.NetworkError -> error = netError
                                    }
                                }
                            },
                        ) { Text(stringResource(if (saving) R.string.qa_saving else R.string.qa_save)) }
                        }
                    },
                ) {
                    Text("${stringResource(R.string.qa_phone_label)}: $phone")

                    // FlowRow, not Row — same B-02 treatment as the outcome
                    // chips, applied consistently even though only 2 chips
                    // fit today.
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PyraChip(
                            label = stringResource(R.string.qa_type_b2b),
                            selected = isB2b,
                            onClick = { isB2b = true },
                        )
                        PyraChip(
                            label = stringResource(R.string.qa_type_b2c),
                            selected = !isB2b,
                            onClick = { isB2b = false },
                        )
                    }

                    OutlinedTextField(
                        value = name, onValueChange = { name = it },
                        label = { Text(stringResource(R.string.qa_name)) },
                        singleLine = true, modifier = Modifier.fillMaxWidth(),
                    )
                    if (isB2b) {
                        OutlinedTextField(
                            value = company, onValueChange = { company = it },
                            label = { Text(stringResource(R.string.qa_company)) },
                            singleLine = true, modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    ExposedDropdownMenuBox(
                        expanded = sourceExpanded,
                        onExpandedChange = { sourceExpanded = it },
                    ) {
                        OutlinedTextField(
                            value = stringResource(SOURCE_OPTIONS[sourceIndex].labelRes),
                            onValueChange = {},
                            readOnly = true,
                            label = { Text(stringResource(R.string.qa_source_label)) },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = sourceExpanded) },
                            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                        )
                        ExposedDropdownMenu(
                            expanded = sourceExpanded,
                            onDismissRequest = { sourceExpanded = false },
                        ) {
                            SOURCE_OPTIONS.forEachIndexed { index, option ->
                                DropdownMenuItem(
                                    text = { Text(stringResource(option.labelRes)) },
                                    onClick = { sourceIndex = index; sourceExpanded = false },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
