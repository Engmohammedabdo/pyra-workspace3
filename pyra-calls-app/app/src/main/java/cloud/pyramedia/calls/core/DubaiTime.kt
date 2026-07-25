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

    private const val ONE_DAY_MILLIS = 24 * 60 * 60 * 1000L
    private const val FOLLOW_UP_HOUR_MILLIS = 10 * 60 * 60 * 1000L // 10:00 Dubai time

    // Relative day presets for CallOutcomeActivity's "call again on…" field —
    // day-start (already Dubai-correct) + N whole days + a fixed 10:00 Dubai
    // hour, so every preset lands inside business hours without asking the
    // agent to also pick a time. Dubai has no DST, so plain millis arithmetic
    // across day boundaries is safe (same reasoning as dayStartMillis above).
    fun followUpPresetMillis(nowMillis: Long, daysFromNow: Int): Long =
        dayStartMillis(nowMillis) + daysFromNow * ONE_DAY_MILLIS + FOLLOW_UP_HOUR_MILLIS
}
