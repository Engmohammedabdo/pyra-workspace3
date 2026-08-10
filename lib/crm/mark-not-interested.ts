import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';
import { STAGE_NOT_INTERESTED, PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';
import { resolveStageLabelForActivity } from '@/lib/crm/pipeline-stages';

/**
 * The one lead → «غير مهتم» transition.
 *
 * Deliberately NOT routed through `POST /api/crm/leads/[id]/move-stage`: that
 * route is a large general mover (validation matrix, contract/invoice
 * attachments, manager notifications, reopen handling) and this is a single
 * transition triggered by a call outcome. What it DOES copy from that route,
 * exactly, is the timeline write — same `activity_type`, same metadata keys —
 * so a stage move made from the phone looks identical to one made from the web.
 */

export interface StageChangeMetadata {
  from_stage: string | null;
  from_stage_label: string | null;
  to_stage: string;
  to_stage_label: string;
  changed_by: string;
  lost_reason?: string;
}

/**
 * Pure. Mirrors the `activityMetadata` object built in
 * `app/api/crm/leads/[id]/move-stage/route.ts`. Unit-tested in
 * `__tests__/stage-change-metadata.test.ts` — that test is what stops the two
 * shapes drifting apart.
 */
export function buildStageChangeMetadata(args: {
  fromStage: string | null;
  fromStageLabel: string | null;
  toStage: string;
  toStageLabel: string;
  changedBy: string;
  lostReason?: string;
}): StageChangeMetadata {
  const meta: StageChangeMetadata = {
    from_stage: args.fromStage,
    from_stage_label: args.fromStageLabel,
    to_stage: args.toStage,
    to_stage_label: args.toStageLabel,
    changed_by: args.changedBy,
  };
  if (args.lostReason) meta.lost_reason = args.lostReason;
  return meta;
}

export type MarkNotInterestedResult =
  | { ok: true; previousStage: string | null; changed: boolean; reasonCorrected?: boolean }
  | { ok: false; reason: 'not_found' | 'stage_missing' | 'db_error' | 'terminal_won' };

/**
 * B-14. Should a reason arriving for a lead ALREADY in «غير مهتم» be recorded?
 *
 * Pure, and separated out because the two requirements here pull against each
 * other and the balance point is the whole fix:
 *
 *  - The idempotent short-circuit is deliberate. A phone retrying the same
 *    outcome (flaky network, user double-tap) must not double the timeline.
 *  - But it also swallowed CORRECTIONS. A rep who re-sent «غالي» as
 *    «غالي، بس رجع يسأل بعد ٣ شهور» had that detail dropped with no trace
 *    anywhere — not the column, not the timeline.
 *
 * So: record only a reason that actually differs. Trimmed before comparing,
 * because a resend that differs by a trailing newline is a retry, not a
 * correction. Deliberately NOT case-folded or diacritic-normalised — these are
 * sentences a human typed, and treating two spellings as one would discard the
 * newer one on the assumption that the difference is noise.
 *
 * An empty incoming reason never records: there is nothing to preserve, and it
 * must never erase a reason already on the lead.
 */
export function shouldRecordCorrectedReason(
  storedReason: string | null | undefined,
  incomingReason: string | null | undefined,
): boolean {
  const incoming = (incomingReason ?? '').trim();
  if (!incoming) return false;
  return incoming !== (storedReason ?? '').trim();
}

/**
 * A lead the business has already WON is not eligible for this transition.
 *
 * Mirrors the reopen guard on `POST /api/crm/leads/[id]/move-stage` (any move
 * OUT of `stg_closed_won` requires `leads.manage` + a `reopen_reason`, and
 * clears `is_converted`/`win_probability_overridden`) — but REFUSES instead
 * of gating, because a device key carries no RBAC scope and reopening a
 * closed-won deal is an admin decision, not something a call outcome should
 * make. `is_converted` is checked in addition to `stage_id` because it is
 * possible (and is exactly the pre-fix bug this closes) for a lead to carry
 * `is_converted: true` while sitting in a stage other than `stg_closed_won` —
 * checking `stage_id` alone would miss that half-state.
 *
 * Exported so `POST /api/mobile/call-outcome` can run this SAME check on the
 * lead row it already fetches for the ownership re-check, before any write —
 * `markNotInterested` itself only runs in that route's Step 4, well after the
 * note activity, the `last_contact_at` bump and the optional follow-up insert
 * have already landed, so validating only here would already be too late
 * (see the route's own comment for the full ordering rationale).
 */
export function isTerminalWonLead(lead: {
  stage_id: string | null;
  is_converted: boolean | null;
}): boolean {
  return lead.stage_id === PIPELINE_STAGE_IDS.CLOSED_WON || lead.is_converted === true;
}

/**
 * Move a lead to «غير مهتم» with a reason.
 *
 * Idempotent for a true retry: a lead already in the stage, re-sent the SAME
 * reason, returns `ok: true, changed: false` with NO write, so a retry never
 * doubles the timeline.
 *
 * One exception, and it is B-14: if the reason DIFFERS from the one stored, it
 * is a correction rather than a retry, so `lost_reason` is updated and a `note`
 * activity records both texts (`reasonCorrected: true`). `changed` still refers
 * only to the STAGE, which did not move — callers keying off `changed` are
 * unaffected. See `shouldRecordCorrectedReason` for where that line is drawn.
 *
 * `win_probability = 0` is written EXPLICITLY here, and this is a deliberate
 * deviation from `move-stage`. That route only applies a default when
 * `STAGE_DEFAULT_WIN_PROBABILITY` has an entry for the target, and it has none
 * for custom stages — so moving to «غير مهتم» through the web leaves the old
 * probability in place. A not-interested lead forecasting 25% pollutes the
 * pipeline value, so this path zeroes it, exactly as «خسارة» does. The
 * `win_probability_overridden` flag still wins, same as everywhere else.
 */
export async function markNotInterested(
  supabase: SupabaseClient,
  opts: { leadId: string; actor: string; reason: string },
): Promise<MarkNotInterestedResult> {
  const { leadId, actor, reason } = opts;

  const { data: lead, error: leadErr } = await supabase
    .from('pyra_sales_leads')
    // lost_reason is read for the B-14 correction path below — a lead already
    // in the stage needs its CURRENT reason to know whether an incoming one is
    // a correction or a retry.
    .select('id, stage_id, win_probability_overridden, is_converted, lost_reason')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) {
    console.error('[markNotInterested] lead fetch failed:', leadErr.message);
    return { ok: false, reason: 'db_error' };
  }
  if (!lead) return { ok: false, reason: 'not_found' };

  const fromStage = (lead.stage_id as string | null) ?? null;
  if (fromStage === STAGE_NOT_INTERESTED) {
    // ── B-14: the stage is already right, but the REASON may be new ─────────
    // Before this, the function returned here with no write of any kind, so a
    // rep correcting or expanding their reason lost it silently — the column
    // kept the old text and the timeline gained nothing.
    //
    // The stage move itself is still skipped (it is already in the target
    // stage, and re-running it would double the stage_change row this
    // function's compare-and-swap exists to prevent), so `changed` stays
    // false. `reasonCorrected` is what tells the caller a write happened.
    if (!shouldRecordCorrectedReason(lead.lost_reason as string | null, reason)) {
      return { ok: true, previousStage: fromStage, changed: false };
    }

    const previousReason = ((lead.lost_reason as string | null) ?? '').trim() || null;
    const { error: reasonErr } = await supabase
      .from('pyra_sales_leads')
      .update({ lost_reason: reason, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    if (reasonErr) {
      console.error('[markNotInterested] lost_reason correction failed:', reasonErr.message);
      return { ok: false, reason: 'db_error' };
    }

    // A `note`, NOT a second `stage_change`: nothing moved, and a stage_change
    // with identical from/to would corrupt every consumer that reads the
    // timeline as a stage history (the productivity report walks exactly these
    // rows). The previous text is kept in metadata so the correction is
    // auditable rather than just overwritten.
    //
    // created_by is the ACTOR here, unlike the system rows elsewhere in this
    // codebase that use NULL — a human typed this correction and the timeline
    // should say who.
    void supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'note',
        // i18n-exempt: persisted timeline content, not a per-request response
        // message — stays Arabic until Phase 8 (notification templates).
        description: `تحديث سبب عدم الاهتمام: ${reason}`,
        metadata: {
          auto: true,
          source: 'lost_reason_corrected',
          previous_reason: previousReason,
          new_reason: reason,
          changed_by: actor,
        },
        created_by: actor,
      })
      .then(({ error: e }) => {
        if (e) console.error('[lost_reason correction activity] insert failed:', e.message);
      });

    return { ok: true, previousStage: fromStage, changed: false, reasonCorrected: true };
  }

  // Terminal-won guard (Fix 2, wave C audit) — see isTerminalWonLead() above.
  // Checked AFTER the idempotent already-there shortcut (a lead already in
  // «غير مهتم» cannot simultaneously be closed_won, so ordering the two
  // relative to each other doesn't matter) but BEFORE any read/write below.
  if (isTerminalWonLead({ stage_id: fromStage, is_converted: (lead.is_converted as boolean | null) ?? null })) {
    return { ok: false, reason: 'terminal_won' };
  }

  // Read the stage's own name_ar rather than hardcoding the label, so a rename
  // in pipeline settings is reflected on the timeline — same as move-stage
  // does for custom stages. A MISSING row is a hard failure, not a fallback:
  // writing a stage_id nobody can resolve would produce a lead stuck in a
  // stage the pipeline board cannot render.
  const { data: stageRow, error: stageErr } = await supabase
    .from('pyra_sales_pipeline_stages')
    .select('id, name_ar')
    .eq('id', STAGE_NOT_INTERESTED)
    .maybeSingle();
  if (stageErr) {
    console.error('[markNotInterested] stage fetch failed:', stageErr.message);
    return { ok: false, reason: 'db_error' };
  }
  if (!stageRow) return { ok: false, reason: 'stage_missing' };

  const updates: Record<string, unknown> = {
    stage_id: STAGE_NOT_INTERESTED,
    lost_reason: reason,
    updated_at: new Date().toISOString(),
  };
  if (!lead.win_probability_overridden) updates.win_probability = 0;

  // ── The compare-and-swap, and why it takes this exact shape ─────────────
  //
  // `count: 'exact'` with NO `.select()` is load-bearing. Three shapes were
  // tried against the live API on this very row; only this one works:
  //
  //   .or(…) + .select('id')            → 400, 42703 "column
  //                                        pyra_sales_leads.stage_id does not
  //                                        exist" — on a column that exists.
  //   .or(…) + .select('id, stage_id')  → 200, but returns []. The filter is
  //                                        re-applied to the RETURNING row,
  //                                        which by then already holds the NEW
  //                                        stage_id and so fails `neq`. The
  //                                        UPDATE commits; the caller sees no
  //                                        row and concludes it lost a race.
  //   .or(…) + count, no .select()      → 204, Content-Range 0-0/1. Correct.
  //
  // The rule underneath: on a mutation carrying a `select=` projection,
  // PostgREST resolves an `or=` filter against that projection instead of
  // leaving it in the mutation's WHERE. Drop the projection and it lands
  // where it belongs. Plain `.eq()` filters are unaffected — see
  // `app/api/mobile/calls/ignore/route.ts`, which has filtered
  // `.update().select('id')` on columns it does not project and is fine in
  // production. Do NOT "fix" that one to match this.
  //
  // Cost of getting it wrong: the route treats a stage-move failure as
  // warn-don't-fail, so shape 1 made every «غير مهتم» from a phone write its
  // note and close its follow-up on an HTTP 200 while the lead never moved —
  // silently. Shape 2 was worse: the lead moved with no `stage_change` row.
  // All 1092 tests passed against both. Only the device test caught it.
  const { count: updatedCount, error: updErr } = await supabase
    .from('pyra_sales_leads')
    .update(updates, { count: 'exact' })
    .eq('id', leadId)
    // Compare-and-swap: only move a lead that is not ALREADY in the stage. The
    // early return above handles the sequential retry; this handles the
    // genuinely concurrent one, where both callers read the old stage before
    // either wrote. Without it both would insert a stage_change activity and
    // double the timeline.
    //
    // NULL-safe on purpose. A plain .neq() compiles to `stage_id <> '…'`,
    // which evaluates to NULL for a lead with no stage and excludes the row —
    // so a stage-less lead could never be moved at all. `stage_id` is
    // nullable (0 such rows measured 2026-08-07, but the column permits them).
    //
    // Interpolating STAGE_NOT_INTERESTED into the filter string is safe: it is
    // a code constant of the form ps_[A-Za-z0-9_-]+, never user input, so
    // there is no PostgREST-filter-injection surface (Phase 14.3 #3).
    .or(`stage_id.is.null,stage_id.neq.${STAGE_NOT_INTERESTED}`);
  if (updErr) {
    console.error('[markNotInterested] lead update failed:', updErr.message);
    return { ok: false, reason: 'db_error' };
  }
  if (updatedCount === 0) {
    // A concurrent caller moved it first. The lead IS in the target stage,
    // which is what this function was asked for — success, no second activity.
    return { ok: true, previousStage: fromStage, changed: false };
  }

  // from_stage_label: move-stage resolves a STATIC stage through
  // PIPELINE_STAGE_LABELS_AR and falls back to the raw id for a custom one.
  // Replicated exactly — including the fallback — so both writers produce the
  // same string for the same lead. Shared with move-stage via
  // resolveStageLabelForActivity() so the two writers cannot drift apart.
  const fromLabel = resolveStageLabelForActivity(fromStage);

  void supabase
    .from('pyra_lead_activities')
    .insert({
      id: generateId('la'),
      lead_id: leadId,
      activity_type: 'stage_change',
      description: null,
      metadata: buildStageChangeMetadata({
        fromStage,
        fromStageLabel: fromLabel,
        toStage: STAGE_NOT_INTERESTED,
        toStageLabel: (stageRow.name_ar as string | null) ?? STAGE_NOT_INTERESTED,
        changedBy: actor,
        lostReason: reason,
      }),
      created_by: actor,
    })
    .then(({ error: e }) => {
      if (e) console.error('[stage_change activity] insert failed:', e.message);
    });

  return { ok: true, previousStage: fromStage, changed: true };
}
