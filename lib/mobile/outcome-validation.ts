/**
 * Pure request validation for `POST /api/mobile/call-outcome`.
 *
 * Extracted from the route so the reason rules are unit-testable without a
 * Supabase client or a NextRequest. The route calls this FIRST and writes
 * nothing until it returns ok — writing a note and then rejecting would leave
 * a lead with an outcome recorded and its stage unmoved, which is the exact
 * defect this wave exists to close.
 */

export const OUTCOMES = ['interested', 'not_interested', 'call_again'] as const;
export type Outcome = (typeof OUTCOMES)[number];

// Persisted lead-timeline / follow-up content — stays Arabic per the codebase
// convention (CLAUDE.md i18n rules: DB-data strings are exempt until Phase 8).
export const OUTCOME_LABELS: Record<Outcome, string> = {
  interested: 'مهتم', // i18n-exempt: persisted lead-activity content (Phase 8)
  not_interested: 'غير مهتم', // i18n-exempt: persisted lead-activity content (Phase 8)
  call_again: 'يحتاج إعادة اتصال', // i18n-exempt: persisted lead-activity content (Phase 8)
};

export const NOTE_MAX_LENGTH = 2000;

/** Same floor as the web's `MIN_LOST_REASON` in move-stage-confirm-modal.tsx. */
export const MIN_NOT_INTERESTED_REASON = 5;

/**
 * Fix 6 (wave C audit): `not_interested_reason` had a floor but no ceiling —
 * unlike `note`, it is written TWICE (`pyra_sales_leads.lost_reason`, an
 * unbounded text column, AND the `stage_change` activity's jsonb metadata).
 * A reason is a sentence, not an essay, so this is capped well below
 * `NOTE_MAX_LENGTH`.
 */
export const REASON_MAX_LENGTH = 500;

export interface ValidatedOutcome {
  leadId: string;
  outcome: Outcome;
  note: string;
  nextFollowUpAtIso: string | null;
  notInterestedReason: string | null;
  completeFollowUpId: string | null;
}

export type OutcomeValidation =
  | { ok: true; value: ValidatedOutcome }
  | { ok: false; message: string };

export interface OutcomeValidationOptions {
  /**
   * Require a scheduled next step for any outcome other than `not_interested`.
   *
   * OFF by default, and that default is load-bearing: the caller turns it on
   * from the device's reported `x-app-version`, because a fleet running an older
   * build physically cannot send `next_follow_up_at` and would take a 422 on
   * every saved outcome. See NEXT_STEP_ENFORCED_FROM_VERSION in the route.
   */
  requireNextStep?: boolean;
}

function isOutcome(value: unknown): value is Outcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateOutcomeRequest(
  body: unknown,
  options: OutcomeValidationOptions = {},
): OutcomeValidation {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'جسم الطلب مطلوب' };
  }
  const b = body as Record<string, unknown>;

  const leadId = str(b.lead_id);
  if (!leadId) return { ok: false, message: 'lead_id مطلوب' };

  const outcome = b.outcome;
  if (!isOutcome(outcome)) {
    return {
      ok: false,
      message: 'outcome غير صالح — القيم المسموحة: interested, not_interested, call_again',
    };
  }

  const note = str(b.note);
  if (note.length > NOTE_MAX_LENGTH) {
    return { ok: false, message: `الملاحظة طويلة جدًا (الحد الأقصى ${NOTE_MAX_LENGTH} حرف)` };
  }

  let nextFollowUpAtIso: string | null = null;
  const rawNext = typeof b.next_follow_up_at === 'string' ? b.next_follow_up_at : '';
  if (rawNext) {
    const parsed = new Date(rawNext);
    if (isNaN(parsed.getTime())) return { ok: false, message: 'next_follow_up_at غير صالح' };
    nextFollowUpAtIso = parsed.toISOString();
  }

  // Wave د+ #01 — placed AFTER the parse above on purpose: a rep who picked a
  // broken date should hear that, not "pick a next step".
  if (options.requireNextStep && outcome !== 'not_interested' && !nextFollowUpAtIso) {
    // i18n-exempt: API response message, `api` namespace migration is Phase 8
    return { ok: false, message: 'لازم تحدد الخطوة الجاية قبل الحفظ' };
  }

  // The reason is REQUIRED with not_interested and REJECTED with anything
  // else. Rejecting (rather than ignoring) a misplaced reason turns a client
  // bug into a visible 422 instead of a silently dropped field.
  const reason = str(b.not_interested_reason);
  let notInterestedReason: string | null = null;
  if (outcome === 'not_interested') {
    if (reason.length < MIN_NOT_INTERESTED_REASON) {
      return {
        ok: false,
        message: `سبب عدم الاهتمام مطلوب (${MIN_NOT_INTERESTED_REASON} حروف على الأقل)`,
      };
    }
    if (reason.length > REASON_MAX_LENGTH) {
      return {
        ok: false,
        message: `سبب عدم الاهتمام طويل جدًا (الحد الأقصى ${REASON_MAX_LENGTH} حرف)`,
      };
    }
    notInterestedReason = reason;
  } else if (reason) {
    return {
      ok: false,
      message: 'not_interested_reason مسموح فقط مع outcome=not_interested',
    };
  }

  const completeFollowUpId = str(b.complete_follow_up_id) || null;

  return {
    ok: true,
    value: { leadId, outcome, note, nextFollowUpAtIso, notInterestedReason, completeFollowUpId },
  };
}
