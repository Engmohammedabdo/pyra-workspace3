package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Test

class DubaiTimeTest {
    // 2026-07-10T22:30:00Z == 2026-07-11T02:30 Dubai → Dubai day start = 2026-07-11T00:00+04 = 2026-07-10T20:00:00Z
    @Test fun dayStartCrossesUtcMidnightCorrectly() {
        val nowUtc = 1783722600000L // 2026-07-10T22:30:00Z
        assertEquals(1783713600000L, DubaiTime.dayStartMillis(nowUtc)) // 2026-07-10T20:00:00Z
    }
    @Test fun monthStartIsDubaiFirstOfMonth() {
        val nowUtc = 1783722600000L
        // 2026-07-01T00:00+04:00 = 2026-06-30T20:00:00Z
        assertEquals(1782849600000L, DubaiTime.monthStartMillis(nowUtc))
    }
    @Test fun isoUtcFormats() {
        assertEquals("2026-07-10T12:00:00Z", DubaiTime.isoUtc(1783684800000L))
    }
}
