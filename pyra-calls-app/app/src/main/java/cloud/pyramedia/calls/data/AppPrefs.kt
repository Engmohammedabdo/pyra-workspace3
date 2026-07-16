package cloud.pyramedia.calls.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

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
 * `init` runs a one-time best-effort migration from the old encrypted store
 * (see [migrateFromEncrypted]) so upgrading devices don't lose their session.
 */
class AppPrefs(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("pyra_calls_prefs", Context.MODE_PRIVATE)

    init { migrateFromEncrypted(context) }

    /**
     * Runs once per install (gated by `migrated_from_encrypted`). Reads the
     * old `EncryptedSharedPreferences` store and copies over every key
     * AppPrefs exposed at the time this migration was written. If the old
     * store can't even be opened/read (the exact failure mode this migration
     * exists to escape), nothing is carried over — but the loss is flagged
     * via `pendingMigrationLossReport` so A2's ErrorQueue can report it once
     * that queue exists, instead of silently vanishing a second time.
     */
    private fun migrateFromEncrypted(context: Context) {
        if (prefs.getBoolean("migrated_from_encrypted", false)) return
        try {
            val old = EncryptedSharedPreferences.create(
                context, "pyra_calls_secure",
                MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
            val e = prefs.edit()
            old.getString("device_key", null)?.let { e.putString("device_key", it) }
            old.getString("username", null)?.let { e.putString("username", it) }
            old.getString("display_name", null)?.let { e.putString("display_name", it) }
            old.getString("device_id", null)?.let { e.putString("device_id", it) }
            old.getString("last_login_username", null)?.let { e.putString("last_login_username", it) }
            if (old.contains("last_synced_call_log_id")) {
                e.putLong("last_synced_call_log_id", old.getLong("last_synced_call_log_id", 0L))
            }
            if (old.contains("install_day_start_millis")) {
                e.putLong("install_day_start_millis", old.getLong("install_day_start_millis", 0L))
            }
            if (old.contains("last_sync_at_millis")) {
                e.putLong("last_sync_at_millis", old.getLong("last_sync_at_millis", 0L))
            }
            if (old.getString("device_key", null) != null) e.putBoolean("was_logged_in", true)
            e.putBoolean("migrated_from_encrypted", true).apply()
            // Isolated on purpose (A2 carryover fix): the copy above already
            // succeeded by this point. A throw from the delete call alone must
            // NOT fall into the outer catch below — that would overwrite the
            // just-written migrated data with pendingMigrationLossReport=true,
            // false-positiving a migration-loss report for a migration that
            // actually worked.
            try {
                context.deleteSharedPreferences("pyra_calls_secure")
            } catch (deleteFailure: Throwable) {
                // Old store copied fine; failing to delete it is harmless
                // (it just lingers, unread, until the OS reclaims it) — not
                // worth its own error report.
            }
        } catch (t: Throwable) {
            // Encrypted store unreadable — the exact failure mode we're
            // escaping. Nothing to carry over; mark done so we never retry,
            // and flag the loss so A2's ErrorQueue can report it once that
            // queue exists.
            prefs.edit()
                .putBoolean("migrated_from_encrypted", true)
                .putBoolean("pending_migration_loss_report", true)
                .apply()
        }
    }

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
     * abnormally (not via logout), which is the exact signature of the
     * EncryptedSharedPreferences keyset failure this migration exists to
     * escape. See [consumeSessionLossEvent].
     */
    var wasLoggedIn: Boolean
        get() = prefs.getBoolean("was_logged_in", false)
        set(v) = prefs.edit().putBoolean("was_logged_in", v).apply()

    /**
     * Best-effort flags for A2's (not-yet-built) ErrorQueue to pick up and
     * report on startup, then clear. `pendingMigrationLossReport` is set once,
     * at migration time, if the old encrypted store existed but could not be
     * read. `pendingSessionLossReport` is set by [consumeSessionLossEvent]
     * when an abnormal session loss is detected on a later launch.
     */
    var pendingMigrationLossReport: Boolean
        get() = prefs.getBoolean("pending_migration_loss_report", false)
        set(v) = prefs.edit().putBoolean("pending_migration_loss_report", v).apply()

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
            .apply()
    }
}
