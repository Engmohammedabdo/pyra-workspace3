/**
 * Who earns a "your customer went quiet" nudge, and how many per day.
 *
 * ## Why this exists
 *
 * Measured 2026-08-12: the idle cron wrote 2,454 warnings in 30 days across
 * 1,189 of 1,258 live leads. A nudge that fires on 95% of the book is not a
 * signal — it is the largest source of activity in the system, larger than all
 * human work combined, and the rep has correctly learned to ignore it. Which
 * means the lead that genuinely needs attention is lost inside it.
 *
 * Owner decision (2026-08-12): eligible only with a prior CONNECTED call, and
 * capped per agent per day.
 */

export const IDLE_DAILY_CAP_PER_AGENT = 10;

export interface IdleCandidate {
  leadId: string;
  agentUsername: string;
  /** max(latest non-attempt activity, last_contact_at) in ms — the cron's own `lastTouched`. */
  lastTouchedMs: number;
  /** Has this lead ever had a call that was answered? `isConnectedCall` semantics. */
  hasConnectedCall: boolean;
}

/**
 * Sorted most-recently-spoken-to FIRST, then capped per agent.
 *
 * The sort direction is a deliberate reversal of the obvious one. Oldest-first
 * would hand each rep the ten deadest leads in their book every morning, for
 * ever, and they would stop reading the list within a week. A conversation eight
 * days old is recoverable; one from ninety days ago is a re-prospecting job, not
 * a nudge.
 *
 * `leadId` breaks ties so the same input always produces the same list — an
 * unordered read makes the daily nudge shuffle for no reason and makes a bug
 * report impossible to reproduce.
 */
export function selectIdleNudges(
  candidates: IdleCandidate[],
  capPerAgent: number = IDLE_DAILY_CAP_PER_AGENT,
): IdleCandidate[] {
  const eligible = candidates.filter((c) => c.hasConnectedCall);
  const byAgent = new Map<string, IdleCandidate[]>();

  for (const c of eligible) {
    const list = byAgent.get(c.agentUsername);
    if (list) list.push(c);
    else byAgent.set(c.agentUsername, [c]);
  }

  const out: IdleCandidate[] = [];
  for (const list of byAgent.values()) {
    list.sort((a, b) =>
      b.lastTouchedMs - a.lastTouchedMs || a.leadId.localeCompare(b.leadId),
    );
    out.push(...list.slice(0, capPerAgent));
  }
  return out;
}
