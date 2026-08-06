package cloud.pyramedia.calls.core

/**
 * The single answer to "does this call-log row count as work?".
 *
 * Before this existed, `HomeScreen.countSince` counted every row in the call
 * log while `CallLogReader.readBatch` skipped unmapped types and withheld
 * numbers — so the number on Home could never match the CRM, for reasons that
 * had nothing to do with sync lag. Both now call in here.
 */
object CallLogFilter {

    /**
     * The row's server direction if it counts as work, else null.
     *
     * Callers that need the direction should use this rather than calling
     * [isSyncable] and then `CallMapping.directionFor` again — the second
     * lookup would be a branch that can never be taken.
     */
    fun directionIfSyncable(callLogType: Int, phone: String?): String? {
        if (phone.isNullOrBlank()) return null
        return CallMapping.directionFor(callLogType)
    }

    /** True iff the syncer would send this row to the server. */
    fun isSyncable(callLogType: Int, phone: String?): Boolean =
        directionIfSyncable(callLogType, phone) != null

    /**
     * True iff the call actually connected — the same predicate the server
     * uses in `lib/calls/match.ts::isConnectedCall()`:
     * `direction != 'missed' && duration_seconds > 0`.
     *
     * A 0-second outgoing call is a dial nobody answered. It is real and it is
     * counted, but it is not contact.
     */
    fun isConnected(callLogType: Int, durationSeconds: Int): Boolean {
        val direction = CallMapping.directionFor(callLogType) ?: return false
        return direction != "missed" && durationSeconds > 0
    }
}

/** Result of a local call-log tally. */
data class CallCounts(val total: Int, val connected: Int)
