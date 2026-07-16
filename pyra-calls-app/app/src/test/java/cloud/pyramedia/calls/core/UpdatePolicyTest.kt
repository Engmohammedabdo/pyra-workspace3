package cloud.pyramedia.calls.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdatePolicyTest {
    private val hour = 60 * 60 * 1000L
    private val day = 24 * hour

    // --- shouldCheck: throttle the version poll to once per 6h ---

    @Test fun shouldCheckFalseBeforeSixHours() {
        val now = 10 * day
        val lastCheck = now - (6 * hour - 1)
        assertFalse(UpdatePolicy.shouldCheck(now, lastCheck))
    }

    @Test fun shouldCheckTrueAtOrAfterSixHours() {
        val now = 10 * day
        val lastCheck = now - 6 * hour
        assertTrue(UpdatePolicy.shouldCheck(now, lastCheck))
    }

    // --- shouldNotify: newer AND (new code OR >=24h since last nag) ---

    @Test fun shouldNotifyFalseWhenLatestNotNewerThanCurrent() {
        assertFalse(UpdatePolicy.shouldNotify(
            latestCode = 2, currentCode = 2,
            lastNotifiedCode = 0, lastNotifiedAtMillis = 0L, nowMillis = 10 * day,
        ))
    }

    @Test fun shouldNotifyFalseWhenLatestOlderThanCurrent() {
        assertFalse(UpdatePolicy.shouldNotify(
            latestCode = 1, currentCode = 2,
            lastNotifiedCode = 0, lastNotifiedAtMillis = 0L, nowMillis = 10 * day,
        ))
    }

    @Test fun shouldNotifyTrueWhenNewerAndNeverNotified() {
        assertTrue(UpdatePolicy.shouldNotify(
            latestCode = 3, currentCode = 2,
            lastNotifiedCode = 0, lastNotifiedAtMillis = 0L, nowMillis = 10 * day,
        ))
    }

    @Test fun shouldNotifyFalseWhenSameCodeNotifiedTwoHoursAgo() {
        val now = 10 * day
        assertFalse(UpdatePolicy.shouldNotify(
            latestCode = 3, currentCode = 2,
            lastNotifiedCode = 3, lastNotifiedAtMillis = now - 2 * hour, nowMillis = now,
        ))
    }

    @Test fun shouldNotifyTrueWhenSameCodeNotified25HoursAgo() {
        val now = 10 * day
        assertTrue(UpdatePolicy.shouldNotify(
            latestCode = 3, currentCode = 2,
            lastNotifiedCode = 3, lastNotifiedAtMillis = now - 25 * hour, nowMillis = now,
        ))
    }

    @Test fun shouldNotifyTrueWhenDifferentCodeNotifiedOneMinuteAgo() {
        val now = 10 * day
        assertTrue(UpdatePolicy.shouldNotify(
            latestCode = 4, currentCode = 2,
            lastNotifiedCode = 3, lastNotifiedAtMillis = now - 60_000L, nowMillis = now,
        ))
    }
}
