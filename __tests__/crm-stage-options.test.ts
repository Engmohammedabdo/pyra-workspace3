import { describe, it, expect } from 'vitest';
import { buildStageOptions } from '@/lib/crm/stage-options';

const STAGES = [
  { id: 'stg_reshuffle' },
  { id: 'stg_new_inquiry' },
  { id: 'stg_discovery_call' },
  { id: 'stg_proposal_sent' },
  { id: 'stg_negotiation' },
  { id: 'stg_contract_signed' },
  { id: 'stg_closed_won' },
  { id: 'stg_closed_lost' },
];

const base = {
  stages: STAGES,
  currentStageId: 'stg_new_inquiry',
  canAttachFinance: true,
  isArchived: false,
};

function byId(opts: ReturnType<typeof buildStageOptions>, id: string) {
  const found = opts.find((o) => o.id === id);
  if (!found) throw new Error(`option ${id} missing`);
  return found;
}

describe('buildStageOptions', () => {
  it('omits the stage the lead is already in', () => {
    const opts = buildStageOptions(base);
    expect(opts.some((o) => o.id === 'stg_new_inquiry')).toBe(false);
    expect(opts).toHaveLength(STAGES.length - 1);
  });

  it('always refuses closed_won — it belongs to the approval flow', () => {
    const opts = buildStageOptions(base);
    expect(byId(opts, 'stg_closed_won')).toEqual({
      id: 'stg_closed_won',
      disabled: true,
      reason: 'closedWonViaApproval',
    });
  });

  it('refuses contract_signed without finance permission', () => {
    const opts = buildStageOptions({ ...base, canAttachFinance: false });
    expect(byId(opts, 'stg_contract_signed')).toEqual({
      id: 'stg_contract_signed',
      disabled: true,
      reason: 'contractNeedsAdmin',
    });
  });

  it('allows contract_signed with finance permission', () => {
    const opts = buildStageOptions(base);
    expect(byId(opts, 'stg_contract_signed').disabled).toBe(false);
  });

  it('allows the routine stages', () => {
    const opts = buildStageOptions(base);
    for (const id of [
      'stg_reshuffle',
      'stg_discovery_call',
      'stg_proposal_sent',
      'stg_negotiation',
      'stg_closed_lost',
    ]) {
      expect(byId(opts, id)).toEqual({ id, disabled: false, reason: null });
    }
  });

  it('disables every stage when the lead is archived', () => {
    const opts = buildStageOptions({ ...base, isArchived: true });
    expect(opts.every((o) => o.disabled && o.reason === 'leadArchived')).toBe(true);
  });

  it('treats a custom ps_* stage as routine', () => {
    const opts = buildStageOptions({
      ...base,
      stages: [...STAGES, { id: 'ps_custom_demo' }],
    });
    expect(byId(opts, 'ps_custom_demo')).toEqual({
      id: 'ps_custom_demo',
      disabled: false,
      reason: null,
    });
  });

  it('returns every stage when the lead has no stage yet', () => {
    const opts = buildStageOptions({ ...base, currentStageId: null });
    expect(opts).toHaveLength(STAGES.length);
  });
});
