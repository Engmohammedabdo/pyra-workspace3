package cloud.pyramedia.calls.core

/**
 * Wave د+ #08 — the app's copy of the attempt-cadence owner decision.
 *
 * Mirrors `MAX_ATTEMPTS` in `lib/calls/attempt-cadence.ts` (the server's copy,
 * where the "4 attempts over 10 days" reasoning is recorded in full). The two
 * copies cannot share a single source across a Kotlin/TypeScript boundary, so
 * this file exists to be the ONE place on the app side that holds the number —
 * every row-chip call site references [MAX_ATTEMPTS] instead of inlining `4`.
 *
 * If the owner ever revisits the cadence, both copies must move together.
 */
object AttemptPolicy {
    const val MAX_ATTEMPTS = 4
}
