package cloud.pyramedia.calls.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.QuickAddRequest
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.ErrorQueue
import cloud.pyramedia.calls.notify.Notifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class QuickAddActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val phone = intent.getStringExtra("phone").orEmpty()
        val deviceCallKey = intent.getStringExtra("device_call_key").orEmpty()
        if (deviceCallKey.isEmpty()) { finish(); return }
        val prefs = AppPrefs(this)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }

        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme { Surface {
                    var isB2b by remember { mutableStateOf(true) }
                    var name by remember { mutableStateOf("") }
                    var company by remember { mutableStateOf("") }
                    var saving by remember { mutableStateOf(false) }
                    var error by remember { mutableStateOf<String?>(null) }
                    val scope = rememberCoroutineScope()
                    val nameRequired = stringResource(R.string.qa_name_required)
                    val companyRequired = stringResource(R.string.qa_company_required)
                    val alreadyExisted = stringResource(R.string.qa_already_existed)
                    val netError = stringResource(R.string.net_error)

                    Column(Modifier.fillMaxSize().padding(24.dp)) {
                        Text(stringResource(R.string.qa_title), style = MaterialTheme.typography.headlineSmall)
                        Spacer(Modifier.height(8.dp))
                        Text("${stringResource(R.string.qa_phone_label)}: $phone")
                        Spacer(Modifier.height(16.dp))
                        Row {
                            FilterChip(selected = isB2b, onClick = { isB2b = true },
                                label = { Text(stringResource(R.string.qa_type_b2b)) })
                            Spacer(Modifier.width(8.dp))
                            FilterChip(selected = !isB2b, onClick = { isB2b = false },
                                label = { Text(stringResource(R.string.qa_type_b2c)) })
                        }
                        Spacer(Modifier.height(16.dp))
                        OutlinedTextField(value = name, onValueChange = { name = it },
                            label = { Text(stringResource(R.string.qa_name)) },
                            singleLine = true, modifier = Modifier.fillMaxWidth())
                        if (isB2b) {
                            Spacer(Modifier.height(12.dp))
                            OutlinedTextField(value = company, onValueChange = { company = it },
                                label = { Text(stringResource(R.string.qa_company)) },
                                singleLine = true, modifier = Modifier.fillMaxWidth())
                        }
                        error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error) }
                        Spacer(Modifier.height(24.dp))
                        Button(
                            enabled = !saving, modifier = Modifier.fillMaxWidth(),
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
                } }
            }
        }
    }
}
