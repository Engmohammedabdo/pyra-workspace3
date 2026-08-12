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
  /**
   * Epoch ms of this lead's most recent `idle_warning` activity — with NO
   * time window — or `null` if it has never been nudged. This is the
   * rotation key, and it is deliberately NOT "how long since a human
   * touched this lead" (that signal lives in the route's own `lastTouched`
   * computation, which must exclude `idle_warning` for exactly this reason).
   */
  lastNudgedMs: number | null;
  /** Has this lead ever had a call that was answered? `isConnectedCall` semantics. */
  hasConnectedCall: boolean;
}

/**
 * Sorted LEAST-recently-nudged FIRST, then capped per agent.
 *
 * This is a deliberate reversal of the original sort (most-recent-touch
 * first), because that sort was a feedback loop the cron fed itself. The
 * cron WRITES the `idle_warning` activity row that `lastTouched` later reads
 * back as "last touched" — so a nudged lead's sort key resets to today the
 * moment the row lands. The instant its 7-day dedup expires, it re-enters
 * the pool carrying the freshest timestamp any idle lead can hold, and wins
 * the daily cap again. Forever. Measured 2026-08-12: on 619 of 772 (80%) of
 * eligible leads, the newest non-`call_attempt` activity IS an
 * `idle_warning` — the "recently touched" signal was mostly the cron's own
 * handwriting, not a human conversation. Steady state pinned ~70 leads per
 * agent and permanently starved the other ~529 of 669.
 *
 * Rotation fixes this by construction: every eligible lead gets a turn.
 * Never-nudged leads (`lastNudgedMs === null`) sort first — nothing is more
 * overdue than "never" — then oldest-nudge-first among the rest. Do NOT
 * "restore" most-recent-first; that IS the bug this sort exists to prevent.
 *
 * `leadId` breaks every tie so the same input always produces the same list —
 * an unordered read makes the daily nudge shuffle for no reason and makes a
 * bug report impossible to reproduce.
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
    list.sort((a, b) => {
      if (a.lastNudgedMs === null && b.lastNudgedMs === null) {
        return a.leadId.localeCompare(b.leadId);
      }
      if (a.lastNudgedMs === null) return -1;
      if (b.lastNudgedMs === null) return 1;
      return a.lastNudgedMs - b.lastNudgedMs || a.leadId.localeCompare(b.leadId);
    });
    out.push(...list.slice(0, capPerAgent));
  }
  return out;
}
