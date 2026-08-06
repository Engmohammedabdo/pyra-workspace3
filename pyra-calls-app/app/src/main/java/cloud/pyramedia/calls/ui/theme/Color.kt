package cloud.pyramedia.calls.ui.theme

import androidx.compose.ui.graphics.Color

// ── Brand ───────────────────────────────────────────────────────────────
// BrandFill is orange-700, NOT orange-500: white on #F97316 is 2.84:1 and
// fails every WCAG threshold. See core/ContrastTest.
val BrandFill = Color(0xFFC2410C)
val BrandTextLight = Color(0xFFC2410C)
val BrandTextDark = Color(0xFFFB923C)

/** orange-500. Strokes, borders, small non-text shapes ONLY. Never behind text. */
val BrandAccent = Color(0xFFF97316)

// ── Light ───────────────────────────────────────────────────────────────
val LightBackground = Color(0xFFFAFAF9)
val LightSurface = Color(0xFFFFFFFF)
val LightOnSurface = Color(0xFF1C1917)
val LightOnSurfaceVariant = Color(0xFF57534E)
val LightOutline = Color(0xFFE7E5E4)
val LightDanger = Color(0xFFDC2626)
val LightCool = Color(0xFF0E7490)
val LightNoticeContainer = Color(0xFFFFF7ED)
val LightOnNoticeContainer = Color(0xFF7C2D12)

// ── Dark ────────────────────────────────────────────────────────────────
val DarkBackground = Color(0xFF131211)
val DarkSurface = Color(0xFF201E1D)
val DarkOnSurface = Color(0xFFF5F3F0)
val DarkOnSurfaceVariant = Color(0xFFA8A29E)
val DarkOutline = Color(0xFF302D2B)
val DarkDanger = Color(0xFFFCA5A5)
val DarkCool = Color(0xFF67E8F9)
val DarkNoticeContainer = Color(0xFF2A2018)
val DarkOnNoticeContainer = Color(0xFFFED7AA)
