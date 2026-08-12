package cloud.pyramedia.calls.core

// Pure view-model derivations for cloud.pyramedia.calls.ui.MyDayScreen, kept
// out of the composable so the tab math can be unit-tested without Compose.

/** Tab layout derived from the server's counts. */
data class MyDayTabs(
    val threeTabs: Boolean,
    val overdueCount: Int?,
    val todayCount: Int,
    // Wave د+ #06: a fourth tab for leads with no last_contact_at at all
    // ("لم يتم الاتصال بهم"). See `myDayTabs` below for the null-vs-zero
    // handling, which is deliberately the OPPOSITE of `overdueCount`'s.
    val fourTabs: Boolean,
    val neverContactedCount: Int?,
)

/**
 * `counts.overdue == null` means the server's own count query failed, NOT
 * that there are zero overdue follow-ups — falling back to `?: 0` here would
 * silently turn "I don't know" into "you're all caught up", which is worse
 * than a coarser two-tab screen. Only a genuine `null` collapses to two tabs;
 * a confirmed `0` still gets three.
 */
fun myDayTabs(counts: MyDayCounts): MyDayTabs {
    val overdueCount = counts.overdue
    // Unlike `overdueCount` above, `neverContacted` collapses null AND a
    // confirmed zero to the same outcome (`?: 0`) — on purpose, and for the
    // opposite reason. A missing third tab with the wrong badge would be a
    // visible lie ("٠" instead of "unknown"), but a missing FOURTH tab is
    // simply invisible: there is no badge to get wrong, only a tab to show
    // or not. So "the count query failed" and "the count is genuinely zero"
    // are indistinguishable here, and both correctly mean "don't show it".
    val neverContactedCount = counts.neverContacted
    val fourTabs = (neverContactedCount ?: 0) > 0
    return if (overdueCount == null) {
        MyDayTabs(
            threeTabs = false,
            overdueCount = null,
            todayCount = counts.follow_ups,
            fourTabs = fourTabs,
            neverContactedCount = neverContactedCount,
        )
    } else {
        // overdue ⊆ follow_ups by construction (an overdue row is past due,
        // so it always satisfies the follow-ups query's due_at <= now+1d
        // filter). coerceAtLeast(0) is belt and braces against a race
        // between the two independent count queries.
        MyDayTabs(
            threeTabs = true,
            overdueCount = overdueCount,
            todayCount = (counts.follow_ups - overdueCount).coerceAtLeast(0),
            fourTabs = fourTabs,
            neverContactedCount = neverContactedCount,
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
