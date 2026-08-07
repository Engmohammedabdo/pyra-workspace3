package cloud.pyramedia.calls.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import cloud.pyramedia.calls.R

val PyraFontFamily = FontFamily(
    Font(R.font.ibm_plex_sans_arabic_regular, FontWeight.Normal),
    Font(R.font.ibm_plex_sans_arabic_semibold, FontWeight.SemiBold),
)

/**
 * Two rules make this Arabic-correct, and both differ from Material's Latin
 * defaults:
 *
 * 1. `letterSpacing = 0.sp` everywhere. Arabic letters join; Material's
 *    positive tracking stretches the connecting strokes and the word reads
 *    as broken.
 * 2. Line heights ~15% above Material's. Arabic dots, hamzas and descenders
 *    collide in Latin-tuned leading.
 *
 * `tnum` on the numeric styles keeps digits the same width so a counter
 * doesn't jump as it ticks 9 → 10.
 */
private fun pyra(
    size: Int,
    lineHeight: Int,
    weight: FontWeight = FontWeight.Normal,
    tabularNums: Boolean = false,
) = TextStyle(
    fontFamily = PyraFontFamily,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = 0.sp,
    fontFeatureSettings = if (tabularNums) "tnum" else null,
)

val PyraTypography = Typography(
    displayLarge = pyra(44, 54, FontWeight.SemiBold, tabularNums = true),
    displayMedium = pyra(38, 47, FontWeight.SemiBold, tabularNums = true),
    // Hero numbers — 109 / 331
    displaySmall = pyra(32, 40, FontWeight.SemiBold, tabularNums = true),
    headlineLarge = pyra(28, 38, FontWeight.SemiBold),
    // Stat-tile numbers — 49 / 31
    headlineMedium = pyra(26, 34, FontWeight.SemiBold, tabularNums = true),
    // Screen titles
    headlineSmall = pyra(22, 32, FontWeight.SemiBold),
    titleLarge = pyra(22, 32, FontWeight.SemiBold),
    // Section headers
    titleMedium = pyra(17, 26, FontWeight.SemiBold),
    // Lead names
    titleSmall = pyra(15, 23, FontWeight.SemiBold),
    // Body
    bodyLarge = pyra(15, 24),
    bodyMedium = pyra(14, 22),
    bodySmall = pyra(13, 21),
    // Buttons and chips
    labelLarge = pyra(14, 20, FontWeight.SemiBold),
    // Small counters — "20 من 114"
    labelMedium = pyra(12, 18, FontWeight.SemiBold, tabularNums = true),
    labelSmall = pyra(11, 16, FontWeight.SemiBold),
)
