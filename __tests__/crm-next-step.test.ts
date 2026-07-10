import { describe, it, expect } from 'vitest';
import { deriveNextStep } from '@/lib/crm/next-step';

const NOW = Date.parse('2026-07-10T12:00:00Z');

describe('deriveNextStep', () => {
  it('returns overdue when the follow-up is in the past', () => {
    const r = deriveNextStep({
      stageIndex: 2,
      stageCount: 5,
      nextFollowUpIso: '2026-07-09T09:00:00Z',
      nowMs: NOW,
    });
    expect(r).toEqual({ key: 'overdue', overdue: true });
  });

  it('does NOT return overdue for a future follow-up (falls through to stage ladder)', () => {
    const r = deriveNextStep({
      stageIndex: 2,
      stageCount: 5,
      nextFollowUpIso: '2026-07-20T09:00:00Z',
      nowMs: NOW,
    });
    expect(r).toEqual({ key: 'proposal', overdue: false });
  });

  it('maps the stage ladder by position', () => {
    const base = { stageCount: 6, nextFollowUpIso: null, nowMs: NOW };
    expect(deriveNextStep({ ...base, stageIndex: 0 }).key).toBe('contact');
    expect(deriveNextStep({ ...base, stageIndex: 1 }).key).toBe('qualify');
    expect(deriveNextStep({ ...base, stageIndex: 2 }).key).toBe('proposal');
    expect(deriveNextStep({ ...base, stageIndex: 3 }).key).toBe('negotiate');
    // index 4 is beyond the ladder but not the last stage → clamps to negotiate
    expect(deriveNextStep({ ...base, stageIndex: 4 }).key).toBe('negotiate');
  });

  it('returns complete for the final stage', () => {
    expect(
      deriveNextStep({ stageIndex: 4, stageCount: 5, nextFollowUpIso: null, nowMs: NOW }).key,
    ).toBe('complete');
    // single-stage pipeline: index 0 is the last stage
    expect(
      deriveNextStep({ stageIndex: 0, stageCount: 1, nextFollowUpIso: null, nowMs: NOW }).key,
    ).toBe('complete');
  });

  it('clamps an unknown (negative) stage index to the first rung', () => {
    expect(
      deriveNextStep({ stageIndex: -1, stageCount: 5, nextFollowUpIso: null, nowMs: NOW }).key,
    ).toBe('contact');
  });

  it('ignores an unparseable follow-up date', () => {
    const r = deriveNextStep({
      stageIndex: 0,
      stageCount: 5,
      nextFollowUpIso: 'not-a-date',
      nowMs: NOW,
    });
    expect(r).toEqual({ key: 'contact', overdue: false });
  });
});
