package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionHealthTest {
    private val fresh = SessionHealth.State(streak = 0, dead = false)

    @Test fun oneAuthFailureIsNotEnough() {
        val s = SessionHealth.next(fresh, ok = false, errorCode = 401)
        assertEquals(1, s.streak)
        assertFalse(s.dead)
    }

    @Test fun twoConsecutiveAuthFailuresKillTheSession() {
        var s = SessionHealth.next(fresh, ok = false, errorCode = 401)
        s = SessionHealth.next(s, ok = false, errorCode = 403)
        assertEquals(2, s.streak)
        assertTrue(s.dead)
    }

    @Test fun successBetweenTwoFailuresResetsTheStreak() {
        var s = SessionHealth.next(fresh, ok = false, errorCode = 401)
        s = SessionHealth.next(s, ok = true, errorCode = null)
        assertEquals(0, s.streak)
        s = SessionHealth.next(s, ok = false, errorCode = 401)
        assertFalse(s.dead)
    }

    @Test fun successRevivesADeadSession() {
        var s = SessionHealth.State(streak = 5, dead = true)
        s = SessionHealth.next(s, ok = true, errorCode = null)
        assertEquals(0, s.streak)
        assertFalse(s.dead)
    }

    // A network drop says nothing about the key — it must not accumulate
    // toward "your session is dead", and it must not clear a real streak
    // either.
    @Test fun networkErrorLeavesTheStateUntouched() {
        val s = SessionHealth.State(streak = 1, dead = false)
        assertEquals(s, SessionHealth.next(s, ok = false, errorCode = null))
    }

    @Test fun nonAuthHttpErrorLeavesTheStateUntouched() {
        val s = SessionHealth.State(streak = 1, dead = false)
        assertEquals(s, SessionHealth.next(s, ok = false, errorCode = 422))
        assertEquals(s, SessionHealth.next(s, ok = false, errorCode = 500))
    }

    @Test fun streakKeepsCountingPastTheThreshold() {
        var s = SessionHealth.State(streak = 2, dead = true)
        s = SessionHealth.next(s, ok = false, errorCode = 401)
        assertEquals(3, s.streak)
        assertTrue(s.dead)
    }
}
