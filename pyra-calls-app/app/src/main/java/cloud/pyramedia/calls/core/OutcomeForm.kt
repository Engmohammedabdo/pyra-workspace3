package cloud.pyramedia.calls.core

/**
 * Form rules for the post-call outcome sheet, kept pure so they can be tested
 * without Compose. The server enforces the same rules — this exists so the rep
 * finds out before the round trip, not after.
 */
object OutcomeForm {
    const val OUTCOME_NOT_INTERESTED = "not_interested"

    /**
     * Matches the web's `MIN_LOST_REASON` (components/crm/pipeline/
     * move-stage-confirm-modal.tsx) and the server's
     * `MIN_NOT_INTERESTED_REASON`. Three places, one number — if it ever
     * changes, OutcomeFormTest's `minimumMatchesTheWebsLostReasonFloor` is
     * what notices.
     */
    const val MIN_REASON_LENGTH = 5

    fun requiresReason(outcome: String?): Boolean = outcome == OUTCOME_NOT_INTERESTED

    /**
     * Scheduling another call for someone the rep just marked "not interested"
     * is a contradiction — and an easy accident: pick a date, then change the
     * outcome, and the date is still selected. The sheet hides the presets and
     * [effectiveFollowUpDays] drops any stale selection on the way out, so the
     * invariant holds even if the UI ever forgets to clear it.
     */
    fun allowsFollowUp(outcome: String?): Boolean = outcome != OUTCOME_NOT_INTERESTED

    /**
     * Wave د+ #01 — a connected call must leave a scheduled next step.
     *
     * Measured 2026-08-12: of 998 connected calls in 30 days, 477 moved a stage
     * and 511 wrote a note, but only 123 (12%) scheduled a follow-up. The
     * customer then leaves the radar entirely, which is why 1,141 of 1,258 live
     * leads sit in one stage.
     *
     * Two deliberate `true`s, both matching [reasonSatisfied]'s reasoning:
     *  - `not_interested` IS the decision, so it needs no date.
     *  - A null outcome keeps the sheet's own «اختر نتيجة المكالمة» error, which
     *    tells the rep what to do — a Save button that is merely dead does not.
     */
    fun nextStepSatisfied(outcome: String?, presetDays: Int?): Boolean {
        if (outcome == null) return true
        if (!allowsFollowUp(outcome)) return true
        return presetDays != null
    }

    /**
     * True when the reason requirement is met, or does not apply.
     *
     * Returns true for a null [outcome] ON PURPOSE: an unpicked outcome keeps
     * the sheet's existing inline «اختر نتيجة المكالمة» error, which tells the
     * rep what to do. A Save button that is simply dead does not.
     */
    fun reasonSatisfied(outcome: String?, reason: String): Boolean {
        if (!requiresReason(outcome)) return true
        return reason.trim().length >= MIN_REASON_LENGTH
    }

    fun effectiveFollowUpDays(outcome: String?, presetDays: Int?): Int? =
        if (allowsFollowUp(outcome)) presetDays else null

    /** Which side-effect warnings a saved outcome came back with, in display order. */
    enum class OutcomeWarning { STAGE, CLOSE, FOLLOW_UP }

    /**
     * The warnings to show for a SAVED outcome, in display order.
     *
     * All three flags mean the same thing: the outcome itself was recorded, but a
     * side effect did not land. None is a failure — the caller shows them as a
     * message on a success, never as an error. Empty list = clean save.
     *
     * Returns ALL applicable warnings, not the first: two side effects can fail
     * independently, and telling the rep about only one lets them reasonably
     * conclude the other worked.
     */
    fun outcomeWarnings(
        stageError: Boolean,
        completeError: Boolean,
        followUpError: Boolean,
    ): List<OutcomeWarning> = buildList {
        if (stageError) add(OutcomeWarning.STAGE)
        if (completeError) add(OutcomeWarning.CLOSE)
        if (followUpError) add(OutcomeWarning.FOLLOW_UP)
    }
}
