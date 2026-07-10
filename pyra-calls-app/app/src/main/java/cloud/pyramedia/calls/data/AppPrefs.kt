package cloud.pyramedia.calls.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class AppPrefs(context: Context) {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context, "pyra_calls_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

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

    fun isLoggedIn(): Boolean = deviceKey != null

    fun clearSession() {
        prefs.edit()
            .remove("device_key").remove("username").remove("display_name")
            .remove("last_synced_call_log_id").remove("install_day_start_millis")
            .remove("last_sync_at_millis")
            .apply()
    }
}
