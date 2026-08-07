package cloud.pyramedia.calls.core

// Pure view-model derivations for cloud.pyramedia.calls.ui.MyDayScreen, kept
// out of the composable so the tab math can be unit-tested without Compose.

/** Tab layout derived from the server's counts. */
data class MyDayTabs(val threeTabs: Boolean, val overdueCount: Int?, val todayCount: Int)

/**
 * `counts.overdue == null` means the server's own count query failed, NOT
 * that there are zero overdue follow-ups — falling back to `?: 0` here would
 * silently turn "I don't know" into "you're all caught up", which is worse
 * than a coarser two-tab screen. Only a genuine `null` collapses to two tabs;
 * a confirmed `0` still gets three.
 */
fun myDayTabs(counts: MyDayCounts): MyDayTabs {
    val overdueCount = counts.overdue
    return if (overdueCount == null) {
        MyDayTabs(threeTabs = false, overdueCount = null, todayCount = counts.follow_ups)
    } else {
        // overdue ⊆ follow_ups by construction (an overdue row is past due,
        // so it always satisfies the follow-ups query's due_at <= now+1d
        // filter). coerceAtLeast(0) is belt and braces against a race
        // between the two independent count queries.
        MyDayTabs(
            threeTabs = true,
            overdueCount = overdueCount,
            todayCount = (counts.follow_ups - overdueCount).coerceAtLeast(0),
        )
    }
}

/** Which rows, and which total, a tab shows. */
data class MyDaySelection(val rows: List<MyDayFollowUp>, val total: Int)

/**
 * `followUps` is the server's single capped (20-row), `due_at ASC` array —
 * both follow-up tabs slice the SAME window, never a second fetch. `counts`
 * supplies the TRUE totals so `SectionHeader` can show "shown of total" even
 * when the window is smaller than reality (e.g. "٢٠ من ١٠٨").
 *
 * The cold-leads tab (`tab == 2`) is NOT handled here — it needs no
 * derivation, so the composable keeps that branch itself.
 */
fun myDayFollowUpSelection(
    tab: Int,
    tabs: MyDayTabs,
    followUps: List<MyDayFollowUp>,
    counts: MyDayCounts,
): MyDaySelection {
    if (!tabs.threeTabs) {
        return MyDaySelection(rows = followUps, total = counts.follow_ups)
    }
    return if (tab == 0) {
        val rows = followUps.filter { it.status == "overdue" }
        MyDaySelection(
            rows = rows,
            // tabs.overdueCount is non-null whenever tabs.threeTabs is true
            // (see myDayTabs) — the `?: rows.size` fallback is dead code,
            // kept only so this branch never needs a non-null assertion.
            total = tabs.overdueCount ?: rows.size,
        )
    } else {
        MyDaySelection(
            rows = followUps.filter { it.status != "overdue" },
            total = tabs.todayCount,
        )
    }
}
