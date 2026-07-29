package cloud.pyramedia.calls.core

/**
 * Pure decision logic for the self-update flow — no Android/IO deps so it's
 * plain-JUnit testable. [SyncWorker] and Home's manual-check button are the
 * two callers.
 */
object UpdatePolicy {
    // Kept `internal` (not private) so UpdatePolicyTest can compare it
    // directly against BLOCKED_POLL_INTERVAL_MILLIS below (CA-C3) — a plain
    // JUnit assertion that fails loudly if anyone ever "tidies" the two
    // constants into one value.
    internal const val CHECK_INTERVAL_MILLIS = 6 * 60 * 60 * 1000L // 6h
    private const val RENOTIFY_INTERVAL_MILLIS = 24 * 60 * 60 * 1000L // 24h

    // CA-C2 Step 4 — a mandatory release re-nags much sooner than a normal
    // one. Kept as a constant here (not inline in SyncWorker) so the choice
    // stays plain-JUnit testable alongside RENOTIFY_INTERVAL_MILLIS.
    private const val MANDATORY_RENOTIFY_INTERVAL_MILLIS = 60 * 60 * 1000L // 1h

    // CA-C3 — the safety valve for a mistaken mandatory release
    // (`pnpm app:publish --set-mandatory <code> false`) is only as fast as
    // whatever re-reads the server. CHECK_INTERVAL_MILLIS above throttles
    // SyncWorker's normal poll to once per 6h, which would leave a blocked
    // rep stuck for up to ~6h even after the owner fixes the release.
    // UpdateRequiredScreen uses THIS separate, much shorter interval for its
    // own direct server poll while — and only while — it is actually
    // blocking the screen. It must stay a distinct constant (never merged
    // with CHECK_INTERVAL_MILLIS) so the normal, non-blocked poll cadence is
    // completely untouched.
    internal const val BLOCKED_POLL_INTERVAL_MILLIS = 60 * 1000L // 60s

    /** Throttles the `/api/mobile/app-version` poll to at most once per 6h. */
    fun shouldCheck(nowMillis: Long, lastCheckMillis: Long): Boolean =
        nowMillis - lastCheckMillis >= CHECK_INTERVAL_MILLIS

    /**
     * True iff [latestCode] is newer than [currentCode] AND either (a) this
     * is a different version than the one last notified about, or (b) it's
     * been at least [RENOTIFY_INTERVAL_MILLIS] (24h, or
     * [MANDATORY_RENOTIFY_INTERVAL_MILLIS] — 1h — when [isMandatory]) since
     * the last nag for the SAME version — so a standing update doesn't go
     * silent forever, but also doesn't spam every sync cycle. Defaults
     * [isMandatory] false so every pre-CA-C2 call site keeps its exact prior
     * behavior.
     */
    fun shouldNotify(
        latestCode: Int,
        currentCode: Int,
        lastNotifiedCode: Int,
        lastNotifiedAtMillis: Long,
        nowMillis: Long,
        isMandatory: Boolean = false,
    ): Boolean {
        if (latestCode <= currentCode) return false
        if (latestCode != lastNotifiedCode) return true
        val interval = if (isMandatory) MANDATORY_RENOTIFY_INTERVAL_MILLIS else RENOTIFY_INTERVAL_MILLIS
        return nowMillis - lastNotifiedAtMillis >= interval
    }

    /**
     * True iff the owner marked this release mandatory AND it's strictly
     * newer than the installed app — drives MainActivity's full-screen
     * [cloud.pyramedia.calls.ui.UpdateRequiredScreen]. A non-mandatory newer
     * release never blocks, only bannered (see [shouldShowBanner]).
     */
    fun shouldBlock(latestCode: Int, currentCode: Int, isMandatory: Boolean): Boolean =
        isMandatory && latestCode > currentCode

    /**
     * True iff ANY release — mandatory or not — is strictly newer than the
     * installed app. Drives Home's persistent, non-dismissable banner.
     */
    fun shouldShowBanner(latestCode: Int, currentCode: Int): Boolean =
        latestCode > currentCode
}
