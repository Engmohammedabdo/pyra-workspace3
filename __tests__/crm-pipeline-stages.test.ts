import { describe, expect, it } from 'vitest';
import {
  getStageDefaultWinProbability,
  isCrmPipelineStageId,
  isStaticPipelineStageId,
  resolveStageLabelForActivity,
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

describe('resolveStageLabelForActivity', () => {
  it('resolves a seeded stage id to its Arabic label', () => {
    expect(resolveStageLabelForActivity('stg_discovery_call')).toBe('مكالمة استكشافية');
  });

  it('falls back to the raw id for a custom ps_* stage', () => {
    expect(resolveStageLabelForActivity('ps_zT_9mNvS8qxMq-7d')).toBe('ps_zT_9mNvS8qxMq-7d');
  });

  it('returns null unchanged for a lead with no previous stage', () => {
    expect(resolveStageLabelForActivity(null)).toBeNull();
  });
});
