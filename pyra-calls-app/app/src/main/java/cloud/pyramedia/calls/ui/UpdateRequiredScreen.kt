package cloud.pyramedia.calls.ui

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R
import kotlinx.coroutines.delay

/**
 * Full-screen, non-dismissable block for a MANDATORY release the installed
 * app hasn't caught up to yet ([cloud.pyramedia.calls.core.UpdatePolicy.shouldBlock]).
 *
 * Lives ONLY inside MainActivity's `when {}` — it is a composition-level
 * gate on Home, nothing more. Background call syncing
 * (SyncWorker/SyncScheduler/PhoneStateReceiver) and the unknown-number
 * QuickAddActivity notification path are untouched by this screen's
 * presence: SyncWorker is a CoroutineWorker driven by WorkManager
 * (SyncScheduler.ensurePeriodic/syncNow), entirely independent of whatever
 * Activity/composition happens to be on screen, and QuickAddActivity is
 * launched directly from the "unmatched number" notification's own
 * PendingIntent (FLAG_ACTIVITY_NEW_TASK) — it never routes through
 * MainActivity's `when {}` at all. See the CA-C2 report for how this was
 * verified.
 *
 * ONE action: open [UpdateActivity]. No skip, no back — [BackHandler]
 * consumes the system back button so it can't dismiss this screen.
 *
 * [onRecheck] is the CA-C2 fix-round-1 belt-and-braces escape: MainActivity's
 * `blocked` already goes live on ON_RESUME (see `rememberPendingUpdate` in
 * PermissionsScreen.kt), but a rep who leaves the phone sitting on THIS
 * screen — never backgrounding/foregrounding the app — would never trigger
 * that. The `LaunchedEffect` below polls [onRecheck] on a slow, cheap timer
 * (a local prefs read, no network) instead, so a release the owner
 * un-mandates or rolls back still un-blocks this rep on its own, with no
 * force-close needed.
 */
@Composable
fun UpdateRequiredScreen(versionName: String, onRecheck: () -> Unit) {
    val context = LocalContext.current

    BackHandler { /* consumed — no escape short of updating */ }

    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000)
            onRecheck()
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            stringResource(R.string.update_required_title),
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            stringResource(R.string.update_required_body, versionName),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { context.startActivity(Intent(context, UpdateActivity::class.java)) },
        ) {
            Text(stringResource(R.string.update_required_button))
        }
        Spacer(Modifier.height(16.dp))
        Text(
            stringResource(R.string.update_required_contact_admin),
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
        )
    }
}
