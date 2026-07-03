import { describe, it, expect } from 'vitest';
import {
  buildTaskJourney,
  summarizeEmployee,
  type ProductionTaskInput,
  type StageEvent,
} from '@/lib/production/metrics';

const TASK: ProductionTaskInput = {
  id: 't1', title: 'فيديو تجريبي', assignee: 'wael.hany',
  due_date: '2026-07-10', created_at: '2026-07-01T08:00:00Z',
  review_column_id: 'col_prod_review', done_column_id: 'col_prod_done',
};

function ev(task_id: string, from: string | null, to: string, at: string): StageEvent {
  return { task_id, from_column_id: from, to_column_id: to, created_at: at };
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
});
