package cloud.pyramedia.calls.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Home counter and the syncer must agree on what counts as a work call.
 * They did not: the counter counted every call-log row, while the syncer
 * skipped unmapped types and withheld numbers (B-07). These tests are what
 * stops them drifting apart again.
 */
class CallLogFilterTest {

    @Test fun countsTheTypesTheSyncerSends() {
        assertTrue(CallLogFilter.isSyncable(1, "0501234567"))  // incoming
        assertTrue(CallLogFilter.isSyncable(2, "0501234567"))  // outgoing
        assertTrue(CallLogFilter.isSyncable(3, "0501234567"))  // missed
        assertTrue(CallLogFilter.isSyncable(5, "0501234567"))  // rejected
    }

    @Test fun skipsTheTypesTheSyncerDrops() {
        assertFalse(CallLogFilter.isSyncable(4, "0501234567"))  // voicemail
        assertFalse(CallLogFilter.isSyncable(6, "0501234567"))  // blocked
        assertFalse(CallLogFilter.isSyncable(7, "0501234567"))  // answered elsewhere
    }

    @Test fun skipsWithheldNumbers() {
        assertFalse(CallLogFilter.isSyncable(2, null))
        assertFalse(CallLogFilter.isSyncable(2, ""))
        assertFalse(CallLogFilter.isSyncable(2, "   "))
    }

    @Test fun connectedMatchesTheServerPredicate() {
        // Mirrors lib/calls/match.ts isConnectedCall():
        // direction != missed AND duration > 0
        assertTrue(CallLogFilter.isConnected(2, 45))
        assertTrue(CallLogFilter.isConnected(1, 1))
        assertFalse(CallLogFilter.isConnected(2, 0))   // dial nobody answered
        assertFalse(CallLogFilter.isConnected(3, 0))   // missed
        assertFalse(CallLogFilter.isConnected(3, 30))  // missed, any duration
        assertFalse(CallLogFilter.isConnected(5, 0))   // rejected
    }

    @Test fun unsyncableRowsAreNeverConnected() {
        assertFalse(CallLogFilter.isConnected(4, 60))
        assertFalse(CallLogFilter.isConnected(6, 60))
    }
}
