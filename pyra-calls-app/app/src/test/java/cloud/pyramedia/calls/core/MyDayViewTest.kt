package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MyDayViewTest {

    private fun followUp(id: String, status: String) = MyDayFollowUp(
        id = id, lead_id = "lead-$id", lead_name = "Lead $id",
        phone = null, title = "t", due_at = "2026-08-07T00:00:00Z", status = status,
    )

    // --- myDayTabs ---

    @Test fun nullOverdueGivesTwoTabsAndOverdueCountStaysNull() {
        // The load-bearing distinction: null means "the count query failed",
        // not zero. A `?: 0` regression here would render "٠" instead of
        // falling back to the two-tab layout.
        val counts = MyDayCounts(follow_ups = 5, going_cold = 2, overdue = null)
        val tabs = myDayTabs(counts)
        assertFalse(tabs.threeTabs)
        assertNull(tabs.overdueCount)
        assertEquals(5, tabs.todayCount)
    }

    @Test fun zeroOverdueStillProducesThreeTabsNotTwo() {
        // A confirmed zero is not the same as "unknown" — only a real null
        // collapses to the two-tab fallback.
        val counts = MyDayCounts(follow_ups = 3, going_cold = 0, overdue = 0)
        val tabs = myDayTabs(counts)
        assertTrue(tabs.threeTabs)
        assertEquals(0, tabs.overdueCount)
        assertEquals(3, tabs.todayCount)
    }

    @Test fun presentOverdueGivesThreeTabsWithTheRightSplit() {
        val counts = MyDayCounts(follow_ups = 20, going_cold = 0, overdue = 8)
        val tabs = myDayTabs(counts)
        assertTrue(tabs.threeTabs)
        assertEquals(8, tabs.overdueCount)
        assertEquals(12, tabs.todayCount)
    }

    @Test fun subtractionClampedWhenOverdueExceedsFollowUps() {
        // Legitimately possible: follow_ups is capped by the 20-row LIMIT,
        // overdue is an unbounded exact count — a rep with 108 overdue and a
        // 20-row window has overdue > follow_ups.
        val counts = MyDayCounts(follow_ups = 20, going_cold = 0, overdue = 108)
        val tabs = myDayTabs(counts)
        assertTrue(tabs.threeTabs)
        assertEquals(108, tabs.overdueCount)
        assertEquals(0, tabs.todayCount)
    }

    // --- myDayFollowUpSelection: two-tab layout ---

    @Test fun twoTabLayoutReturnsTheWholeListRegardlessOfTabIndex() {
        val counts = MyDayCounts(follow_ups = 3, going_cold = 0, overdue = null)
        val tabs = myDayTabs(counts)
        val followUps = listOf(followUp("1", "overdue"), followUp("2", "pending"), followUp("3", "pending"))

        val tab0 = myDayFollowUpSelection(0, tabs, followUps, counts)
        assertEquals(followUps, tab0.rows)
        assertEquals(3, tab0.total)
    }

    @Test fun twoTabLayoutResidualTabOneStillReturnsTheFullListNotEmpty() {
        // tab==1 can be left over in local state from a prior three-tab
        // render (e.g. the count query flips to null on a subsequent
        // refresh while "النهاردة" was selected). It must not go blank.
        val counts = MyDayCounts(follow_ups = 3, going_cold = 0, overdue = null)
        val tabs = myDayTabs(counts)
        val followUps = listOf(followUp("1", "overdue"), followUp("2", "pending"), followUp("3", "pending"))

        val tab1 = myDayFollowUpSelection(1, tabs, followUps, counts)
        assertEquals(followUps, tab1.rows)
        assertEquals(3, tab1.total)
    }

    // --- myDayFollowUpSelection: three-tab layout ---

    @Test fun threeTabLayoutTabZeroReturnsOverdueRowsOnlyWithServerTotal() {
        val counts = MyDayCounts(follow_ups = 3, going_cold = 0, overdue = 1)
        val tabs = myDayTabs(counts)
        val followUps = listOf(followUp("1", "overdue"), followUp("2", "pending"), followUp("3", "pending"))

        val selection = myDayFollowUpSelection(0, tabs, followUps, counts)
        assertEquals(listOf(followUps[0]), selection.rows)
        assertEquals(1, selection.total)
    }

    @Test fun threeTabLayoutTabOneReturnsNonOverdueRowsWithDerivedTotal() {
        val counts = MyDayCounts(follow_ups = 3, going_cold = 0, overdue = 1)
        val tabs = myDayTabs(counts)
        val followUps = listOf(followUp("1", "overdue"), followUp("2", "pending"), followUp("3", "pending"))

        val selection = myDayFollowUpSelection(1, tabs, followUps, counts)
        assertEquals(listOf(followUps[1], followUps[2]), selection.rows)
        assertEquals(2, selection.total)
    }

    @Test fun threeTabLayoutAnyNonZeroIndexMapsToTheTodayBucket() {
        // "otherwise" per the spec — not just literally tab == 1.
        val counts = MyDayCounts(follow_ups = 3, going_cold = 0, overdue = 1)
        val tabs = myDayTabs(counts)
        val followUps = listOf(followUp("1", "overdue"), followUp("2", "pending"), followUp("3", "pending"))

        val selection = myDayFollowUpSelection(2, tabs, followUps, counts)
        assertEquals(listOf(followUps[1], followUps[2]), selection.rows)
        assertEquals(2, selection.total)
    }

    @Test fun threeTabLayoutTabZeroCanBeEmptyOnlyWhenOverdueTotalIsZero() {
        // Documents the invariant Fix 3 relies on: the server orders
        // follow_ups by due_at ASC and an overdue row's due_at is always in
        // the past, i.e. earlier than any pending row's due_at — so overdue
        // rows always sort first in the capped window. Tab 0's rows can only
        // be empty when its own total is also zero.
        val counts = MyDayCounts(follow_ups = 3, going_cold = 0, overdue = 0)
        val tabs = myDayTabs(counts)
        val followUps = listOf(followUp("1", "pending"), followUp("2", "pending"), followUp("3", "pending"))

        val selection = myDayFollowUpSelection(0, tabs, followUps, counts)
        assertTrue(selection.rows.isEmpty())
        assertEquals(0, selection.total)
    }
}
