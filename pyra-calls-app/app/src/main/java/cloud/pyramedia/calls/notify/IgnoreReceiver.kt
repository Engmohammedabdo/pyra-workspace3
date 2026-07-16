package cloud.pyramedia.calls.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.ErrorQueue
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
                val res = api.ignore(key)
                // Ok (200 → ignored) or Err (e.g. 409 → already lead-linked) both mean the
                // prompt is obsolete either way — dismiss it. On NetworkError, leave the
                // notification up so the agent can retry the tap once connectivity returns.
                if (res is ApiResult.Err) {
                    ErrorQueue(context).enqueue(
                        message = "HTTP ${res.code}: ${res.message}",
                        source = "ignore_failed",
                        severity = "warning",
                    )
                }
                if (res is ApiResult.Ok || res is ApiResult.Err) {
                    Notifier.cancel(context, key.hashCode())
                }
            } finally {
                pending.finish()
            }
        }
    }
}
