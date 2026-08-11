package cloud.pyramedia.calls.data

import android.content.Context
import android.content.SharedPreferences
import cloud.pyramedia.calls.core.SessionHealth

/**
 * Plain (unencrypted) app-sandboxed SharedPreferences.
 *
 * Previously backed by EncryptedSharedPreferences (deprecated by Google,
 * `1.1.0-alpha06`) — the prime suspect for field-reported random logouts:
 * when its Keystore-backed keyset degrades, reads silently return null,
 * which looks exactly like "the session disappeared." The device-key risk
 * profile tolerates plain storage: the key is scoped (`calls:device`),
 * server-revocable, and the phone is company property — not worth trading
 * reliability for at-rest encryption of a revocable token.
 *
 * The one-time migration off that old encrypted store was removed in T-01 once
 * the fleet had cycled past it: it shipped 2026-07-16 and every live device has
 * been running builds newer than that since 2026-08-07 (verified via
 * `pyra_api_keys.app_version_code`), so the code could only ever run again on a
 * handset that had somehow skipped four months of releases. The orphaned
 * `migrated_from_encrypted` / `pending_migration_loss_report` keys are left in
 * the store — harmless, and cheaper than a migration to delete them.
 */
class AppPrefs(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("pyra_calls_prefs", Context.MODE_PRIVATE)

    var deviceKey: String?
        get() = prefs.getString("device_key", null)
        set(v) = prefs.edit().putString("device_key", v).apply()

    var username: String?
        get() = prefs.getString("username", null)
        set(v) = prefs.edit().putString("username", v).apply()

    var displayName: String?
        get() = prefs.getString("display_name", null)
        set(v) = prefs.edit().putString("display_name", v).apply()

    /** Stable app-generated device id — matches ^[a-zA-Z0-9._-]{4,64}$. */
    val deviceId: String
        get() = prefs.getString("device_id", null) ?: buildString {
            val chars = "abcdefghijklmnopqrstuvwxyz0123456789"
            repeat(16) { append(chars.random()) }
        }.also { prefs.edit().putString("device_id", it).apply() }

    var lastSyncedCallLogId: Long
        get() = prefs.getLong("last_synced_call_log_id", 0L)
        set(v) = prefs.edit().putLong("last_synced_call_log_id", v).apply()

    var installDayStartMillis: Long
        get() = prefs.getLong("install_day_start_millis", 0L)
        set(v) = prefs.edit().putLong("install_day_start_millis", v).apply()

    var lastSyncAtMillis: Long
        get() = prefs.getLong("last_sync_at_millis", 0L)
        set(v) = prefs.edit().putLong("last_sync_at_millis", v).apply()

    /**
     * Last agent username to log in on this device — survives clearSession()
     * intentionally (agent-handover guard: MainActivity compares this against
     * the newly-logged-in username to detect a phone changing hands).
     */
    var lastLoginUsername: String?
        get() = prefs.getString("last_login_username", null)
        set(v) = prefs.edit().putString("last_login_username", v).apply()

    /**
     * Set true on successful login, false on EXPLICIT logout (by the logout
     * callback, before `clearSession()`). Survives `clearSession()`
     * intentionally — it's the tripwire: if a future launch finds
     * `isLoggedIn() == false` while this is still true, the session was lost
     * abnormally (not via logout) — the exact signature of the
     * EncryptedSharedPreferences keyset failure that moving off that store was
     * meant to escape. The tripwire outlives the migration (T-01) on purpose:
     * it detects a session vanishing for ANY reason, which is still worth
     * knowing. See [consumeSessionLossEvent].
     */
    var wasLoggedIn: Boolean
        get() = prefs.getBoolean("was_logged_in", false)
        set(v) = prefs.edit().putBoolean("was_logged_in", v).apply()

    /**
     * Best-effort flag for ErrorQueue to pick up and report on startup, then
     * clear. Set by [consumeSessionLossEvent] when an abnormal session loss is
     * detected on a later launch.
     *
     * `pendingMigrationLossReport` used to live beside it; T-01 removed both it
     * and the migration that was its only writer.
     */
    var pendingSessionLossReport: Boolean
        get() = prefs.getBoolean("pending_session_loss_report", false)
        set(v) = prefs.edit().putBoolean("pending_session_loss_report", v).apply()

    // --- Update-check bookkeeping (consumed by a later task) ---

    var lastUpdateCheckAtMillis: Long
        get() = prefs.getLong("last_update_check_at_millis", 0L)
        set(v) = prefs.edit().putLong("last_update_check_at_millis", v).apply()

    var lastUpdateNotifiedCode: Int
        get() = prefs.getInt("last_update_notified_code", 0)
        set(v) = prefs.edit().putInt("last_update_notified_code", v).apply()

    var lastUpdateNotifiedAtMillis: Long
        get() = prefs.getLong("last_update_notified_at_millis", 0L)
        set(v) = prefs.edit().putLong("last_update_notified_at_millis", v).apply()

    // --- Pending-update cache (CA-C2) ---
    //
    // What the last SyncWorker version poll found, so HomeScreen's banner
    // and MainActivity's blocking screen can react on the very next
    // recomposition/launch without re-polling. SyncWorker is the only
    // writer: it caches here whenever `/api/mobile/app-version` reports
    // something strictly newer, and clears it back to "none" the moment the
    // server no longer does (release pulled/rolled back) — see SyncWorker's
    // update-check block. [clearPendingUpdateIfInstalled] covers the OTHER
    // direction: the device catching up by actually installing.
    //
    // CA-C2 fix round 1: do NOT read these three fields directly from a
    // Composable. A raw SharedPreferences read is not Compose `State`, so a
    // value corrected here mid-process (owner un-mandates/rolls back a
    // release) is invisible to an already-rendered composition — this once
    // froze MainActivity's mandatory block for the life of the process. Read
    // via `rememberPendingUpdate(prefs)` in ui/PermissionsScreen.kt instead,
    // which mirrors these into real Compose State and refreshes on ON_RESUME
    // (plus a 60s poll of its own from UpdateRequiredScreen).

    /** 0 = no pending update. */
    var pendingUpdateVersionCode: Int
        get() = prefs.getInt("pending_update_version_code", 0)
        set(v) = prefs.edit().putInt("pending_update_version_code", v).apply()

    var pendingUpdateVersionName: String?
        get() = prefs.getString("pending_update_version_name", null)
        set(v) = prefs.edit().putString("pending_update_version_name", v).apply()

    var pendingUpdateMandatory: Boolean
        get() = prefs.getBoolean("pending_update_mandatory", false)
        set(v) = prefs.edit().putBoolean("pending_update_mandatory", v).apply()

    // --- Session health (wave C) ---
    //
    // Written by SyncWorker AND HomeScreen's own api.myDay() call (fix round
    // 1 — Home's authenticated GET is the fast signal; SyncWorker's periodic
    // run is only a fallback that can be hours away under doze), both via
    // [recordAuthOutcome]. Same Compose caveat as the pending-update cache
    // above: read it through `rememberSessionDead(prefs)` in
    // ui/PermissionsScreen.kt, never directly from a Composable — a raw
    // SharedPreferences read is not Compose State.
    //
    // Read-only here (fix round 1, Fix 3): the pair used to be two
    // independent `var`s, each with its own `edit().apply()` setter, so a
    // caller writing both (SyncWorker's old noteAuthOutcome) committed them
    // as two separate, in-principle-divergeable writes — and cost two
    // separate UseKtx lint sites for it. Every write now goes through
    // [setSessionHealth]'s single batched `edit()`; the getters stay because
    // the read side (recordAuthOutcome, rememberSessionDead) still needs them.

    val authFailureStreak: Int
        get() = prefs.getInt("auth_failure_streak", 0)

    val sessionDead: Boolean
        get() = prefs.getBoolean("session_dead", false)

    /**
     * One atomic write for the pair above. [authFailureStreak] and
     * [sessionDead] are one logical value — writing them as two separate
     * `edit().apply()` commits (the pre-fix-round-1 shape) let them, in
     * principle, disagree. Single-process today so nothing has observed the
     * split, but there is no reason to keep it.
     */
    fun setSessionHealth(state: SessionHealth.State) = synchronized(SESSION_HEALTH_LOCK) {
        prefs.edit()
            .putInt("auth_failure_streak", state.streak)
            .putBoolean("session_dead", state.dead)
            .apply()
    }

    /**
     * The one "record an auth outcome" step, shared by SyncWorker and
     * HomeScreen so neither hand-rolls its own
     * `SessionHealth.State(prefs.authFailureStreak, prefs.sessionDead)`
     * read-modify-write. Runs [SessionHealth.next] against the currently
     * stored pair and writes the result back atomically via
     * [setSessionHealth].
     */
    fun recordAuthOutcome(ok: Boolean, errorCode: Int?) = synchronized(SESSION_HEALTH_LOCK) {
        setSessionHealth(SessionHealth.next(SessionHealth.State(authFailureStreak, sessionDead), ok, errorCode))
    }

    /**
     * Call once per launch (MainActivity.onCreate, before reading the fields
     * above for the banner/blocking-screen decision) so they clear
     * themselves the moment the installed app catches up to the cached
     * version — the banner/block then disappears with no extra poll needed,
     * exactly as if nothing had ever been pending.
     */
    fun clearPendingUpdateIfInstalled(currentVersionCode: Int) {
        if (pendingUpdateVersionCode in 1..currentVersionCode) {
            pendingUpdateVersionCode = 0
            pendingUpdateVersionName = null
            pendingUpdateMandatory = false
        }
    }

    fun isLoggedIn(): Boolean = deviceKey != null

    /**
     * One-shot tripwire check — call once per app launch, before deciding
     * whether to show the login or home screen. True iff the device was
     * logged in on some prior run (`wasLoggedIn`) but is NOT logged in now —
     * i.e. the session disappeared without an explicit logout. Resets
     * `wasLoggedIn` so this fires at most once per loss, and sets
     * `pendingSessionLossReport` for A2's ErrorQueue to pick up.
     */
    fun consumeSessionLossEvent(): Boolean {
        val lost = wasLoggedIn && !isLoggedIn()
        if (lost) {
            wasLoggedIn = false
            pendingSessionLossReport = true
        }
        return lost
    }

    fun clearSession() {
        prefs.edit()
            .remove("device_key").remove("username").remove("display_name")
            .remove("last_synced_call_log_id").remove("install_day_start_millis")
            .remove("last_sync_at_millis")
            // A logged-out device has no session to be dead — leaving these
            // set would greet the next login with a stale red banner.
            .remove("auth_failure_streak").remove("session_dead")
            .apply()
    }

    companion object {
        /**
         * T-05 — the monitor guarding the [recordAuthOutcome] read-modify-write.
         *
         * It MUST be process-wide, not per-instance. `AppPrefs` is constructed
         * at seven separate call sites (SyncWorker, MainActivity,
         * UpdateActivity, CallOutcomeActivity, QuickAddActivity, IgnoreReceiver,
         * PyraCallsApp), so `@Synchronized` or `synchronized(this)` would lock
         * seven different objects while they all wrote the same
         * SharedPreferences file — a lock that reads as protection and provides
         * none. They share one file, so they share one monitor.
         *
         * The race it closes: three live writers now record auth outcomes —
         * SyncWorker on a WorkManager thread, HomeScreen after its own myDay()
         * call, and UpdateRequiredScreen's 60s poll (added with B-15). Two
         * failures interleaving could both read streak=1, both compute 2, and
         * both write 2, losing an increment and delaying the "session dead"
         * verdict. Never torn — [setSessionHealth] was already one atomic
         * `edit()` — just slower to reach the truth, which for a banner whose
         * whole job is telling a rep their phone stopped syncing is worth
         * closing.
         */
        private val SESSION_HEALTH_LOCK = Any()
    }
}
