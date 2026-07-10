package cloud.pyramedia.calls.core

import java.time.Instant
import java.time.ZoneOffset

object DubaiTime {
    private val DUBAI: ZoneOffset = ZoneOffset.ofHours(4) // no DST

    fun dayStartMillis(nowMillis: Long): Long =
        Instant.ofEpochMilli(nowMillis).atOffset(DUBAI).toLocalDate()
            .atStartOfDay().toInstant(DUBAI).toEpochMilli()

    fun monthStartMillis(nowMillis: Long): Long =
        Instant.ofEpochMilli(nowMillis).atOffset(DUBAI).toLocalDate()
            .withDayOfMonth(1).atStartOfDay().toInstant(DUBAI).toEpochMilli()

    fun isoUtc(millis: Long): String = Instant.ofEpochMilli(millis).toString()
}
