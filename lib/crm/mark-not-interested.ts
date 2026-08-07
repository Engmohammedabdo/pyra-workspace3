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
  | { ok: true; previousStage: string | null; changed: boolean }
  | { ok: false; reason: 'not_found' | 'stage_missing' | 'db_error' | 'terminal_won' };

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
 * Idempotent: a lead already in the stage returns `ok: true, changed: false`
 * with NO write, so a retry never doubles the timeline.
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
    .select('id, stage_id, win_probability_overridden, is_converted')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) {
    console.error('[markNotInterested] lead fetch failed:', leadErr.message);
    return { ok: false, reason: 'db_error' };
  }
  if (!lead) return { ok: false, reason: 'not_found' };

  const fromStage = (lead.stage_id as string | null) ?? null;
  if (fromStage === STAGE_NOT_INTERESTED) {
    return { ok: true, previousStage: fromStage, changed: false };
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

  const { data: updatedRow, error: updErr } = await supabase
    .from('pyra_sales_leads')
    .update(updates)
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
    .or(`stage_id.is.null,stage_id.neq.${STAGE_NOT_INTERESTED}`)
    // `stage_id` MUST stay in this select even though no caller reads it.
    //
    // On a MUTATION carrying a `select=` projection, PostgREST resolves an
    // `or=` filter against the PROJECTED columns rather than the table, so
    // `.select('id')` made the `.or()` above fail with
    //   42703  column pyra_sales_leads.stage_id does not exist
    // on a column that plainly does exist. Bisected against the live API:
    // same `or=` with `select=id,stage_id` → 200; with `select=id` → 400.
    //
    // This is specific to `or=`. Plain `.eq()` filters go into the mutation's
    // own WHERE and need no projection — `app/api/mobile/calls/ignore/route.ts`
    // has filtered `.update().select('id')` on columns it does not project and
    // works fine in production. Do not "fix" that one to match this.
    //
    // Cost of the bug: the route treats a stage-move failure as warn-don't-fail,
    // so every «غير مهتم» from a phone wrote its note and closed its follow-up
    // while the lead never moved — silently, on an HTTP 200. All 1092 tests
    // passed. Only the device test caught it.
    .select('id, stage_id')
    .maybeSingle();
  if (updErr) {
    console.error('[markNotInterested] lead update failed:', updErr.message);
    return { ok: false, reason: 'db_error' };
  }
  if (!updatedRow) {
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
