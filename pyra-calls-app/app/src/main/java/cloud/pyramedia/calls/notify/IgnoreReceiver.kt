package cloud.pyramedia.calls.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.AppPrefs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class IgnoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val key = intent.getStringExtra("device_call_key") ?: return
        val pending = goAsync()
        val prefs = AppPrefs(context)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // 200 → ignored; 409 → already lead-linked; either way the prompt is obsolete
                api.ignore(key)
                Notifier.cancel(context, key.hashCode())
            } finally {
                pending.finish()
            }
        }
    }
}
