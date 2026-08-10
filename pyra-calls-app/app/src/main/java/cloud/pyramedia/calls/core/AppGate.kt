package cloud.pyramedia.calls.core

/**
 * Which top-level screen the app shows. Pure so the ORDER is testable —
 * MainActivity's `when {}` reads it and does nothing else. Same idiom as
 * [UpdatePolicy] and [SessionHealth].
 *
 * The order encodes one principle, and B-15 is what happens when it is applied
 * to only half the cases it covers:
 *
 * > Never show a blocking screen to someone who cannot complete its action.
 *
 * CA-C2 already applied it to the logged-OUT case, which is why `blocked` sits
 * after `loggedIn`. But a revoked device key produces the same condition while
 * looking nothing like it: `AppPrefs.isLoggedIn()` is true (the key is still
 * stored, it is simply no longer accepted), so a phone that is both behind a
 * mandatory release and holding a dead key fell through to
 * [Screen.UPDATE_REQUIRED] — and got stuck there permanently, because BOTH
 * escape hatches sit behind the very key that is dead:
 *
 *  - `GET /api/mobile/app-version` (the 60s poll that lifts the block when the
 *    owner un-mandates a release) requires `requireDeviceAuth` → 401 forever,
 *    and UpdateRequiredScreen only ever writes to prefs on the SUCCESS branch,
 *    so the block can never clear.
 *  - `GET /api/mobile/app-download` requires it too → the one button on that
 *    screen cannot even fetch the APK.
 *
 * And the re-login affordance lives in Home's session-dead banner, which
 * `blocked` had already replaced. Net effect: uninstall or clear app data.
 * [Screen.SESSION_DEAD_BLOCKED] is that intersection, and its only action is
 * signing in again — which mints a fresh device key and makes the update path
 * work again.
 */
object AppGate {

    enum class Screen {
        PERMISSIONS,
        LOGIN,

        /**
         * Mandatory update AND a dead device key. Offers re-login ONLY — never
         * an "update now" button, which would 401 on the download.
         */
        SESSION_DEAD_BLOCKED,
        UPDATE_REQUIRED,
        HOME,
    }

    /**
     * @param sessionDead [SessionHealth] verdict persisted in AppPrefs — two
     *   consecutive 401/403s. Note this is NOT the same question as
     *   `!loggedIn`: the key is present, just no longer valid.
     * @param blocked [UpdatePolicy.shouldBlock] against the live pending-update
     *   state.
     */
    fun decide(
        granted: Boolean,
        loggedIn: Boolean,
        sessionDead: Boolean,
        blocked: Boolean,
    ): Screen = when {
        !granted -> Screen.PERMISSIONS
        !loggedIn -> Screen.LOGIN
        blocked && sessionDead -> Screen.SESSION_DEAD_BLOCKED
        blocked -> Screen.UPDATE_REQUIRED
        // A dead session on its own deliberately falls through to Home: its
        // banner explains the cause (usually "you signed in on another
        // handset") and offers re-login, and Home still shows the rep their
        // work. Replacing the whole screen there would be a downgrade.
        else -> Screen.HOME
    }
}
