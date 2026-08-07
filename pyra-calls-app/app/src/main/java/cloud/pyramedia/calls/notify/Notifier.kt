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
import cloud.pyramedia.calls.ui.CallOutcomeActivity
import cloud.pyramedia.calls.ui.QuickAddActivity
import cloud.pyramedia.calls.ui.UpdateActivity

object Notifier {
    const val CHANNEL_UNMATCHED = "unmatched"
    const val CHANNEL_FEEDBACK = "feedback"

    // CA-C2 — a NEW channel id, not an in-place bump of "updates". Channel
    // *importance* is fixed at creation time on Android: once a channel id
    // exists on a device, re-creating it with a different importance is a
    // no-op — createNotificationChannel() silently ignores the new value.
    // v1.4 phones already have "updates" at IMPORTANCE_DEFAULT (no heads-up
    // popup), so raising it in place would do nothing for the exact fleet
    // this task exists for. A fresh id forces Android to actually create a
    // new HIGH channel; the old one is deleted below so upgrading phones
    // don't end up with two "Updates" entries in Settings, one live and one
    // orphaned.
    const val CHANNEL_UPDATES = "updates_v2"
    private const val LEGACY_CHANNEL_UPDATES = "updates"

    // Fixed id — a second update check before the user acts on the first
    // notification just updates the same notification in place instead of
    // stacking a duplicate.
    private const val UPDATE_NOTIFICATION_ID = 9001

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
        // Delete the old quiet channel FIRST — idempotent no-op on a fresh
        // install that never created it — so CHANNEL_UPDATES below is the
        // only "app updates" entry an upgrading phone ever shows.
        nm.deleteNotificationChannel(LEGACY_CHANNEL_UPDATES)
        nm.createNotificationChannel(NotificationChannel(
            CHANNEL_UPDATES, context.getString(R.string.notif_channel_updates),
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
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFFC2410C.toInt())
                .setContentTitle(context.getString(R.string.notif_unmatched_title))
                .setContentText(context.getString(R.string.notif_unmatched_body, phone))
                .setContentIntent(openForm)
                .addAction(R.drawable.ic_action_ignore, context.getString(R.string.notif_ignore_action), ignore)
                .setAutoCancel(true)
                .build())
    }

    // B-06: the feedback notification used to open the CRM lead page in the
    // browser, which drops the rep out of the app and asks them to log in to
    // the web. It now opens the same in-app outcome sheet the matched-call
    // notification uses — the action being asked for is identical.
    //
    // Notification-id aliasing (fix round 1, documented not fixed): this and
    // [showMatched] now post to the SAME notification id (`leadId.hashCode()`)
    // on the SAME channel, AND build a PendingIntent with the same request
    // code (`leadId.hashCode()`) wrapping an Intent that `filterEquals`
    // treats as identical to showMatched's (extras are ignored by that
    // comparison). They are therefore the same PendingIntent, and whichever
    // of the two calls runs last replaces the other's extras — in
    // particular showMatched's `follow_up_id`. Safe TODAY only because
    // showFeedback fires exclusively for a lead that was just quick-added,
    // so the ordering that would let it clobber a live follow_up_id set by a
    // prior showMatched call cannot occur. Before this task the two used
    // different ids and different intents; this aliasing is new. It becomes
    // unsafe the moment showFeedback can fire for a lead that also has a
    // pending showMatched notification (e.g. quick-add feedback arriving
    // after a matched-call notification for the same lead) — that would
    // silently drop follow_up_id and CallOutcomeActivity would lose its
    // "close this follow-up too" behavior.
    fun showFeedback(context: Context, leadName: String, leadId: String) {
        val open = PendingIntent.getActivity(
            context, leadId.hashCode(),
            Intent(context, CallOutcomeActivity::class.java)
                .putExtra("lead_id", leadId)
                .putExtra("lead_name", leadName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        notifySafe(context, leadId.hashCode(),
            NotificationCompat.Builder(context, CHANNEL_FEEDBACK)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFFC2410C.toInt())
                .setContentTitle(context.getString(R.string.notif_feedback_title))
                .setContentText(context.getString(R.string.notif_feedback_body, leadName))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build())
    }

    // A matched call is "here is something about a lead" — same shape as
    // showFeedback, so it reuses CHANNEL_FEEDBACK instead of a fourth channel.
    // Notification id is leadId.hashCode(): repeated calls to the same lead
    // replace the existing notification rather than stacking duplicates.
    //
    // W2-5: the content intent now opens CallOutcomeActivity (log
    // interested/not_interested/call_again right from the phone) instead of
    // the web deep link — the primary action is capturing the outcome, not
    // just viewing the lead. The web deep link survives as a secondary
    // action button for agents who still want the full CRM lead page.
    //
    // Notification-id aliasing (fix round 1, documented not fixed): see the
    // matching note on [showFeedback] above — the two share notification id,
    // channel and (via Intent.filterEquals ignoring extras) PendingIntent
    // identity, so a later showFeedback call for the SAME lead would replace
    // this notification's PendingIntent and drop `followUpId`. Currently
    // unreachable because showFeedback only fires for a just-quick-added
    // lead.
    fun showMatched(
        context: Context,
        leadName: String,
        leadId: String,
        // Wave C: when the matched lead has an open follow-up, carry its id
        // through so the outcome sheet can close it in the same save. This is
        // what makes the whole loop — call, notification, sheet, outcome +
        // stage + close — happen without the rep ever opening a list.
        followUpId: String? = null,
    ) {
        val openOutcome = PendingIntent.getActivity(
            context, leadId.hashCode(),
            Intent(context, CallOutcomeActivity::class.java)
                .putExtra("lead_id", leadId)
                .putExtra("lead_name", leadName)
                .putExtra("follow_up_id", followUpId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val openBrowser = PendingIntent.getActivity(
            context, leadId.hashCode() + 1,
            Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.BASE_URL + "/dashboard/crm/leads/" + leadId)),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        notifySafe(context, leadId.hashCode(),
            NotificationCompat.Builder(context, CHANNEL_FEEDBACK)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFFC2410C.toInt())
                .setContentTitle(context.getString(R.string.notif_matched_title, leadName))
                .setContentText(context.getString(R.string.notif_matched_body))
                .setContentIntent(openOutcome)
                .addAction(R.drawable.ic_action_open_web, context.getString(R.string.notif_matched_browser_action), openBrowser)
                .setAutoCancel(true)
                .build())
    }

    fun showUpdate(context: Context, versionName: String, isMandatory: Boolean = false) {
        val open = PendingIntent.getActivity(
            context, UPDATE_NOTIFICATION_ID,
            Intent(context, UpdateActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        notifySafe(context, UPDATE_NOTIFICATION_ID,
            NotificationCompat.Builder(context, CHANNEL_UPDATES)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFFC2410C.toInt())
                .setContentTitle(context.getString(R.string.notif_update_title))
                .setContentText(context.getString(R.string.notif_update_body, versionName))
                .setContentIntent(open)
                // A mandatory update's notification cannot be swiped away —
                // matches the blocking screen it backs (UpdateRequiredScreen)
                // having no dismiss affordance either.
                .setOngoing(isMandatory)
                .setAutoCancel(!isMandatory)
                .build())
    }

    fun cancel(context: Context, id: Int) = NotificationManagerCompat.from(context).cancel(id)

    private fun notifySafe(context: Context, id: Int, n: android.app.Notification) {
        try { NotificationManagerCompat.from(context).notify(id, n) }
        catch (_: SecurityException) { /* POST_NOTIFICATIONS revoked — sync continues silently */ }
    }
}
