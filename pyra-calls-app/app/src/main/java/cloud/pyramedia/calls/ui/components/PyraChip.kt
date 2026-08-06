package cloud.pyramedia.calls.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Selectable chip. Callers MUST lay these out in a `FlowRow`, not a `Row` —
 * that was B-02: three outcome chips in a plain Row clipped
 * «يحتاج إعادة اتصال» off screen at larger system font sizes.
 */
@Composable
fun PyraChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = if (selected) MaterialTheme.colorScheme.primary
        else MaterialTheme.colorScheme.surface,
        contentColor = if (selected) Color.White
        else MaterialTheme.colorScheme.onSurfaceVariant,
        border = if (selected) null
        else BorderStroke(1.5.dp, MaterialTheme.colorScheme.outline),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 15.dp, vertical = 11.dp),
        )
    }
}
