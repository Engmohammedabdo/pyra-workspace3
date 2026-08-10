package cloud.pyramedia.calls.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.ui.components.PyraScreen
import cloud.pyramedia.calls.ui.theme.LocalPyraColors

/**
 * B-15 — the way out of the one state that had none.
 *
 * Shown ONLY for [cloud.pyramedia.calls.core.AppGate.Screen.SESSION_DEAD_BLOCKED]:
 * a mandatory release the phone hasn't caught up to, AND a device key the
 * server no longer accepts. See `AppGate`'s doc for why that combination used
 * to be terminal.
 *
 * ## Why there is no "update now" button here
 *
 * Because it would not work, and a button that cannot work is worse than no
 * button — the rep taps it, nothing happens, and they conclude the app is
 * broken rather than that they need to sign in. `GET /api/mobile/app-download`
 * goes through `requireDeviceAuth`, so with a revoked key it answers 401. The
 * update genuinely cannot be fetched until the session is fixed, so signing in
 * is not merely the better first step — it is the only possible one.
 *
 * Order of the two problems on screen is deliberate: the dead session comes
 * first because it is both the blocker AND the thing the rep can actually act
 * on. The mandatory update is stated second, as what happens next, so nobody
 * signs in and is then surprised to land on the update screen.
 *
 * No polling loop either, unlike [UpdateRequiredScreen]: that screen's 60s
 * `/api/mobile/app-version` poll is the safety valve for a mistakenly-mandatory
 * release, and it is key-authenticated too — from here it would 401 every
 * minute forever and could never lift the block. Signing in returns the phone
 * to [UpdateRequiredScreen], which resumes that poll with a key that works.
 *
 * [BackHandler] still consumes back: this is a blocking state, and the screen
 * behind it is the update block, not Home.
 */
@Composable
fun SessionDeadBlockedScreen(
    versionName: String,
    onRelogin: () -> Unit,
) {
    BackHandler { /* consumed — signing in is the only route forward */ }

    PyraScreen(onBack = null) {
        Text(
            stringResource(R.string.home_session_dead_title),
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            stringResource(R.string.home_session_dead_body),
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            stringResource(R.string.session_dead_blocked_update_pending, versionName),
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = LocalPyraColors.current.danger,
                // Same pairing as Home's session-dead banner: a single fixed
                // colour fails one of the two themes on this container.
                contentColor = MaterialTheme.colorScheme.onError,
            ),
            onClick = onRelogin,
        ) {
            Text(stringResource(R.string.home_session_dead_button))
        }
        Spacer(Modifier.height(16.dp))
        Text(
            stringResource(R.string.update_required_contact_admin),
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
        )
    }
}
