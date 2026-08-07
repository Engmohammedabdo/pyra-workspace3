package cloud.pyramedia.calls.core

/**
 * Consecutive-auth-failure tracker behind the "your session is dead" banner.
 *
 * TWO consecutive failures, not one: a single 401/403 can be a transient
 * server-side blip, and a banner that cries wolf gets ignored the day it is
 * right.
 *
 * The commonest cause of this state is NOT deactivation — it is the rep having
 * logged in on a different handset. The one-active-device rule revokes the old
 * key, so the old phone looks perfectly healthy and silently stops syncing.
 */
object SessionHealth {
    const val DEAD_AFTER_CONSECUTIVE_AUTH_FAILURES = 2

    data class State(val streak: Int, val dead: Boolean)

    /**
     * @param ok whether the call succeeded
     * @param errorCode HTTP status when it failed, or null for a network error
     *
     * A network error and a non-auth HTTP error both return [current]
     * unchanged: neither says anything about whether the device key is still
     * valid, so neither may accumulate toward "dead" nor clear a real streak.
     */
    fun next(current: State, ok: Boolean, errorCode: Int?): State {
        if (ok) return State(streak = 0, dead = false)
        if (errorCode != 401 && errorCode != 403) return current
        val streak = current.streak + 1
        return State(streak = streak, dead = streak >= DEAD_AFTER_CONSECUTIVE_AUTH_FAILURES)
    }
}
