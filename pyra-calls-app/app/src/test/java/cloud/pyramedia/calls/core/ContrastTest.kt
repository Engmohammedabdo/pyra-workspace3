package cloud.pyramedia.calls.core

import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * WCAG AA guard rails for the Pyra palette. These are not decorative — the
 * rep reads this screen outdoors in Dubai. The "must fail" test below is
 * deliberate: it stops #F97316 from ever becoming a text background again.
 */
class ContrastTest {
    private val AA = 4.5

    @Test fun whiteOnBrandFillPassesAA() {
        assertTrue(Contrast.ratio(0xFFFFFF, 0xC2410C) >= AA)
    }

    @Test fun whiteOnRawBrandOrangeFailsAA() {
        // #F97316 with white is 2.84:1. If this ever passes, someone widened
        // the palette in the wrong direction.
        assertTrue(Contrast.ratio(0xFFFFFF, 0xF97316) < AA)
    }

    @Test fun brandTextOnDarkSurfacePassesAA() {
        assertTrue(Contrast.ratio(0xFB923C, 0x131211) >= AA)
    }

    @Test fun bodyTextPassesAAOnBothThemes() {
        assertTrue(Contrast.ratio(0x1C1917, 0xFAFAF9) >= AA)
        assertTrue(Contrast.ratio(0xF5F3F0, 0x131211) >= AA)
    }

    @Test fun secondaryTextPassesAAOnBothThemes() {
        assertTrue(Contrast.ratio(0x57534E, 0xFFFFFF) >= AA)
        assertTrue(Contrast.ratio(0xA8A29E, 0x201E1D) >= AA)
    }

    @Test fun noticeCardTextPassesAAOnBothThemes() {
        assertTrue(Contrast.ratio(0x7C2D12, 0xFFF7ED) >= AA)
        assertTrue(Contrast.ratio(0xFED7AA, 0x2A2018) >= AA)
    }
}
