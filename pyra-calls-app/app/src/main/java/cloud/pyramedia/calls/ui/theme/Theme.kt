package cloud.pyramedia.calls.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/** Colours Material 3 has no slot for. Read via [LocalPyraColors]. */
@Immutable
data class PyraExtraColors(
    val brandAccent: Color,
    val danger: Color,
    val cool: Color,
    val noticeContainer: Color,
    val onNoticeContainer: Color,
)

val LocalPyraColors = staticCompositionLocalOf {
    PyraExtraColors(
        brandAccent = BrandAccent,
        danger = LightDanger,
        cool = LightCool,
        noticeContainer = LightNoticeContainer,
        onNoticeContainer = LightOnNoticeContainer,
    )
}

private val LightScheme = lightColorScheme(
    primary = BrandFill,
    onPrimary = Color.White,
    primaryContainer = LightNoticeContainer,
    onPrimaryContainer = LightOnNoticeContainer,
    background = LightBackground,
    onBackground = LightOnSurface,
    surface = LightSurface,
    onSurface = LightOnSurface,
    surfaceVariant = LightBackground,
    onSurfaceVariant = LightOnSurfaceVariant,
    outline = LightOutline,
    outlineVariant = LightOutline,
    error = LightDanger,
    onError = Color.White,
)

private val DarkScheme = darkColorScheme(
    primary = BrandFill,
    onPrimary = Color.White,
    primaryContainer = DarkNoticeContainer,
    onPrimaryContainer = DarkOnNoticeContainer,
    background = DarkBackground,
    onBackground = DarkOnSurface,
    surface = DarkSurface,
    onSurface = DarkOnSurface,
    surfaceVariant = DarkBackground,
    onSurfaceVariant = DarkOnSurfaceVariant,
    outline = DarkOutline,
    outlineVariant = DarkOutline,
    error = DarkDanger,
    onError = Color(0xFF1C1917),
)

private val PyraShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

/**
 * The one theme wrapper. Also provides RTL for the whole tree — the four
 * activities used to each do this themselves.
 */
@Composable
fun PyraTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val extras = if (darkTheme) {
        PyraExtraColors(
            brandAccent = BrandAccent,
            danger = DarkDanger,
            cool = DarkCool,
            noticeContainer = DarkNoticeContainer,
            onNoticeContainer = DarkOnNoticeContainer,
        )
    } else {
        PyraExtraColors(
            brandAccent = BrandAccent,
            danger = LightDanger,
            cool = LightCool,
            noticeContainer = LightNoticeContainer,
            onNoticeContainer = LightOnNoticeContainer,
        )
    }

    CompositionLocalProvider(
        LocalLayoutDirection provides LayoutDirection.Rtl,
        LocalPyraColors provides extras,
    ) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkScheme else LightScheme,
            typography = PyraTypography,
            shapes = PyraShapes,
            content = content,
        )
    }
}
