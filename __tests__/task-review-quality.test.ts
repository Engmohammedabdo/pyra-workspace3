import { describe, expect, it } from 'vitest';
import {
  TASK_REJECTION_KINDS,
  type TaskRejectionKind,
} from '@/lib/constants/task-review';
import { PRODUCTION_BOARD_ID } from '@/lib/constants/production';
import {
  getTaskRejectionActivityDisplay,
  normalizeQualityRejectionEvent,
  normalizeReviewDecisionQualityEvent,
} from '@/lib/production/quality';

function normalize(details: unknown, createdAt = '2026-07-10T10:00:00.000Z') {
  return normalizeQualityRejectionEvent({
    task_id: 'task-1',
    action: 'stage_rejected',
    details,
    created_at: createdAt,
  });
}

describe('structured quality rejection normalization', () => {
  it.each<[unknown, TaskRejectionKind]>([
    [{ rejection_kind: 'revision' }, TASK_REJECTION_KINDS.REVISION],
    [{ rejection_kind: 'outright' }, TASK_REJECTION_KINDS.OUTRIGHT],
  ])('accepts exact known values from native JSON objects', (details, expected) => {
    expect(normalize(details)).toEqual({
      task_id: 'task-1',
      created_at: '2026-07-10T10:00:00.000Z',
      kind: expected,
    });
  });

  it.each([
    { note: 'No structured classification' },
    { rejection_kind: 'OUTRIGHT', note: 'Unknown marker' },
    '{"rejection_kind":"outright","note":"Legacy note"}',
    '"{\\"rejection_kind\\":\\"outright\\"}"',
    'not-json',
    null,
  ])('treats legacy, malformed, string, and unknown details as revision', (details) => {
    expect(normalize(details)?.kind).toBe(TASK_REJECTION_KINDS.REVISION);
  });

  it('never classifies a non-rejection activity as a rejection', () => {
    expect(normalizeQualityRejectionEvent({
      task_id: 'task-1',
      action: 'comment_added',
      details: { rejection_kind: 'outright' },
      created_at: '2026-07-10T10:00:00.000Z',
    })).toBeNull();
  });

  it('uses only a native decision linked to the exact production history row', () => {
    const history = {
      id: 'sh-review-1',
      task_id: 'task-1',
      board_id: PRODUCTION_BOARD_ID,
      from_column_id: 'review',
      to_column_id: 'work',
      created_at: '2026-07-10T10:00:00.000Z',
    };
    const decision = {
      history_id: history.id,
      task_id: history.task_id,
      board_id: history.board_id,
      action: 'reject',
      rejection_kind: 'outright',
      decided_at: history.created_at,
    };

    expect(normalizeReviewDecisionQualityEvent(
      decision,
      history,
      PRODUCTION_BOARD_ID,
      'review',
    )).toEqual({
      task_id: 'task-1',
      created_at: history.created_at,
      action: 'reject',
      kind: 'outright',
    });

    expect(() => normalizeReviewDecisionQualityEvent(
      { ...decision, board_id: 'bd_other' },
      history,
      PRODUCTION_BOARD_ID,
      'review',
    )).toThrow(/board/i);
    expect(() => normalizeReviewDecisionQualityEvent(
      { ...decision, history_id: 'sh-other' },
      history,
      PRODUCTION_BOARD_ID,
      'review',
    )).toThrow(/history/i);
    expect(() => normalizeReviewDecisionQualityEvent(
      { ...decision, rejection_kind: 'OUTRIGHT' },
      history,
      PRODUCTION_BOARD_ID,
      'review',
    )).toThrow(/kind/i);
  });

  it('keeps a linked native approval in the same monthly quality cohort', () => {
    const history = {
      id: 'sh-approve-1',
      task_id: 'task-1',
      board_id: PRODUCTION_BOARD_ID,
      from_column_id: 'review',
      to_column_id: 'approved',
      created_at: '2026-08-02T10:00:00.000Z',
    };
    const decision = {
      history_id: history.id,
      task_id: history.task_id,
      board_id: history.board_id,
      action: 'approve',
      rejection_kind: null,
      decided_at: history.created_at,
    };

    expect(normalizeReviewDecisionQualityEvent(
      decision,
      history,
      PRODUCTION_BOARD_ID,
      'review',
    )).toEqual({
      task_id: 'task-1',
      created_at: history.created_at,
      action: 'approve',
      kind: null,
    });

    expect(() => normalizeReviewDecisionQualityEvent(
      { ...decision, rejection_kind: 'revision' },
      history,
      PRODUCTION_BOARD_ID,
      'review',
    )).toThrow(/kind/i);
  });

  it('shows the note but never promotes a legacy JSON string to outright', () => {
    expect(getTaskRejectionActivityDisplay({
      task_id: 'task-1',
      action: 'stage_rejected',
      details: { rejection_kind: 'outright', note: 'Rebuild it' },
      created_at: '2026-07-10T10:00:00.000Z',
    })).toEqual({ kind: 'outright', note: 'Rebuild it' });

    expect(getTaskRejectionActivityDisplay({
      task_id: 'task-1',
      action: 'stage_rejected',
      details: '{"rejection_kind":"outright","note":"Legacy note"}',
      created_at: '2026-07-10T10:00:00.000Z',
    })).toEqual({ kind: 'revision', note: 'Legacy note' });
  });
});
