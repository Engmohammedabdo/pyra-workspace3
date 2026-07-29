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

    // --- shouldNotify: mandatory releases re-nag every 1h, not 24h (CA-C2 Step 4) ---

    @Test fun shouldNotifyMandatoryFalseWhenSameCodeNotifiedThirtyMinutesAgo() {
        val now = 10 * day
        assertFalse(UpdatePolicy.shouldNotify(
            latestCode = 3, currentCode = 2,
            lastNotifiedCode = 3, lastNotifiedAtMillis = now - 30 * 60 * 1000L, nowMillis = now,
            isMandatory = true,
        ))
    }

    @Test fun shouldNotifyMandatoryTrueWhenSameCodeNotifiedNinetyMinutesAgo() {
        val now = 10 * day
        assertTrue(UpdatePolicy.shouldNotify(
            latestCode = 3, currentCode = 2,
            lastNotifiedCode = 3, lastNotifiedAtMillis = now - 90 * 60 * 1000L, nowMillis = now,
            isMandatory = true,
        ))
    }

    // Non-mandatory still uses the standing 24h interval even when isMandatory
    // is explicitly false — guards against the two constants getting swapped.
    @Test fun shouldNotifyNonMandatoryFalseWhenSameCodeNotifiedNinetyMinutesAgo() {
        val now = 10 * day
        assertFalse(UpdatePolicy.shouldNotify(
            latestCode = 3, currentCode = 2,
            lastNotifiedCode = 3, lastNotifiedAtMillis = now - 90 * 60 * 1000L, nowMillis = now,
            isMandatory = false,
        ))
    }

    // --- shouldBlock: mandatory AND strictly newer (CA-C2 Step 2) ---

    @Test fun shouldBlockFalseWhenNotMandatoryEvenIfNewer() {
        assertFalse(UpdatePolicy.shouldBlock(latestCode = 6, currentCode = 5, isMandatory = false))
    }

    @Test fun shouldBlockTrueWhenMandatoryAndNewer() {
        assertTrue(UpdatePolicy.shouldBlock(latestCode = 6, currentCode = 5, isMandatory = true))
    }

    @Test fun shouldBlockFalseWhenMandatoryButSameVersion() {
        assertFalse(UpdatePolicy.shouldBlock(latestCode = 5, currentCode = 5, isMandatory = true))
    }

    // Defensive — the server should never report a mandatory release OLDER
    // than what's installed, but a block decision must never fire on it.
    @Test fun shouldBlockFalseWhenMandatoryButLatestOlder() {
        assertFalse(UpdatePolicy.shouldBlock(latestCode = 4, currentCode = 5, isMandatory = true))
    }

    // --- shouldShowBanner: ANY strictly newer release, mandatory or not ---

    // Banner is independent of mandatory — the brief's "not-mandatory-newer
    // -> banner true" case.
    @Test fun shouldShowBannerTrueWhenNewerRegardlessOfMandatory() {
        assertTrue(UpdatePolicy.shouldShowBanner(latestCode = 6, currentCode = 5))
    }

    @Test fun shouldShowBannerFalseWhenSameVersion() {
        assertFalse(UpdatePolicy.shouldShowBanner(latestCode = 5, currentCode = 5))
    }

    @Test fun shouldShowBannerFalseWhenLatestOlder() {
        assertFalse(UpdatePolicy.shouldShowBanner(latestCode = 4, currentCode = 5))
    }
}
