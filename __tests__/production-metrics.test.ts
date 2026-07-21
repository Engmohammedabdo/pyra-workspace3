import { describe, it, expect } from 'vitest';
import {
  buildTaskJourney,
  summarizeEmployee,
  type ProductionTaskInput,
  type QualityRejectionEvent,
  type StageEvent,
} from '@/lib/production/metrics';
import { lastNMonthKeys } from '@/lib/production/report';

const TASK: ProductionTaskInput = {
  id: 't1', title: 'فيديو تجريبي', assignee: 'wael.hany',
  due_date: '2026-07-10', due_at: null, created_at: '2026-07-01T08:00:00Z',
  review_column_id: 'col_prod_review', done_column_id: 'col_prod_done',
};

function ev(
  task_id: string,
  from: string | null,
  to: string,
  at: string,
  dueAtSnapshot?: string | null,
): StageEvent {
  return {
    task_id,
    from_column_id: from,
    to_column_id: to,
    created_at: at,
    due_at_snapshot: dueAtSnapshot,
  };
}

describe('buildTaskJourney', () => {
  it('computes first submission, rounds, delivery, and review waits', () => {
    const events = [
      ev('t1', 'col_prod_new', 'col_prod_wip', '2026-07-01T09:00:00Z'),
      ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z'),   // round 1
      ev('t1', 'col_prod_review', 'col_prod_wip', '2026-07-06T10:00:00Z'),   // rejected after 24h
      ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-07T10:00:00Z'),   // round 2
      ev('t1', 'col_prod_review', 'col_prod_approved', '2026-07-07T16:00:00Z'), // approved after 6h
      ev('t1', 'col_prod_approved', 'col_prod_done', '2026-07-08T09:00:00Z'),
    ];
    const j = buildTaskJourney(TASK, events);
    expect(j.first_submitted_at).toBe('2026-07-05T10:00:00Z');
    expect(j.review_rounds).toBe(2);
    expect(j.delivered_at).toBe('2026-07-08T09:00:00Z');
    expect(j.review_wait_hours).toEqual([24, 6]);
    expect(j.on_time).toBe(true);   // submitted 07-05 <= due 07-10
    expect(j.delay_days).toBeNull();
    expect(j.days_to_first_submission).toBeCloseTo(4.1, 1);
  });

  it('uses the first review snapshot and treats equality with its exact instant as on time', () => {
    const dueAt = '2026-07-10T10:00:00.000Z';
    const j = buildTaskJourney(
      { ...TASK, due_at: '2026-07-11T10:00:00.000Z' },
      [ev('t1', 'col_prod_wip', 'col_prod_review', dueAt, dueAt)],
    );

    expect(j.effective_due_at).toBe(dueAt);
    expect(j.review_entry_timestamps).toEqual([dueAt]);
    expect(j.delivery_eligible).toBe(true);
    expect(j.delivery_exclusion).toBeNull();
    expect(j.on_time).toBe(true);
    expect(j.delay_days).toBeNull();
  });

  it('marks a submission one millisecond after its exact deadline late', () => {
    const dueAt = '2026-07-10T10:00:00.000Z';
    const j = buildTaskJourney(
      { ...TASK, due_at: dueAt },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T10:00:00.001Z', dueAt)],
    );

    expect(j.on_time).toBe(false);
    expect(j.delay_days).toBeCloseTo(0, 1);
  });

  it('excludes a task with less than 24 exact hours of lead time', () => {
    const j = buildTaskJourney(
      {
        ...TASK,
        created_at: '2026-07-09T10:00:00.000Z',
        due_at: '2026-07-10T09:59:59.999Z',
      },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T09:00:00.000Z')],
    );

    expect(j.delivery_eligible).toBe(false);
    expect(j.delivery_exclusion).toBe('lead_time_under_24h');
    expect(j.on_time).toBe(true);
  });

  it('keeps exactly 24 exact hours of lead time eligible', () => {
    const j = buildTaskJourney(
      {
        ...TASK,
        created_at: '2026-07-09T10:00:00.000Z',
        due_at: '2026-07-10T10:00:00.000Z',
      },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T09:00:00.000Z')],
    );

    expect(j.delivery_eligible).toBe(true);
    expect(j.delivery_exclusion).toBeNull();
  });

  it('uses deterministic Dubai day end only for legacy date-only deadlines', () => {
    const j = buildTaskJourney(
      { ...TASK, due_at: null },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T19:59:59.999Z')],
    );

    expect(j.effective_due_at).toBe('2026-07-10T19:59:59.999Z');
    expect(j.on_time).toBe(true);
  });

  it('keeps a missing deadline unscored and explicitly excluded', () => {
    const j = buildTaskJourney(
      { ...TASK, due_date: null, due_at: null },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T10:00:00.000Z')],
    );

    expect(j.effective_due_at).toBeNull();
    expect(j.delivery_eligible).toBe(false);
    expect(j.delivery_exclusion).toBe('missing_deadline');
    expect(j.on_time).toBeNull();
  });

  it('flags late first submission with delay in days (Dubai day of submission)', () => {
    const events = [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-12T10:00:00Z')];
    const j = buildTaskJourney(TASK, events);
    expect(j.on_time).toBe(false);
    expect(j.delay_days).toBe(2); // 07-12 vs due 07-10
  });

  it('uses the DUBAI day for the on-time comparison (UTC 21:00 = next Dubai day)', () => {
    // 2026-07-10T21:00Z is 2026-07-11 in Dubai → late by 1 day
    const events = [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T21:00:00Z')];
    const j = buildTaskJourney(TASK, events);
    expect(j.on_time).toBe(false);
    expect(j.delay_days).toBe(1);
  });

  it('returns null on_time when there is no due date or no submission yet', () => {
    expect(buildTaskJourney({ ...TASK, due_date: null }, [
      ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z'),
    ]).on_time).toBeNull();
    expect(buildTaskJourney(TASK, []).on_time).toBeNull();
    expect(buildTaskJourney(TASK, []).review_rounds).toBe(0);
  });

  it('ignores events belonging to other tasks', () => {
    const events = [ev('OTHER', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z')];
    expect(buildTaskJourney(TASK, events).first_submitted_at).toBeNull();
  });

  it('consumes each decision once — consecutive review entries do not double-bind one decision', () => {
    const events = [
      ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z'),
      ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-05T12:00:00Z'), // duplicate entry, no leave between
      ev('t1', 'col_prod_review', 'col_prod_wip', '2026-07-06T10:00:00Z'), // single decision
    ];
    const j = buildTaskJourney(TASK, events);
    expect(j.review_rounds).toBe(2);           // entries still counted
    expect(j.review_wait_hours).toHaveLength(1); // ONE wait, not two
    expect(j.review_wait_hours[0]).toBe(24);     // paired to the FIRST unconsumed entry
  });
});

describe('summarizeEmployee', () => {
  const delivered = buildTaskJourney(TASK, [
    ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z'),
    ev('t1', 'col_prod_review', 'col_prod_approved', '2026-07-06T10:00:00Z'),
    ev('t1', 'col_prod_approved', 'col_prod_done', '2026-07-07T09:00:00Z'),
  ]);
  const lateTask = buildTaskJourney(
    { ...TASK, id: 't2', title: 'متأخر', due_date: '2026-07-02' },
    [ev('t2', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z')],
  );

  it('counts deliveries and on-time % for the month', () => {
    const s = summarizeEmployee([delivered, lateTask], '2026-07', '2026-07-20');
    expect(s.deliveries).toBe(1);
    expect(s.on_time_pct).toBe(50);   // t1 on time, t2 late
    expect(s.late_count).toBe(1);
    expect(s.avg_delay_days).toBe(3); // 07-05 vs 07-02
    expect(s.avg_rounds).toBe(1);     // only delivered tasks count
  });

  it('counts unique reviewed tasks and only structured outright rejections in the month', () => {
    const qualityEvents: QualityRejectionEvent[] = [
      { task_id: 't1', created_at: '2026-07-06T10:00:00Z', kind: 'outright' },
      { task_id: 't1', created_at: '2026-07-06T11:00:00Z', kind: 'outright' },
      { task_id: 't2', created_at: '2026-07-06T10:00:00Z', kind: 'revision' },
      { task_id: 'not-reviewed', created_at: '2026-07-06T10:00:00Z', kind: 'outright' },
      { task_id: 't2', created_at: '2026-06-30T10:00:00Z', kind: 'outright' },
    ];

    const s = summarizeEmployee([delivered, lateTask], '2026-07', '2026-07-20', qualityEvents);
    expect(s.reviewed_task_count).toBe(2);
    expect(s.outright_rejection_rate).toBe(50);
  });

  it('excludes tasks from other months', () => {
    const juneTask = buildTaskJourney(
      { ...TASK, id: 't3' },
      [
        ev('t3', 'col_prod_wip', 'col_prod_review', '2026-06-10T10:00:00Z'),
        ev('t3', 'col_prod_review', 'col_prod_done', '2026-06-12T10:00:00Z'),
      ],
    );
    const s = summarizeEmployee([juneTask], '2026-07', '2026-07-20');
    expect(s.deliveries).toBe(0);
    expect(s.on_time_pct).toBeNull();
  });

  it('counts open overdue tasks (due passed, never submitted)', () => {
    const openOverdue = buildTaskJourney(
      { ...TASK, id: 't4', due_date: '2026-07-01' },
      [],
    );
    const s = summarizeEmployee([openOverdue], '2026-07', '2026-07-20');
    expect(s.open_overdue).toBe(1);
  });

  it('does not count archived tasks as open overdue', () => {
    const archivedOverdue = buildTaskJourney(
      { ...TASK, id: 't5', due_date: '2026-07-01', is_archived: true },
      [],
    );
    const s = summarizeEmployee([archivedOverdue], '2026-07', '2026-07-20');
    expect(s.open_overdue).toBe(0);
  });
});

describe('lastNMonthKeys', () => {
  it('returns oldest-to-newest month keys through the anchor month', () => {
    expect(lastNMonthKeys(4, '2026-07')).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
  });

  it('crosses year boundaries', () => {
    expect(lastNMonthKeys(3, '2026-01')).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});
