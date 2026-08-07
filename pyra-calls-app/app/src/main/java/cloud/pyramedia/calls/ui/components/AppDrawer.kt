package cloud.pyramedia.calls.ui.components

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.ui.UpdateActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Modal side-drawer content: agent identity, the manual update-check, and
 * logout — the three things that used to sit in HomeScreen's scrolling
 * content, styled like ordinary work-flow actions. Logout is destructive
 * (forces a re-login on a work phone) so it gets both the theme's error
 * colour and a confirmation dialog here.
 *
 * Reached only via the menu [androidx.compose.material3.IconButton] in
 * HomeScreen's greeting row — the caller's `ModalNavigationDrawer` sets
 * `gesturesEnabled = false`, so an edge swipe (the system Back gesture on
 * gesture-nav devices) can never fight this drawer for the same edge.
 */
@Composable
fun AppDrawer(
    prefs: AppPrefs,
    api: ApiClient,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var checkingUpdate by remember { mutableStateOf(false) }
    var showLogoutConfirm by remember { mutableStateOf(false) }

    val upToDateMsg = stringResource(R.string.home_up_to_date)
    val checkFailedMsg = stringResource(R.string.home_check_failed)

    ModalDrawerSheet {
        Column(Modifier.fillMaxWidth().padding(20.dp)) {
            Image(
                painter = painterResource(R.drawable.ic_launcher_foreground),
                contentDescription = stringResource(R.string.cd_app_logo),
                modifier = Modifier
                    .size(56.dp)
                    .clip(MaterialTheme.shapes.large)
                    .background(MaterialTheme.colorScheme.primary),
            )
            Spacer(Modifier.height(12.dp))
            val displayName = prefs.displayName.orEmpty()
            val username = prefs.username.orEmpty()
            Text(
                displayName.ifBlank { username },
                style = MaterialTheme.typography.titleMedium,
            )
            // Only a SECOND line if it says something the first one doesn't.
            // Most agents' display_name is just their username, and printing
            // "cosette / cosette" reads as a rendering bug.
            if (username.isNotBlank() && !displayName.equals(username, ignoreCase = true)) {
                Text(
                    username,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(20.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))

            Text(
                stringResource(R.string.home_version, BuildConfig.VERSION_NAME),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(
                enabled = !checkingUpdate,
                onClick = {
                    checkingUpdate = true
                    scope.launch {
                        // Manual check bypasses UpdatePolicy.shouldCheck's 6h
                        // throttle by design — the user explicitly asked.
                        val res = withContext(Dispatchers.IO) { api.appVersion() }
                        checkingUpdate = false
                        when (res) {
                            is ApiResult.Ok -> {
                                val latest = res.data.latest
                                if (latest != null && latest.version_code > BuildConfig.VERSION_CODE) {
                                    context.startActivity(Intent(context, UpdateActivity::class.java))
                                } else {
                                    Toast.makeText(context, upToDateMsg, Toast.LENGTH_SHORT).show()
                                }
                            }
                            else -> Toast.makeText(context, checkFailedMsg, Toast.LENGTH_SHORT).show()
                        }
                    }
                },
            ) {
                Text(stringResource(
                    if (checkingUpdate) R.string.home_checking_update else R.string.home_check_update,
                ))
            }

            Spacer(Modifier.weight(1f))

            TextButton(
                modifier = Modifier.fillMaxWidth(),
                onClick = { showLogoutConfirm = true },
            ) {
                Text(stringResource(R.string.home_logout), color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (showLogoutConfirm) {
        AlertDialog(
            onDismissRequest = { showLogoutConfirm = false },
            title = { Text(stringResource(R.string.menu_logout_title)) },
            text = { Text(stringResource(R.string.menu_logout_body)) },
            confirmButton = {
                TextButton(onClick = { showLogoutConfirm = false; onLogout() }) {
                    Text(stringResource(R.string.home_logout), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutConfirm = false }) {
                    Text(stringResource(R.string.menu_cancel))
                }
            },
        )
    }
}
