package cloud.pyramedia.calls.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Wave د+ #01. 88% of connected calls ended with nothing scheduled (123
 * follow-ups from 998 connected calls, measured 2026-08-12) — this rule is what
 * changes that, so it is pinned here rather than left in a Composable.
 */
class NextStepFormTest {

    @Test
    fun `interested without a next step is not satisfied`() {
        assertFalse(OutcomeForm.nextStepSatisfied("interested", null))
    }

    @Test
    fun `interested with a next step is satisfied`() {
        assertTrue(OutcomeForm.nextStepSatisfied("interested", 3))
    }

    @Test
    fun `call again without a next step is not satisfied`() {
        assertFalse(OutcomeForm.nextStepSatisfied("call_again", null))
    }

    @Test
    fun `not interested IS the next step, so no date is needed`() {
        // Scheduling a call for someone just marked not-interested is a
        // contradiction — allowsFollowUp already hides the presets.
        assertTrue(OutcomeForm.nextStepSatisfied("not_interested", null))
    }

    @Test
    fun `an unpicked outcome stays satisfied so the existing error owns the message`() {
        // Same reasoning as reasonSatisfied: a dead Save button explains nothing,
        // the inline «اختر نتيجة المكالمة» error does.
        assertTrue(OutcomeForm.nextStepSatisfied(null, null))
    }

    @Test
    fun `a stale date on not interested is ignored, never treated as a plan`() {
        assertTrue(OutcomeForm.nextStepSatisfied("not_interested", 7))
        // and it never leaves the sheet:
        assertTrue(OutcomeForm.effectiveFollowUpDays("not_interested", 7) == null)
    }
}
