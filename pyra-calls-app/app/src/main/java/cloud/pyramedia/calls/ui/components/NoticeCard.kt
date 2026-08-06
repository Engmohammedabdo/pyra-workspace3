package cloud.pyramedia.calls.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.ui.theme.LocalPyraColors

/**
 * Advisory card — the update nag and the hibernation warning. Replaces two
 * hand-written hex pairs in HomeScreen (0xFFFFF3CD / 0xFF664D03) that would
 * have stayed bright yellow on a black screen once dark mode landed (U-03).
 */
@Composable
fun NoticeCard(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    action: @Composable (() -> Unit)? = null,
) {
    val colors = LocalPyraColors.current
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = colors.noticeContainer),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                color = colors.onNoticeContainer,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                body,
                style = MaterialTheme.typography.bodySmall,
                color = colors.onNoticeContainer,
            )
            if (action != null) {
                Spacer(Modifier.height(10.dp))
                action()
            }
        }
    }
}
