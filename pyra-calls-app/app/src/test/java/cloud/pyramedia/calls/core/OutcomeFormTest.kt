package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OutcomeFormTest {

    // --- requiresReason ---

    @Test fun reasonRequiredOnlyForNotInterested() {
        assertTrue(OutcomeForm.requiresReason("not_interested"))
        assertFalse(OutcomeForm.requiresReason("interested"))
        assertFalse(OutcomeForm.requiresReason("call_again"))
        assertFalse(OutcomeForm.requiresReason(null))
    }

    // --- allowsFollowUp ---

    @Test fun followUpNotOfferedForNotInterested() {
        assertFalse(OutcomeForm.allowsFollowUp("not_interested"))
        assertTrue(OutcomeForm.allowsFollowUp("call_again"))
        assertTrue(OutcomeForm.allowsFollowUp("interested"))
        assertTrue(OutcomeForm.allowsFollowUp(null))
    }

    // --- reasonSatisfied ---

    @Test fun reasonSatisfiedTrueWhenNoOutcomePickedYet() {
        // Deliberate: an unpicked outcome keeps the screen's own inline
        // "اختر نتيجة المكالمة" error, which explains itself. A dead Save
        // button would not.
        assertTrue(OutcomeForm.reasonSatisfied(null, ""))
    }

    @Test fun reasonSatisfiedTrueForOutcomesThatNeedNoReason() {
        assertTrue(OutcomeForm.reasonSatisfied("interested", ""))
        assertTrue(OutcomeForm.reasonSatisfied("call_again", ""))
    }

    @Test fun reasonSatisfiedFalseWhenNotInterestedAndEmpty() {
        assertFalse(OutcomeForm.reasonSatisfied("not_interested", ""))
    }

    @Test fun reasonSatisfiedFalseAtFourCharacters() {
        assertFalse(OutcomeForm.reasonSatisfied("not_interested", "غالي"))
    }

    @Test fun reasonSatisfiedTrueAtFiveCharacters() {
        assertTrue(OutcomeForm.reasonSatisfied("not_interested", "12345"))
    }

    @Test fun reasonSatisfiedIgnoresSurroundingWhitespace() {
        assertFalse(OutcomeForm.reasonSatisfied("not_interested", "   12   "))
        assertTrue(OutcomeForm.reasonSatisfied("not_interested", "  12345  "))
    }

    @Test fun minimumMatchesTheWebsLostReasonFloor() {
        // Web: MIN_LOST_REASON = 5 in components/crm/pipeline/
        // move-stage-confirm-modal.tsx, and the server enforces the same.
        assertEquals(5, OutcomeForm.MIN_REASON_LENGTH)
    }

    // --- effectiveFollowUpDays: the "picked a date, then changed my mind" guard ---

    @Test fun followUpDaysDroppedWhenOutcomeBecomesNotInterested() {
        assertNull(OutcomeForm.effectiveFollowUpDays("not_interested", 3))
    }

    @Test fun followUpDaysKeptForOtherOutcomes() {
        assertEquals(3, OutcomeForm.effectiveFollowUpDays("call_again", 3))
        assertEquals(1, OutcomeForm.effectiveFollowUpDays("interested", 1))
    }

    @Test fun followUpDaysNullStaysNull() {
        assertNull(OutcomeForm.effectiveFollowUpDays("call_again", null))
    }
}
