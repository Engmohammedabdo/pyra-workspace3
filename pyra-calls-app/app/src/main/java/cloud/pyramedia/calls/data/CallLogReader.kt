package cloud.pyramedia.calls.data

import android.content.Context
import android.provider.CallLog
import cloud.pyramedia.calls.core.CallEntry
import cloud.pyramedia.calls.core.CallMapping
import cloud.pyramedia.calls.core.DubaiTime

data class PendingCall(val callLogId: Long, val entry: CallEntry)
data class CallLogBatch(val calls: List<PendingCall>, val lastScannedId: Long)

object CallLogReader {
    fun readBatch(context: Context, prefs: AppPrefs, limit: Int = 100): CallLogBatch {
        val calls = mutableListOf<PendingCall>()
        var lastScannedId = prefs.lastSyncedCallLogId
        val projection = arrayOf(
            CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE,
            CallLog.Calls.DURATION, CallLog.Calls.DATE,
        )
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI, projection,
            "${CallLog.Calls._ID} > ? AND ${CallLog.Calls.DATE} >= ?",
            arrayOf(prefs.lastSyncedCallLogId.toString(), prefs.installDayStartMillis.toString()),
            "${CallLog.Calls._ID} ASC",
        )?.use { c ->
            val iId = c.getColumnIndexOrThrow(CallLog.Calls._ID)
            val iNum = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
            val iType = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
            val iDur = c.getColumnIndexOrThrow(CallLog.Calls.DURATION)
            val iDate = c.getColumnIndexOrThrow(CallLog.Calls.DATE)
            while (c.moveToNext() && calls.size < limit) {
                val id = c.getLong(iId)
                lastScannedId = maxOf(lastScannedId, id)
                val direction = CallMapping.directionFor(c.getInt(iType)) ?: continue
                val phone = c.getString(iNum).orEmpty()
                if (phone.isBlank()) continue // withheld/private number — nothing to match or count against a lead
                calls.add(PendingCall(id, CallEntry(
                    device_call_key = "${prefs.deviceId}:$id",
                    phone = phone,
                    direction = direction,
                    duration_seconds = c.getInt(iDur).coerceAtLeast(0),
                    called_at = DubaiTime.isoUtc(c.getLong(iDate)),
                )))
            }
        }
        return CallLogBatch(calls, lastScannedId)
    }
}
