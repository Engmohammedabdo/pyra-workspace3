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
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.ui.components.NoticeCard
import cloud.pyramedia.calls.ui.components.PyraScreen

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
            {
                // future.get() can complete exceptionally (e.g. the backing
                // service died) — runCatching + a safe ERROR default means
                // that can never crash the main thread. This listener fires
                // on every ON_RESUME of Permissions AND Home.
                val status = runCatching { future.get() }.getOrDefault(UnusedAppRestrictionsConstants.ERROR)
                enabled.value = isUnusedAppRestrictionsEnabled(status)
            },
            ContextCompat.getMainExecutor(context),
        )
    }

    return enabled
}

/** Immutable snapshot of AppPrefs' CA-C2 pending-update cache (`pendingUpdate*`). */
data class PendingUpdate(
    val versionCode: Int,
    val versionName: String?,
    val mandatory: Boolean,
)

/**
 * Holder returned by [rememberPendingUpdate]: `.value` for the current
 * snapshot, `.refresh()` to force an immediate re-read from [AppPrefs].
 * `refresh` is exposed (rather than keeping this purely ON_RESUME-driven)
 * so [UpdateRequiredScreen] can ALSO poll it on its own timer — see that
 * screen's `LaunchedEffect`.
 */
class PendingUpdateState internal constructor(private val prefs: AppPrefs) {
    private val state = mutableStateOf(snapshot())
    val value: PendingUpdate get() = state.value

    fun refresh() {
        state.value = snapshot()
    }

    private fun snapshot() = PendingUpdate(
        versionCode = prefs.pendingUpdateVersionCode,
        versionName = prefs.pendingUpdateVersionName,
        mandatory = prefs.pendingUpdateMandatory,
    )
}

/**
 * Live mirror of AppPrefs' CA-C2 pending-update cache (see AppPrefs'
 * "Pending-update cache (CA-C2)" comment), colocated with
 * [rememberUnusedAppRestrictionsEnabled] above because it is the exact same
 * idiom fixing the exact same underlying problem: a plain `SharedPreferences`
 * read is NOT Compose `State`, so a value [cloud.pyramedia.calls.sync.SyncWorker]
 * corrects in the background (the owner un-mandates a release, or rolls it
 * back entirely) is invisible to an already-rendered composition until
 * something forces a fresh read. Re-reads on `ON_RESUME`, same as the
 * hibernation status above.
 *
 * This is what stops [UpdateRequiredScreen] from trapping a rep behind a
 * corrected/cleared mandatory block for the life of the process: both
 * `MainActivity`'s `blocked` decision and Home's update banner read this
 * instead of `AppPrefs` directly, so foregrounding the app after the owner
 * fixes the release un-blocks/un-banners it on the spot — no force-close,
 * no reinstall.
 */
@Composable
fun rememberPendingUpdate(prefs: AppPrefs): PendingUpdateState {
    val state = remember { PendingUpdateState(prefs) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { state.refresh() }
    return state
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

    PyraScreen {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(stringResource(R.string.perm_title), style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.perm_body), style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(24.dp))
            Button(onClick = { launcher.launch(REQUIRED_PERMISSIONS) }) {
                Text(stringResource(R.string.perm_grant))
            }
        }

        // Advisory only — never gates onAllGranted. Stays visible for as long
        // as the OS reports restrictions enabled, even after the user comes
        // back from the settings screen (re-queried on ON_RESUME above).
        if (hibernationRestricted) {
            Spacer(Modifier.height(24.dp))
            NoticeCard(
                title = stringResource(R.string.hibernation_title),
                body = stringResource(R.string.hibernation_body),
                action = { HibernationExemptionButton() },
            )
        }
    }
}
