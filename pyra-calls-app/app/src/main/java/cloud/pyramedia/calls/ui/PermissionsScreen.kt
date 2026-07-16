package cloud.pyramedia.calls.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import androidx.core.content.PackageManagerCompat
import androidx.core.content.UnusedAppRestrictionsConstants
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import cloud.pyramedia.calls.R

val REQUIRED_PERMISSIONS: Array<String> = buildList {
    add(Manifest.permission.READ_CALL_LOG)
    add(Manifest.permission.READ_PHONE_STATE)
    if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
}.toTypedArray()

private fun isUnusedAppRestrictionsEnabled(status: Int): Boolean = when (status) {
    UnusedAppRestrictionsConstants.API_30_BACKPORT,
    UnusedAppRestrictionsConstants.API_30,
    UnusedAppRestrictionsConstants.API_31,
    -> true
    else -> false
}

/**
 * Shared status source for the Android 11+ "unused app restrictions"
 * (hibernation / auto-revoke) advisory, consumed by both [PermissionsScreen]
 * and `HomeScreen`. Re-queries on every `ON_RESUME` — this covers the initial
 * check, the return trip from the system settings screen launched by
 * [HibernationExemptionButton], AND a later regression (e.g. the OS
 * re-enables restrictions after an update) without needing a manual refresh
 * signal threaded back from any particular launcher.
 */
@Composable
fun rememberUnusedAppRestrictionsEnabled(): State<Boolean> {
    val context = LocalContext.current
    val enabled = remember { mutableStateOf(false) }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        val future = PackageManagerCompat.getUnusedAppRestrictionsStatus(context)
        future.addListener(
            { enabled.value = isUnusedAppRestrictionsEnabled(future.get()) },
            ContextCompat.getMainExecutor(context),
        )
    }

    return enabled
}

/** Button that launches the system's "manage unused app restrictions" screen for this app. */
@Composable
fun HibernationExemptionButton(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { /* no-op: rememberUnusedAppRestrictionsEnabled() re-queries on the next ON_RESUME */ }

    Button(
        modifier = modifier,
        onClick = {
            launcher.launch(
                IntentCompat.createManageUnusedAppRestrictionsIntent(context, context.packageName),
            )
        },
    ) {
        Text(stringResource(R.string.hibernation_button))
    }
}

@Composable
fun PermissionsScreen(onAllGranted: () -> Unit) {
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants -> if (grants.values.all { it }) onAllGranted() }
    val hibernationRestricted by rememberUnusedAppRestrictionsEnabled()

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(stringResource(R.string.perm_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.perm_body), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(24.dp))
        Button(onClick = { launcher.launch(REQUIRED_PERMISSIONS) }) {
            Text(stringResource(R.string.perm_grant))
        }

        // Advisory only — never gates onAllGranted. Stays visible for as long
        // as the OS reports restrictions enabled, even after the user comes
        // back from the settings screen (re-queried on ON_RESUME above).
        if (hibernationRestricted) {
            Spacer(Modifier.height(24.dp))
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
            ) {
                Column(
                    Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        stringResource(R.string.hibernation_title),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        stringResource(R.string.hibernation_body),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                    Spacer(Modifier.height(12.dp))
                    HibernationExemptionButton()
                }
            }
        }
    }
}
