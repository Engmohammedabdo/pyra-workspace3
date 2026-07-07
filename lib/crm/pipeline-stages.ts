import {
  PIPELINE_STAGE_IDS,
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
