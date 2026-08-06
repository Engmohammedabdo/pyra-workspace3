package cloud.pyramedia.calls.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R

private val EdgePadding = 20.dp

/**
 * The screen shell every Pyra Calls screen goes through.
 *
 * It owns scrolling, so no screen can forget it — that was B-01, where a
 * larger system font or landscape could push the save button off a fixed
 * Column with no way to reach it.
 *
 * ## Why there are two slots
 *
 * `bottomBar` sits OUTSIDE the scrolling area. A vertical `Modifier.weight()`
 * inside a `verticalScroll` column is meaningless — scrolling gives the column
 * unbounded height, so "take a share of the height" has nothing to divide.
 * `HomeScreen` used `Spacer(Modifier.weight(1f))` to push its sync button down;
 * naively wrapping that column in `verticalScroll` would have broken it. Put
 * any always-visible action in `bottomBar` instead. It also reads better: the
 * save button stays on screen instead of being scrolled to.
 *
 * ## Rule for `content`
 *
 * No vertical `Modifier.weight()` inside `content` — same reason. Horizontal
 * weights inside a `Row` are fine.
 */
@Composable
fun PyraScreen(
    modifier: Modifier = Modifier,
    title: String? = null,
    onBack: (() -> Unit)? = null,
    bottomBar: @Composable (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    PyraShell(modifier, title, onBack, bottomBar) { inner ->
        Column(
            modifier = inner.verticalScroll(rememberScrollState())
                .padding(horizontal = EdgePadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}

/**
 * List variant. A `LazyColumn` must NOT be nested in a `verticalScroll`
 * parent — it would be measured with infinite height and crash — so lists get
 * their own shell rather than reusing [PyraScreen].
 */
@Composable
fun PyraListScreen(
    modifier: Modifier = Modifier,
    title: String? = null,
    onBack: (() -> Unit)? = null,
    bottomBar: @Composable (() -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) {
    PyraShell(modifier, title, onBack, bottomBar) { inner ->
        LazyColumn(
            modifier = inner.padding(horizontal = EdgePadding),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content,
        )
    }
}

@Composable
private fun PyraShell(
    modifier: Modifier,
    title: String?,
    onBack: (() -> Unit)?,
    bottomBar: @Composable (() -> Unit)?,
    body: @Composable (Modifier) -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            if (title != null) {
                ScreenHeader(title = title, onBack = onBack)
            }
            // weight(1f) is legal HERE: this Column has a bounded height.
            // It is not legal inside the scrolling child below.
            body(Modifier.weight(1f).fillMaxWidth())
            if (bottomBar != null) {
                Surface(tonalElevation = 3.dp, color = MaterialTheme.colorScheme.surface) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = EdgePadding, vertical = 12.dp),
                    ) { bottomBar() }
                }
            }
        }
    }
}

@Composable
private fun ScreenHeader(title: String, onBack: (() -> Unit)?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = EdgePadding, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack, modifier = Modifier.size(40.dp)) {
                Icon(
                    // AutoMirrored matters: the arrow must flip in RTL.
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.cd_back),
                )
            }
        }
        Text(title, style = MaterialTheme.typography.headlineSmall)
    }
}
