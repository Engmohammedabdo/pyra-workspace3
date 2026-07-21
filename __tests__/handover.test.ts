import { describe, it, expect } from 'vitest';
import { isOpenLeadStage } from '@/lib/hr/handover';

describe('isOpenLeadStage', () => {
  it('treats the codebase terminal stages (closed_won/closed_lost) as NOT open', () => {
    expect(isOpenLeadStage('stg_closed_won')).toBe(false);
    expect(isOpenLeadStage('stg_closed_lost')).toBe(false);
  });
  it('treats active + custom (ps_*) + null stages as open (safe over-inclusion)', () => {
    expect(isOpenLeadStage('stg_discovery_call')).toBe(true);
    expect(isOpenLeadStage('stg_new_inquiry')).toBe(true);
    expect(isOpenLeadStage('ps_85AlKP8d7mA7HAO9')).toBe(true); // custom stage — safe to show for handover
    expect(isOpenLeadStage(null)).toBe(true);
  });
});
