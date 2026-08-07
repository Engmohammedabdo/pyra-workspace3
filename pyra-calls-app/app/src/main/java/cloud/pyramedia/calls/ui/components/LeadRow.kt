package cloud.pyramedia.calls.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.ui.theme.LocalPyraColors

enum class LeadTone { Overdue, Cold, Neutral }

@Composable
fun LeadRow(
    name: String,
    chipText: String,
    tone: LeadTone,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onCall: (() -> Unit)? = null,
    // Optional action strip rendered BELOW the content, full width. Not on the
    // content row: that row already carries name + subtitle + chip + a 40dp
    // call button, and two more controls beside them clip at font_scale 1.5 on
    // a 384dp screen — the same failure as B-02 and I-1.
    footer: (@Composable () -> Unit)? = null,
) {
    val pyra = LocalPyraColors.current
    val toneColor = when (tone) {
        LeadTone.Overdue -> pyra.danger
        LeadTone.Cold -> pyra.cool
        LeadTone.Neutral -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        // IntrinsicSize.Min is what lets the 4dp edge stripe below stretch to
        // the card's own height instead of collapsing to zero.
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(
                Modifier
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(toneColor),
            )
            Column(Modifier.weight(1f)) {
                Row(
                    Modifier.padding(horizontal = 13.dp, vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            name,
                            style = MaterialTheme.typography.titleSmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (subtitle != null) {
                            Text(
                                subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            chipText,
                            style = MaterialTheme.typography.labelSmall,
                            color = toneColor,
                        )
                    }
                    if (onCall != null) {
                        Spacer(Modifier.width(8.dp))
                        Surface(
                            onClick = onCall,
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(40.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    painter = painterResource(R.drawable.ic_call),
                                    contentDescription = stringResource(R.string.cd_call, name),
                                    tint = Color.White,
                                )
                            }
                        }
                    }
                }
                if (footer != null) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    footer()
                }
            }
        }
    }
}
