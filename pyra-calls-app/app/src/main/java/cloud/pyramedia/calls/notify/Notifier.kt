package cloud.pyramedia.calls.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.ui.QuickAddActivity

object Notifier {
    const val CHANNEL_UNMATCHED = "unmatched"
    const val CHANNEL_FEEDBACK = "feedback"

    fun ensureChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(
            CHANNEL_UNMATCHED, context.getString(R.string.notif_channel_unmatched),
            NotificationManager.IMPORTANCE_HIGH,
        ))
        nm.createNotificationChannel(NotificationChannel(
            CHANNEL_FEEDBACK, context.getString(R.string.notif_channel_feedback),
            NotificationManager.IMPORTANCE_HIGH,
        ))
    }

    fun showUnmatched(context: Context, phone: String, deviceCallKey: String) {
        val openForm = PendingIntent.getActivity(
            context, deviceCallKey.hashCode(),
            Intent(context, QuickAddActivity::class.java)
                .putExtra("phone", phone)
                .putExtra("device_call_key", deviceCallKey)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val ignore = PendingIntent.getBroadcast(
            context, deviceCallKey.hashCode() + 1,
            Intent(context, IgnoreReceiver::class.java)
                .putExtra("device_call_key", deviceCallKey),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        notifySafe(context, deviceCallKey.hashCode(),
            NotificationCompat.Builder(context, CHANNEL_UNMATCHED)
                .setSmallIcon(android.R.drawable.sym_call_missed)
                .setContentTitle(context.getString(R.string.notif_unmatched_title))
                .setContentText(context.getString(R.string.notif_unmatched_body, phone))
                .setContentIntent(openForm)
                .addAction(0, context.getString(R.string.notif_ignore_action), ignore)
                .setAutoCancel(true)
                .build())
    }

    fun showFeedback(context: Context, leadName: String, leadUrl: String) {
        val open = PendingIntent.getActivity(
            context, leadUrl.hashCode(),
            Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.BASE_URL + leadUrl)),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        notifySafe(context, leadUrl.hashCode(),
            NotificationCompat.Builder(context, CHANNEL_FEEDBACK)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(context.getString(R.string.notif_feedback_title))
                .setContentText(context.getString(R.string.notif_feedback_body, leadName))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build())
    }

    fun cancel(context: Context, id: Int) = NotificationManagerCompat.from(context).cancel(id)

    private fun notifySafe(context: Context, id: Int, n: android.app.Notification) {
        try { NotificationManagerCompat.from(context).notify(id, n) }
        catch (_: SecurityException) { /* POST_NOTIFICATIONS revoked — sync continues silently */ }
    }
}
