package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SyncPlannerTest {
    private fun r(status: String) = SyncResult(device_call_key = "d:1", status = status)

    @Test fun advancesToBatchMax() {
        assertEquals(50L, SyncPlanner.nextCursor(10L, 50L, listOf(r("matched"), r("duplicate"))))
    }
    @Test fun neverGoesBackwards() {
        assertEquals(99L, SyncPlanner.nextCursor(99L, 50L, listOf(r("unmatched"))))
    }
    @Test fun freezesOnAnyError() {
        assertNull(SyncPlanner.nextCursor(10L, 50L, listOf(r("matched"), r("error"))))
    }
}
