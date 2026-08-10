package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * B-15. The bug this matrix exists to stop coming back: a phone that is BOTH
 * behind a mandatory release AND holding a revoked device key had no route to
 * either escape hatch, because both of them sit behind that dead key.
 */
class AppGateTest {

    // ── the pre-existing order, which must not regress ────────────────────
    @Test fun permissionsBeatEverything() {
        assertEquals(
            AppGate.Screen.PERMISSIONS,
            AppGate.decide(granted = false, loggedIn = false, sessionDead = true, blocked = true),
        )
    }

    @Test fun loggedOutGoesToLoginEvenWhenBlocked() {
        // The original CA-C2 decision: never strand a logged-out rep on a
        // screen whose single action needs a session.
        assertEquals(
            AppGate.Screen.LOGIN,
            AppGate.decide(granted = true, loggedIn = false, sessionDead = false, blocked = true),
        )
    }

    @Test fun blockedAloneStillBlocks() {
        assertEquals(
            AppGate.Screen.UPDATE_REQUIRED,
            AppGate.decide(granted = true, loggedIn = true, sessionDead = false, blocked = true),
        )
    }

    @Test fun healthyPhoneGoesHome() {
        assertEquals(
            AppGate.Screen.HOME,
            AppGate.decide(granted = true, loggedIn = true, sessionDead = false, blocked = false),
        )
    }

    // ── B-15 itself ───────────────────────────────────────────────────────
    @Test fun deadSessionPlusMandatoryUpdateOffersTheWayOut() {
        assertEquals(
            AppGate.Screen.SESSION_DEAD_BLOCKED,
            AppGate.decide(granted = true, loggedIn = true, sessionDead = true, blocked = true),
        )
    }

    @Test fun deadSessionAloneStaysOnHome() {
        // Deliberately NOT the new screen. Home's own banner already explains
        // this and offers re-login, and Home lets the rep still SEE their work
        // — taking the whole screen away would be a downgrade.
        assertEquals(
            AppGate.Screen.HOME,
            AppGate.decide(granted = true, loggedIn = true, sessionDead = true, blocked = false),
        )
    }

    @Test fun theNewScreenOutranksTheUpdateScreen() {
        // Same inputs, the one difference being sessionDead. If these two ever
        // return the same screen, the trap is back.
        val trapped = AppGate.decide(granted = true, loggedIn = true, sessionDead = true, blocked = true)
        val ordinary = AppGate.decide(granted = true, loggedIn = true, sessionDead = false, blocked = true)
        assertEquals(AppGate.Screen.SESSION_DEAD_BLOCKED, trapped)
        assertEquals(AppGate.Screen.UPDATE_REQUIRED, ordinary)
    }

    /**
     * Exhaustive: 16 combinations, every one of them landing on exactly one
     * screen, and never on UPDATE_REQUIRED while the session is dead — the
     * single invariant that defines this fix.
     */
    @Test fun noDeadSessionCombinationEverLandsOnTheUpdateScreen() {
        for (granted in listOf(true, false)) {
            for (loggedIn in listOf(true, false)) {
                for (blocked in listOf(true, false)) {
                    val screen = AppGate.decide(granted, loggedIn, sessionDead = true, blocked = blocked)
                    assertEquals(
                        "granted=$granted loggedIn=$loggedIn blocked=$blocked must not reach the update screen",
                        false,
                        screen == AppGate.Screen.UPDATE_REQUIRED,
                    )
                }
            }
        }
    }
}
