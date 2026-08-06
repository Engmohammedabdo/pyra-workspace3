package cloud.pyramedia.calls.core

import kotlin.math.pow

/** WCAG 2.1 relative luminance + contrast ratio. Colours are 0xRRGGBB ints. */
object Contrast {

    fun relativeLuminance(rgb: Int): Double {
        val r = channel(((rgb shr 16) and 0xFF) / 255.0)
        val g = channel(((rgb shr 8) and 0xFF) / 255.0)
        val b = channel((rgb and 0xFF) / 255.0)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    fun ratio(fg: Int, bg: Int): Double {
        val a = relativeLuminance(fg)
        val b = relativeLuminance(bg)
        val hi = maxOf(a, b)
        val lo = minOf(a, b)
        return (hi + 0.05) / (lo + 0.05)
    }

    private fun channel(c: Double): Double =
        if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
}
