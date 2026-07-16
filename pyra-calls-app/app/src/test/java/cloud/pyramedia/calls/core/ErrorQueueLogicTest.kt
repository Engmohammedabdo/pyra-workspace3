package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ErrorQueueLogicTest {
    private fun event(source: String, message: String, occurredAt: String) = ErrorEvent(
        message = message,
        source = source,
        occurred_at = occurredAt,
        android_version = "android-14/sdk34",
        app_version_code = 2,
    )

    @Test fun dedupeSameSourceAndMessageSameDubaiDayReturnsFalse() {
        val existing = listOf(event("sync_failed", "HTTP 500: boom", "2026-07-10T09:00:00Z"))
        // Dubai local = 2026-07-10T19:00 — same Dubai calendar day as the existing row.
        val candidate = event("sync_failed", "HTTP 500: boom", "2026-07-10T15:00:00Z")
        assertFalse(ErrorQueueLogic.shouldEnqueue(existing, candidate))
    }

    @Test fun differentDubaiDayReturnsTrue() {
        val existing = listOf(event("sync_failed", "HTTP 500: boom", "2026-07-10T09:00:00Z"))
        val candidate = event("sync_failed", "HTTP 500: boom", "2026-07-11T09:00:00Z")
        assertTrue(ErrorQueueLogic.shouldEnqueue(existing, candidate))
    }

    @Test fun differentMessageSameDaySameSourceReturnsTrue() {
        val existing = listOf(event("sync_failed", "HTTP 500: boom", "2026-07-10T09:00:00Z"))
        val candidate = event("sync_failed", "HTTP 404: not found", "2026-07-10T15:00:00Z")
        assertTrue(ErrorQueueLogic.shouldEnqueue(existing, candidate))
    }

    @Test fun differentSourceSameDaySameMessageReturnsTrue() {
        val existing = listOf(event("sync_failed", "HTTP 500: boom", "2026-07-10T09:00:00Z"))
        val candidate = event("quick_add_failed", "HTTP 500: boom", "2026-07-10T15:00:00Z")
        assertTrue(ErrorQueueLogic.shouldEnqueue(existing, candidate))
    }

    @Test fun emptyExistingAlwaysEnqueues() {
        val candidate = event("crash", "boom", "2026-07-10T09:00:00Z")
        assertTrue(ErrorQueueLogic.shouldEnqueue(emptyList(), candidate))
    }

    @Test fun capKeepsNewest50WhenInputIs55() {
        val lines = (1..55).map { "line$it" }
        val capped = ErrorQueueLogic.cap(lines)
        assertEquals(50, capped.size)
        assertEquals("line6", capped.first())
        assertEquals("line55", capped.last())
    }

    @Test fun capIsNoOpWhenUnderLimit() {
        val lines = (1..10).map { "line$it" }
        assertEquals(lines, ErrorQueueLogic.cap(lines))
    }

    @Test fun capIsNoOpWhenExactlyAtLimit() {
        val lines = (1..50).map { "line$it" }
        assertEquals(lines, ErrorQueueLogic.cap(lines))
    }
}
