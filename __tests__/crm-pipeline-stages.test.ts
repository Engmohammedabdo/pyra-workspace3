import { describe, expect, it } from 'vitest';
import {
  getStageDefaultWinProbability,
  isCrmPipelineStageId,
  isStaticPipelineStageId,
} from '@/lib/crm/pipeline-stages';

describe('CRM pipeline stage helpers', () => {
  it('treats custom settings stages as CRM-visible and keeps legacy sales stages hidden', () => {
    expect(isCrmPipelineStageId('stg_new_inquiry')).toBe(true);
    expect(isCrmPipelineStageId('ps_zT_9mNvS8qxMq-7d')).toBe(true);
    expect(isCrmPipelineStageId('stage_new')).toBe(false);
  });

  it('distinguishes fixed stages from custom stages for business rules', () => {
    expect(isStaticPipelineStageId('stg_closed_lost')).toBe(true);
    expect(isStaticPipelineStageId('ps_zT_9mNvS8qxMq-7d')).toBe(false);
  });

  it('does not invent a win-probability default for custom stages', () => {
    expect(getStageDefaultWinProbability('stg_negotiation')).toBe(72);
    expect(getStageDefaultWinProbability('ps_zT_9mNvS8qxMq-7d')).toBeNull();
  });
});
