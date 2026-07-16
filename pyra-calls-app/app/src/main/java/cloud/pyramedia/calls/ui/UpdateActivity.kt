package cloud.pyramedia.calls.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.ApkDownloader
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.DownloadResult
import cloud.pyramedia.calls.data.ErrorQueue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

private sealed class UpdateState {
    data object Idle : UpdateState()
    data class Downloading(val progress: Int) : UpdateState()
    data object Verifying : UpdateState()
    data class ReadyToInstall(val file: File) : UpdateState()
    data class Failed(val message: String) : UpdateState()
}

/**
 * Single-purpose download → verify → install screen. Launched either from
 * the update notification (SyncWorker's throttled check) or Home's manual
 * "التحقق من تحديث" button.
 */
class UpdateActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = AppPrefs(this)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }

        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme {
                    Surface { UpdateScreen(api) }
                }
            }
        }
    }
}

@Composable
private fun UpdateScreen(api: ApiClient) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<UpdateState>(UpdateState.Idle) }

    val networkFailedMsg = stringResource(R.string.update_failed_network)
    val checksumFailedMsg = stringResource(R.string.update_failed_checksum)
    val staleFailedMsg = stringResource(R.string.update_failed_stale)

    // Returns from the "allow install from this source" settings screen —
    // the file is already downloaded + verified by this point, so on return
    // we just re-check the permission and resume straight to install.
    val installSourcesLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) {
        val current = state
        if (current is UpdateState.ReadyToInstall && context.packageManager.canRequestPackageInstalls()) {
            installApk(context, current.file)
        }
    }

    fun startInstall(file: File) {
        if (!context.packageManager.canRequestPackageInstalls()) {
            installSourcesLauncher.launch(
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${context.packageName}"),
                ),
            )
            return
        }
        installApk(context, file)
    }

    fun startDownload() {
        state = UpdateState.Downloading(0)
        scope.launch {
            when (val descriptor = withContext(Dispatchers.IO) { api.appDownload() }) {
                is ApiResult.Ok -> {
                    val data = descriptor.data
                    val result = withContext(Dispatchers.IO) {
                        ApkDownloader.download(
                            context = context,
                            url = data.url,
                            versionCode = data.version_code,
                            expectedSha256 = data.sha256,
                            sizeBytes = data.size_bytes,
                            onProgress = { pct -> state = UpdateState.Downloading(pct) },
                        )
                    }
                    state = UpdateState.Verifying
                    when (result) {
                        is DownloadResult.Ok -> {
                            val isNewer = withContext(Dispatchers.IO) {
                                isDownloadedApkNewerThanInstalled(context, result.file)
                            }
                            if (isNewer) {
                                state = UpdateState.ReadyToInstall(result.file)
                            } else {
                                result.file.delete()
                                ErrorQueue(context).enqueue(
                                    message = "downloaded update apk version_code is not newer than the installed app",
                                    source = "update_failed",
                                    severity = "error",
                                )
                                state = UpdateState.Failed(staleFailedMsg)
                            }
                        }
                        is DownloadResult.ChecksumMismatch -> {
                            ErrorQueue(context).enqueue(
                                message = "sha256 mismatch for downloaded update apk",
                                source = "update_failed",
                                severity = "error",
                            )
                            state = UpdateState.Failed(checksumFailedMsg)
                        }
                        is DownloadResult.NetworkError -> {
                            ErrorQueue(context).enqueue(
                                message = "update apk download failed: ${result.message}",
                                source = "update_failed",
                                severity = "warning",
                            )
                            state = UpdateState.Failed(networkFailedMsg)
                        }
                    }
                }
                is ApiResult.Err -> {
                    ErrorQueue(context).enqueue(
                        message = "HTTP ${descriptor.code}: ${descriptor.message}",
                        source = "update_failed",
                        severity = "warning",
                    )
                    state = UpdateState.Failed(descriptor.message)
                }
                ApiResult.NetworkError -> {
                    ErrorQueue(context).enqueue(
                        message = "network error fetching app-download descriptor",
                        source = "update_failed",
                        severity = "warning",
                    )
                    state = UpdateState.Failed(networkFailedMsg)
                }
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(stringResource(R.string.update_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(24.dp))

        when (val s = state) {
            is UpdateState.Idle -> {
                Button(onClick = { startDownload() }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.update_download_button))
                }
            }
            is UpdateState.Downloading -> {
                LinearProgressIndicator(
                    progress = { s.progress / 100f },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.update_downloading, s.progress))
            }
            is UpdateState.Verifying -> {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.update_verifying))
            }
            is UpdateState.ReadyToInstall -> {
                Text(stringResource(R.string.update_ready))
                Spacer(Modifier.height(16.dp))
                Button(onClick = { startInstall(s.file) }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.update_install_button))
                }
            }
            is UpdateState.Failed -> {
                Text(s.message, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(16.dp))
                Button(onClick = { startDownload() }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.update_retry_button))
                }
            }
        }
    }
}

/**
 * Guards against an update loop if a stale APK ever gets published under the
 * channel: parses the just-downloaded (and already sha256-verified) archive's
 * own manifest version_code and requires it to be strictly newer than the
 * version currently installed.
 */
private fun isDownloadedApkNewerThanInstalled(context: Context, file: File): Boolean {
    val info = context.packageManager.getPackageArchiveInfo(file.path, 0) ?: return false
    return PackageInfoCompat.getLongVersionCode(info) > BuildConfig.VERSION_CODE.toLong()
}

private fun installApk(context: Context, file: File) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
}
