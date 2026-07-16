package cloud.pyramedia.calls.core

/**
 * Pure decision logic for the self-update flow — no Android/IO deps so it's
 * plain-JUnit testable. [SyncWorker] and Home's manual-check button are the
 * two callers.
 */
object UpdatePolicy {
    private const val CHECK_INTERVAL_MILLIS = 6 * 60 * 60 * 1000L // 6h
    private const val RENOTIFY_INTERVAL_MILLIS = 24 * 60 * 60 * 1000L // 24h

    /** Throttles the `/api/mobile/app-version` poll to at most once per 6h. */
    fun shouldCheck(nowMillis: Long, lastCheckMillis: Long): Boolean =
        nowMillis - lastCheckMillis >= CHECK_INTERVAL_MILLIS

    /**
     * True iff [latestCode] is newer than [currentCode] AND either (a) this
     * is a different version than the one last notified about, or (b) it's
     * been at least 24h since the last nag for the SAME version — so a
     * standing update doesn't go silent forever, but also doesn't spam every
     * sync cycle.
     */
    fun shouldNotify(
        latestCode: Int,
        currentCode: Int,
        lastNotifiedCode: Int,
        lastNotifiedAtMillis: Long,
        nowMillis: Long,
    ): Boolean {
        if (latestCode <= currentCode) return false
        if (latestCode != lastNotifiedCode) return true
        return nowMillis - lastNotifiedAtMillis >= RENOTIFY_INTERVAL_MILLIS
    }
}
