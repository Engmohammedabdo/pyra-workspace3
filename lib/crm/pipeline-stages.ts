import {
  PIPELINE_STAGE_IDS,
  PIPELINE_STAGE_LABELS_AR,
  STAGE_DEFAULT_WIN_PROBABILITY,
  type PipelineStageId,
} from '@/lib/constants/statuses';

const STATIC_STAGE_IDS = new Set<string>(Object.values(PIPELINE_STAGE_IDS));

export function isStaticPipelineStageId(stageId: string): stageId is PipelineStageId {
  return STATIC_STAGE_IDS.has(stageId);
}

export function isCrmPipelineStageId(stageId: string): boolean {
  return stageId.startsWith('stg_') || stageId.startsWith('ps_');
}

export function getStageDefaultWinProbability(stageId: string): number | null {
  return isStaticPipelineStageId(stageId)
    ? STAGE_DEFAULT_WIN_PROBABILITY[stageId]
    : null;
}

/**
 * Stage label as it is SNAPSHOTTED into `stage_change` activity metadata.
 * A seeded `stg_*` stage resolves through PIPELINE_STAGE_LABELS_AR; a custom
 * `ps_*` stage falls back to its raw id — that fallback is the existing
 * behaviour and is deliberately preserved.
 *
 * Shared by the two writers of that metadata (the web move-stage route and
 * lib/crm/mark-not-interested.ts) so they cannot silently drift apart.
 */
export function resolveStageLabelForActivity(stageId: string | null): string | null {
  // Returns the input unchanged for null/'' so this is byte-identical to the
  // two inline expressions it replaces.
  if (!stageId) return stageId;
  return isStaticPipelineStageId(stageId) ? PIPELINE_STAGE_LABELS_AR[stageId] : stageId;
}
