package cloud.pyramedia.calls.core

object CallMapping {
    /** CallLog.Calls.TYPE → server direction; null = skip (still consumes cursor). */
    fun directionFor(callLogType: Int): String? = when (callLogType) {
        1 -> "incoming"
        2 -> "outgoing"
        3, 5 -> "missed" // missed + rejected both count as missed
        else -> null
    }
}
