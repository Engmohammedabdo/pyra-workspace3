import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';
import { PIPELINE_STAGE_LABELS_AR, STAGE_NOT_INTERESTED } from '@/lib/constants/statuses';
import { isStaticPipelineStageId } from '@/lib/crm/pipeline-stages';

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
  | { ok: false; reason: 'not_found' | 'stage_missing' | 'db_error' };

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
    .select('id, stage_id, win_probability_overridden')
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

  const { error: updErr } = await supabase
    .from('pyra_sales_leads')
    .update(updates)
    .eq('id', leadId);
  if (updErr) {
    console.error('[markNotInterested] lead update failed:', updErr.message);
    return { ok: false, reason: 'db_error' };
  }

  // from_stage_label: move-stage resolves a STATIC stage through
  // PIPELINE_STAGE_LABELS_AR and falls back to the raw id for a custom one.
  // Replicated exactly — including the fallback — so both writers produce the
  // same string for the same lead.
  const fromLabel =
    fromStage && isStaticPipelineStageId(fromStage)
      ? PIPELINE_STAGE_LABELS_AR[fromStage]
      : fromStage;

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
