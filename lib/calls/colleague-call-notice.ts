import { isoToDubaiDateTime } from '@/lib/production/deadlines';

/**
 * F-07 — the notice a lead's owner gets when a DIFFERENT rep speaks to their
 * customer.
 *
 * ## Why this text has to carry so much
 *
 * The lead-ownership boundary (B-12) deliberately writes NOTHING to the lead on
 * an unowned match: no `call_logged` activity, no `last_contact_at` bump. That
 * is the correct security answer — a rep must not be able to write onto a
 * colleague's timeline — but it left the owner with no signal at all. Before the
 * boundary they found out by accident, through a timeline row that falsely
 * implied they had made the call themselves.
 *
 * So this notification is the ONLY record the owner ever sees, which is why it
 * states who, which customer, which direction, how long, and when, and then
 * says where the call actually lives. A terse "someone called your lead" would
 * send them hunting through a timeline that by design has nothing in it.
 *
 * Pure and separated from the route so the wording and the direction/duration
 * edge cases are unit-testable without a Supabase harness.
 */

export interface ColleagueCallNotice {
  title: string;
  message: string;
  link: string;
}

/**
 * Human duration. Thresholds live in code with plain interpolation rather than
 * ICU plural categories — see the CLAUDE.md note on `n mod 100`: CLDR's
 * few/many would silently diverge from a hand-picked Arabic ladder past the
 * range anyone tested.
 */
function formatDuration(durationSeconds: number): string {
  const seconds = Math.max(0, Math.round(durationSeconds));
  if (seconds < 60) return `${seconds} ثانية`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} دقيقة`;
}

export function buildColleagueCallNotice(input: {
  leadId: string;
  leadName: string | null;
  /** Display name when known; falls back to the username, never to a blank. */
  callerDisplayName: string | null;
  callerUsername: string;
  /** Raw device value: 'incoming' | 'outgoing' | 'missed'. */
  direction: string;
  durationSeconds: number;
  calledAtIso: string;
}): ColleagueCallNotice {
  const caller = (input.callerDisplayName ?? '').trim() || input.callerUsername;
  const lead = (input.leadName ?? '').trim() || 'عميل من غير اسم';
  const duration = formatDuration(input.durationSeconds);

  // Direction is not cosmetic: "your colleague rang your customer" and "your
  // customer rang your colleague" call for different reactions from the owner.
  // 'missed' never reaches here (the caller gates on isConnectedCall), but if it
  // ever did, the inbound wording is the truthful one.
  const inbound = input.direction === 'incoming' || input.direction === 'missed';

  const when = isoToDubaiDateTime(input.calledAtIso);
  // A null means the timestamp was unparseable. Say nothing rather than print a
  // wrong or fabricated time — the notification's own created_at still anchors
  // it, and sync runs within ~15 minutes of the call.
  const whenText = when ? ` — ${when.date} ${when.time}` : '';

  // i18n-exempt: persisted notification content, not a per-request response
  // message. Stays Arabic until Phase 8 (notification templates).
  const title = inbound ? 'عميلك اتصل بزميلك' : 'زميلك كلّم عميلك';
  const message = inbound
    ? `«${lead}» اتصل بـ${caller} · ${duration}${whenText}. المكالمة مسجّلة في تقرير المكالمات، مش على تايم لاين الليد.`
    : `${caller} كلّم «${lead}» · ${duration}${whenText}. المكالمة مسجّلة في تقرير المكالمات، مش على تايم لاين الليد.`;

  return {
    title,
    message,
    // Canonical CRM path, and it must start with /dashboard: the bell follows
    // such a target_path directly, while anything else falls through
    // resolveTargetLink() to /dashboard/notifications. External-link builders
    // bypass middleware entirely, so canonical is the only safe habit here
    // (see the CRM Phase 12 locked decision).
    link: `/dashboard/crm/leads/${input.leadId}`,
  };
}
