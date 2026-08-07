import { describe, it, expect } from 'vitest';
import { buildStageChangeMetadata } from '@/lib/crm/mark-not-interested';

// The whole point of this helper is that a stage move written from a PHONE is
// indistinguishable, on the lead timeline, from one written by the web.
// `app/api/crm/leads/[id]/move-stage/route.ts` builds exactly these keys.
describe('buildStageChangeMetadata', () => {
  const base = {
    fromStage: 'stg_discovery_call',
    fromStageLabel: 'مكالمة استكشافية',
    toStage: 'ps_zT_9mNvS8qxMq-7d',
    toStageLabel: 'غير مهتم',
    changedBy: 'cosette',
  };

  it('emits exactly the web route\'s key set', () => {
    const meta = buildStageChangeMetadata({ ...base, lostReason: 'السعر مش مناسب' });
    expect(Object.keys(meta).sort()).toEqual(
      ['changed_by', 'from_stage', 'from_stage_label', 'lost_reason', 'to_stage', 'to_stage_label'],
    );
  });

  it('omits lost_reason entirely when absent', () => {
    const meta = buildStageChangeMetadata(base);
    expect('lost_reason' in meta).toBe(false);
  });

  it('carries the values through unchanged', () => {
    const meta = buildStageChangeMetadata({ ...base, lostReason: 'فاز عليه منافس' });
    expect(meta).toEqual({
      from_stage: 'stg_discovery_call',
      from_stage_label: 'مكالمة استكشافية',
      to_stage: 'ps_zT_9mNvS8qxMq-7d',
      to_stage_label: 'غير مهتم',
      changed_by: 'cosette',
      lost_reason: 'فاز عليه منافس',
    });
  });

  it('tolerates a lead that had no previous stage', () => {
    const meta = buildStageChangeMetadata({ ...base, fromStage: null, fromStageLabel: null });
    expect(meta.from_stage).toBeNull();
    expect(meta.from_stage_label).toBeNull();
  });
});
