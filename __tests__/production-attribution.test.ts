import { describe, expect, it } from 'vitest';
import { PRODUCTION_ATTRIBUTION_STATUS } from '@/lib/constants/production';
import { resolveProductionAttribution } from '@/lib/production/attribution';
import {
  buildTaskJourney,
  summarizeEmployee,
  type ProductionTaskInput,
  type StageEvent,
} from '@/lib/production/metrics';

const currentTask = {
  currentAssignees: ['current.user'],
  currentTaskCreatedAt: '2026-07-01T08:00:00.000000Z',
};

describe('production review attribution', () => {
  it('uses only the first-review snapshots for reviewed evidence', () => {
    expect(resolveProductionAttribution({
      ...currentTask,
      firstReviewEvent: {
        assignees_snapshot: ['snapshot.b', 'snapshot.a', 'snapshot.a'],
        task_created_at_snapshot: '2026-06-30T07:00:00.123456Z',
      },
    })).toEqual({
      status: PRODUCTION_ATTRIBUTION_STATUS.SNAPSHOT_VERIFIED,
      assignees: ['snapshot.a', 'snapshot.b'],
      visibilityAssignees: ['snapshot.a', 'snapshot.b'],
      taskCreatedAt: '2026-06-30T07:00:00.123456Z',
      metricsEligible: true,
    });
  });

  it('uses current assignees only while a task has no review event', () => {
    expect(resolveProductionAttribution({
      ...currentTask,
      firstReviewEvent: null,
    })).toEqual({
      status: PRODUCTION_ATTRIBUTION_STATUS.CURRENT_OPERATIONAL,
      assignees: ['current.user'],
      visibilityAssignees: ['current.user'],
      taskCreatedAt: currentTask.currentTaskCreatedAt,
      metricsEligible: true,
    });
  });

  it('restores legacy reviewed work to the corroborated first-review actor', () => {
    expect(resolveProductionAttribution({
      ...currentTask,
      firstReviewEvent: {
        moved_by: 'current.user',
        assignees_snapshot: null,
        task_created_at_snapshot: null,
      },
    })).toEqual({
      status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_ACTOR_VERIFIED,
      assignees: ['current.user'],
      visibilityAssignees: ['current.user'],
      taskCreatedAt: currentTask.currentTaskCreatedAt,
      metricsEligible: true,
    });
  });

  it.each([
    { moved_by: null, currentAssignees: ['current.user'], currentTaskCreatedAt: currentTask.currentTaskCreatedAt },
    { moved_by: 'other.user', currentAssignees: ['current.user'], currentTaskCreatedAt: currentTask.currentTaskCreatedAt },
    { moved_by: 'current.user', currentAssignees: ['other.user'], currentTaskCreatedAt: currentTask.currentTaskCreatedAt },
    { moved_by: 'current.user', currentAssignees: ['current.user'], currentTaskCreatedAt: 'not-an-instant' },
  ])('rejects an uncorroborated legacy review actor: %j', ({
    moved_by,
    currentAssignees,
    currentTaskCreatedAt,
  }) => {
    expect(resolveProductionAttribution({
      currentAssignees,
      currentTaskCreatedAt,
      firstReviewEvent: {
        moved_by,
        assignees_snapshot: null,
        task_created_at_snapshot: null,
      },
    })).toEqual({
      status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
      assignees: [],
      visibilityAssignees: currentAssignees,
      taskCreatedAt: null,
      metricsEligible: false,
    });
  });

  it.each([
    { assignees_snapshot: null, task_created_at_snapshot: '2026-06-30T07:00:00Z' },
    { assignees_snapshot: ['snapshot.user'], task_created_at_snapshot: null },
    { assignees_snapshot: ['snapshot.user', 42], task_created_at_snapshot: '2026-06-30T07:00:00Z' },
    { assignees_snapshot: ['snapshot.user'], task_created_at_snapshot: 'not-an-instant' },
  ])('keeps invalid or missing legacy snapshots explicitly unattributed: %j', (firstReviewEvent) => {
    expect(resolveProductionAttribution({
      ...currentTask,
      firstReviewEvent,
    })).toEqual({
      status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
      assignees: [],
      visibilityAssignees: ['current.user'],
      taskCreatedAt: null,
      metricsEligible: false,
    });
  });
});

describe('legacy-unverified metric guard', () => {
  it('keeps the journey visible while excluding it from delivery and quality metrics', () => {
    const task: ProductionTaskInput = {
      id: 'legacy-task',
      title: 'Legacy task',
      assignee: null,
      attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
      due_date: null,
      due_at: '2026-07-10T10:00:00.000000Z',
      production_deadline_exempt: false,
      created_at: '2026-07-01T08:00:00.000000Z',
      review_column_id: 'review',
      done_column_id: 'done',
    };
    const events: StageEvent[] = [
      {
        task_id: task.id,
        from_column_id: 'work',
        to_column_id: 'review',
        created_at: '2026-07-10T10:00:00.000001Z',
      },
      {
        task_id: task.id,
        from_column_id: 'review',
        to_column_id: 'done',
        created_at: '2026-07-11T10:00:00.000000Z',
      },
    ];

    const journey = buildTaskJourney(task, events);
    const metrics = summarizeEmployee(
      [journey],
      '2026-07',
      '2026-07-20T12:00:00.000000Z',
      [{ task_id: task.id, created_at: events[0].created_at, action: 'reject', kind: 'outright' }],
    );

    expect(journey.attribution_status).toBe(PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED);
    expect(journey.first_submitted_at).toBe(events[0].created_at);
    expect(metrics).toMatchObject({
      deliveries: 0,
      on_time_pct: null,
      late_count: 0,
      avg_rounds: null,
      reviewed_task_count: 0,
      outright_rejection_rate: null,
    });
  });

  it('includes actor-verified legacy work in productivity while respecting deadline eligibility', () => {
    const task: ProductionTaskInput = {
      id: 'actor-verified-task',
      title: 'Actor verified task',
      assignee: 'current.user',
      attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_ACTOR_VERIFIED,
      due_date: '2026-07-10',
      due_at: '2026-07-10T10:00:00.000000Z',
      production_deadline_exempt: false,
      created_at: '2026-07-01T08:00:00.000000Z',
      review_column_id: 'review',
      done_column_id: 'done',
    };
    const events: StageEvent[] = [
      {
        task_id: task.id,
        from_column_id: 'work',
        to_column_id: 'review',
        created_at: '2026-07-10T10:00:00.000001Z',
      },
      {
        task_id: task.id,
        from_column_id: 'review',
        to_column_id: 'done',
        created_at: '2026-07-11T10:00:00.000000Z',
      },
    ];

    const journey = buildTaskJourney(task, events);
    const metrics = summarizeEmployee(
      [journey],
      '2026-07',
      '2026-07-20T12:00:00.000000Z',
      [{ task_id: task.id, created_at: events[1].created_at, action: 'approve', kind: null }],
    );

    expect(journey).toMatchObject({
      attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_ACTOR_VERIFIED,
      delivery_eligible: true,
      on_time: false,
    });
    expect(metrics).toMatchObject({
      deliveries: 1,
      on_time_eligible_count: 1,
      late_count: 1,
      reviewed_task_count: 1,
    });
  });
});
