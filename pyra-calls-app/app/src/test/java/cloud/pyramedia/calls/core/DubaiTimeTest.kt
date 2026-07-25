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

    // CallOutcomeActivity's "call again on…" presets: dayStartMillis(now) is
    // already proven Dubai-correct above (2026-07-10T22:30:00Z -> Dubai 'today'
    // = 2026-07-11); followUpPresetMillis adds N whole days then a fixed 10:00
    // Dubai hour on top, so the preset always lands inside business hours.
    @Test fun followUpPresetTomorrowIs10amDubaiNextDay() {
        val nowUtc = 1783722600000L // 2026-07-10T22:30:00Z == 2026-07-11T02:30 Dubai
        // tomorrow = 2026-07-12 -> 10:00+04:00 = 2026-07-12T06:00:00Z
        assertEquals(1783836000000L, DubaiTime.followUpPresetMillis(nowUtc, 1))
    }
    @Test fun followUpPresetInThreeDaysIs10amDubai() {
        val nowUtc = 1783722600000L
        // +3 days = 2026-07-14 -> 10:00+04:00 = 2026-07-14T06:00:00Z
        assertEquals(1784008800000L, DubaiTime.followUpPresetMillis(nowUtc, 3))
    }
    @Test fun followUpPresetNextWeekIs10amDubai() {
        val nowUtc = 1783722600000L
        // +7 days = 2026-07-18 -> 10:00+04:00 = 2026-07-18T06:00:00Z
        assertEquals(1784354400000L, DubaiTime.followUpPresetMillis(nowUtc, 7))
    }
}
