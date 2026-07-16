package cloud.pyramedia.calls.core

import java.time.Instant

/**
 * Pure decision logic for [cloud.pyramedia.calls.data.ErrorQueue] — no file IO,
 * no Android APIs, unit-testable on the plain JVM.
 */
object ErrorQueueLogic {

    /**
     * Dedupe rule: a candidate is NOT enqueued if an existing event shares the
     * same `source` + `message` AND falls on the same Dubai calendar day
     * (reuses [DubaiTime] — never re-derive the +4h offset here).
     */
    fun shouldEnqueue(existing: List<ErrorEvent>, candidate: ErrorEvent): Boolean {
        // Unparseable candidate timestamp → fail open (always enqueue) rather
        // than risk suppressing a legitimate report over a bad clock read.
        val candidateDay = dubaiDayOrNull(candidate.occurred_at) ?: return true
        val isDuplicate = existing.any { e ->
            e.source == candidate.source &&
                e.message == candidate.message &&
                dubaiDayOrNull(e.occurred_at) == candidateDay
        }
        return !isDuplicate
    }

    /** Keeps the newest [max] entries (lines are stored oldest-first, append order). */
    fun cap(lines: List<String>, max: Int = 50): List<String> =
        if (lines.size <= max) lines else lines.takeLast(max)

    // Unparseable timestamps (should not happen — occurred_at is always
    // Instant.now().toString() at write time) fail safe: null never equals
    // another null-producing candidate purely by coincidence of a bad clock,
    // but more importantly this must never throw.
    private fun dubaiDayOrNull(occurredAtIso: String): Long? =
        runCatching { DubaiTime.dayStartMillis(Instant.parse(occurredAtIso).toEpochMilli()) }
            .getOrNull()
}
