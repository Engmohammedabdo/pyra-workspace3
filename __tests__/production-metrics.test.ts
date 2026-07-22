import { describe, it, expect } from 'vitest';
import {
  buildTaskJourney,
  summarizeEmployee,
  type ProductionTaskInput,
  type QualityReviewDecisionEvent,
  type StageEvent,
} from '@/lib/production/metrics';
import { lastNMonthKeys } from '@/lib/production/report';
import { isQualityBelowBand } from '@/lib/hr/deductions';

const TASK: ProductionTaskInput = {
  id: 't1', title: 'فيديو تجريبي', assignee: 'wael.hany',
  due_date: '2026-07-10', due_at: '2026-07-10T12:00:00Z',
  production_deadline_exempt: false,
  created_at: '2026-07-01T08:00:00Z',
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

  it('continues from an explicitly null snapshot to the current exact due_at', () => {
    const dueAt = '2026-07-10T10:00:00.000Z';
    const j = buildTaskJourney(
      { ...TASK, due_at: dueAt },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T10:00:00.001Z', null)],
    );

    expect(j.effective_due_at).toBe(dueAt);
    expect(j.on_time).toBe(false);
    expect(j.delay_days).toBe(0);
  });

  it('keeps valid six-digit PostgreSQL timestamps eligible', () => {
    const j = buildTaskJourney(
      {
        ...TASK,
        created_at: '2026-07-09T10:00:00.123456+00:00',
        due_at: '2026-07-10T10:00:00.123456+00:00',
      },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T09:00:00.123456+00:00')],
    );

    expect(j.delivery_eligible).toBe(true);
    expect(j.delivery_exclusion).toBeNull();
    expect(j.on_time).toBe(true);
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

  it('marks a submission one microsecond after its exact deadline late', () => {
    const dueAt = '2026-07-10T10:00:00.000000Z';
    const j = buildTaskJourney(
      { ...TASK, due_at: dueAt },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T10:00:00.000001Z', dueAt)],
    );

    expect(j.on_time).toBe(false);
    expect(j.delay_days).toBe(0);
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

  it('excludes a task whose lead time is one microsecond below 24 hours', () => {
    const j = buildTaskJourney(
      {
        ...TASK,
        created_at: '2026-07-09T10:00:00.000000Z',
        due_at: '2026-07-10T09:59:59.999999Z',
      },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T09:00:00.000000Z')],
    );

    expect(j.delivery_eligible).toBe(false);
    expect(j.delivery_exclusion).toBe('lead_time_under_24h');
  });

  it('keeps exactly 24 hours eligible when timestamps use six fractional digits', () => {
    const j = buildTaskJourney(
      {
        ...TASK,
        created_at: '2026-07-09T10:00:00.000001Z',
        due_at: '2026-07-10T10:00:00.000001Z',
      },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T09:00:00.000001Z')],
    );

    expect(j.delivery_eligible).toBe(true);
    expect(j.delivery_exclusion).toBeNull();
  });

  it('never converts a legacy date-only deadline into scoring evidence', () => {
    const j = buildTaskJourney(
      { ...TASK, due_at: null },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T19:59:59.999Z')],
    );

    expect(j.effective_due_at).toBeNull();
    expect(j.delivery_exclusion).toBe('missing_deadline');
    expect(j.on_time).toBeNull();
  });

  it('excludes provenance-marked deadlines even when current and snapshot instants exist', () => {
    const j = buildTaskJourney(
      {
        ...TASK,
        due_at: '2026-07-10T19:59:59.999Z',
        production_deadline_exempt: true,
      },
      [ev(
        't1',
        'col_prod_wip',
        'col_prod_review',
        '2026-07-10T19:00:00.000Z',
        '2026-07-10T19:59:59.999Z',
      )],
    );

    expect(j.production_deadline_exempt).toBe(true);
    expect(j.effective_due_at).toBeNull();
    expect(j.delivery_eligible).toBe(false);
    expect(j.delivery_exclusion).toBe('unverified_legacy_deadline');
    expect(j.on_time).toBeNull();
  });

  it('excludes the literal migration sentinel before its provenance flag is backfilled', () => {
    const j = buildTaskJourney(
      {
        ...TASK,
        due_date: '2026-07-10',
        due_at: '2026-07-10T19:59:59.999Z',
        production_deadline_exempt: false,
      },
      [ev(
        't1',
        'col_prod_wip',
        'col_prod_review',
        '2026-07-10T19:00:00.000Z',
        '2026-07-10T19:59:59.999Z',
      )],
    );

    expect(j.production_deadline_exempt).toBe(true);
    expect(j.effective_due_at).toBeNull();
    expect(j.delivery_eligible).toBe(false);
    expect(j.delivery_exclusion).toBe('unverified_legacy_deadline');
    expect(j.on_time).toBeNull();
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

  it('does not fall back when the selected review snapshot is present but invalid', () => {
    const j = buildTaskJourney(
      { ...TASK, due_at: '2026-07-10T10:00:00Z' },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T09:00:00Z', '2026-02-30T10:00:00Z')],
    );

    expect(j.effective_due_at).toBe('2026-02-30T10:00:00Z');
    expect(j.delivery_eligible).toBe(false);
    expect(j.delivery_exclusion).toBe('invalid_timestamp');
    expect(j.on_time).toBeNull();
    expect(j.delay_days).toBeNull();
  });

  it('does not fall back when the current exact due_at is present but invalid', () => {
    const j = buildTaskJourney(
      { ...TASK, due_at: '2026-07-21' },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T09:00:00Z')],
    );

    expect(j.effective_due_at).toBe('2026-07-21');
    expect(j.delivery_exclusion).toBe('invalid_timestamp');
    expect(j.delivery_eligible).toBe(false);
    expect(j.on_time).toBeNull();
  });

  it('withholds delivery evidence when the task creation or first submission timestamp is invalid', () => {
    const invalidCreated = buildTaskJourney(
      { ...TASK, created_at: '2026-07-21', due_at: '2026-07-22T10:00:00Z' },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-22T09:00:00Z')],
    );
    const invalidSubmitted = buildTaskJourney(
      { ...TASK, due_at: '2026-07-22T10:00:00Z' },
      [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-02-30T10:00:00Z')],
    );

    for (const journey of [invalidCreated, invalidSubmitted]) {
      expect(journey.delivery_exclusion).toBe('invalid_timestamp');
      expect(journey.delivery_eligible).toBe(false);
      expect(journey.on_time).toBeNull();
      expect(journey.delay_days).toBeNull();
    }
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
    expect(buildTaskJourney({ ...TASK, due_date: null, due_at: null }, [
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
    {
      ...TASK,
      id: 't2',
      title: 'متأخر',
      due_date: '2026-07-02',
      due_at: '2026-07-02T18:00:00.000Z',
    },
    [ev('t2', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z')],
  );

  it('counts deliveries and on-time % for the month', () => {
    const s = summarizeEmployee(
      [delivered, lateTask],
      '2026-07',
      '2026-07-20T12:00:00.000Z',
      [],
    );
    expect(s.deliveries).toBe(1);
    expect(s.on_time_count).toBe(1);
    expect(s.on_time_eligible_count).toBe(2);
    expect(s.on_time_pct).toBe(50);   // t1 on time, t2 late
    expect(s.late_count).toBe(1);
    expect(s.avg_delay_days).toBe(3); // 07-05 vs 07-02
    expect(s.avg_rounds).toBeNull(); // quality rounds require native review decisions
    expect(s.review_rounds_total).toBe(0);
  });

  it('excludes short-lead tasks from delivery aggregation while including exactly-24-hour tasks', () => {
    const shortLeadLate = buildTaskJourney(
      {
        ...TASK,
        id: 'short-lead',
        due_date: null,
        created_at: '2026-07-01T10:00:00Z',
        due_at: '2026-07-02T09:59:59.999Z',
      },
      [ev('short-lead', 'col_prod_wip', 'col_prod_review', '2026-07-02T10:00:00.000Z')],
    );
    const exactLeadOnTime = buildTaskJourney(
      {
        ...TASK,
        id: 'exact-lead',
        due_date: null,
        created_at: '2026-07-01T10:00:00Z',
        due_at: '2026-07-02T10:00:00.000Z',
      },
      [ev('exact-lead', 'col_prod_wip', 'col_prod_review', '2026-07-02T09:00:00.000Z')],
    );

    const s = summarizeEmployee(
      [shortLeadLate, exactLeadOnTime],
      '2026-07',
      '2026-07-20T12:00:00.000Z',
      [],
    );
    expect(shortLeadLate.delivery_eligible).toBe(false);
    expect(exactLeadOnTime.delivery_eligible).toBe(true);
    expect(s.on_time_pct).toBe(100);
    expect(s.late_count).toBe(0);
  });

  it('counts unique reviewed tasks and only structured outright rejections in the month', () => {
    const qualityEvents: QualityReviewDecisionEvent[] = [
      { task_id: 't1', created_at: '2026-07-06T10:00:00Z', action: 'reject', kind: 'outright' },
      { task_id: 't1', created_at: '2026-07-06T11:00:00Z', action: 'reject', kind: 'outright' },
      { task_id: 't2', created_at: '2026-07-06T10:00:00Z', action: 'reject', kind: 'revision' },
      { task_id: 'not-reviewed', created_at: '2026-07-06T10:00:00Z', action: 'reject', kind: 'outright' },
      { task_id: 't2', created_at: '2026-06-30T10:00:00Z', action: 'reject', kind: 'outright' },
    ];

    const s = summarizeEmployee(
      [delivered, lateTask],
      '2026-07',
      '2026-07-20T12:00:00.000Z',
      qualityEvents,
    );
    expect(s.reviewed_task_count).toBe(2);
    expect(s.outright_rejection_count).toBe(1);
    expect(s.outright_rejection_rate).toBe(50);
  });

  it('attributes a cross-month rejection to the month of its native decision', () => {
    const submittedInJuly = buildTaskJourney(
      { ...TASK, id: 'cross-month-review' },
      [
        ev(
          'cross-month-review',
          'col_prod_wip',
          'col_prod_review',
          '2026-07-31T19:00:00.000Z',
        ),
      ],
    );

    const august = summarizeEmployee(
      [submittedInJuly],
      '2026-08',
      '2026-08-20T12:00:00.000Z',
      [{
        task_id: 'cross-month-review',
        created_at: '2026-08-01T01:00:00.000Z',
        action: 'reject',
        kind: 'outright',
      }],
    );

    expect(august.reviewed_task_count).toBe(1);
    expect(august.outright_rejection_count).toBe(1);
    expect(august.outright_rejection_rate).toBe(100);
  });

  it('uses native decisions from one monthly cohort for average review rounds', () => {
    const submittedBeforeMonth = buildTaskJourney(
      { ...TASK, id: 'monthly-decision-cohort' },
      [
        ev(
          'monthly-decision-cohort',
          'col_prod_wip',
          'col_prod_review',
          '2026-07-31T19:00:00.000Z',
        ),
      ],
    );
    const decisions: QualityReviewDecisionEvent[] = [
      {
        task_id: 'monthly-decision-cohort',
        created_at: '2026-08-01T01:00:00.000Z',
        action: 'reject',
        kind: 'revision',
      },
      {
        task_id: 'monthly-decision-cohort',
        created_at: '2026-08-02T01:00:00.000Z',
        action: 'approve',
        kind: null,
      },
    ];

    const august = summarizeEmployee(
      [submittedBeforeMonth],
      '2026-08',
      '2026-08-20T12:00:00.000Z',
      decisions,
    );

    expect(august.reviewed_task_count).toBe(1);
    expect(august.review_rounds_total).toBe(2);
    expect(august.avg_rounds).toBe(2);
  });

  it('keeps the exact 2.02 review average for the quality threshold', () => {
    const journeys = Array.from({ length: 50 }, (_, index) => ({
      ...delivered,
      task_id: `round-boundary-${index}`,
      review_rounds: index === 0 ? 3 : 2,
    }));
    const decisions: QualityReviewDecisionEvent[] = journeys.flatMap((journey, index) =>
      Array.from({ length: index === 0 ? 3 : 2 }, () => ({
        task_id: journey.task_id,
        created_at: '2026-07-06T10:00:00Z',
        action: 'reject' as const,
        kind: 'revision' as const,
      })),
    );

    const metrics = summarizeEmployee(
      journeys,
      '2026-07',
      '2026-07-20T12:00:00.000Z',
      decisions,
    );

    expect(metrics.review_rounds_total).toBe(101);
    expect(metrics.reviewed_task_count).toBe(50);
    expect(metrics.review_rounds_total / metrics.reviewed_task_count).toBeCloseTo(2.02, 10);
    expect(metrics.avg_rounds).toBe(2); // display metric may stay rounded
    expect(isQualityBelowBand(metrics)).toBe(true);
  });

  it('keeps 8 of 41 outright rejections below the exact 20 percent threshold', () => {
    const journeys = Array.from({ length: 41 }, (_, index) => ({
      ...delivered,
      task_id: `rejection-boundary-${index}`,
      review_rounds: 1,
    }));
    const qualityEvents: QualityReviewDecisionEvent[] = journeys.map((journey, index) => ({
      task_id: journey.task_id,
      created_at: '2026-07-06T10:00:00Z',
      action: index < 8 ? 'reject' : 'approve',
      kind: index < 8 ? 'outright' : null,
    }));

    const metrics = summarizeEmployee(
      journeys,
      '2026-07',
      '2026-07-20T12:00:00.000Z',
      qualityEvents,
    );

    expect(metrics.outright_rejection_count).toBe(8);
    expect(metrics.reviewed_task_count).toBe(41);
    expect((metrics.outright_rejection_count / metrics.reviewed_task_count) * 100)
      .toBeCloseTo((8 / 41) * 100, 10);
    expect(metrics.outright_rejection_rate).toBe(20); // display metric may stay rounded
    expect(isQualityBelowBand(metrics)).toBe(false);
  });

  it('excludes tasks from other months', () => {
    const juneTask = buildTaskJourney(
      { ...TASK, id: 't3' },
      [
        ev('t3', 'col_prod_wip', 'col_prod_review', '2026-06-10T10:00:00Z'),
        ev('t3', 'col_prod_review', 'col_prod_done', '2026-06-12T10:00:00Z'),
      ],
    );
    const s = summarizeEmployee([juneTask], '2026-07', '2026-07-20T12:00:00.000Z', []);
    expect(s.deliveries).toBe(0);
    expect(s.on_time_pct).toBeNull();
  });

  it('counts open overdue tasks (due passed, never submitted)', () => {
    const openOverdue = buildTaskJourney(
      { ...TASK, id: 't4', due_date: '2026-07-01', due_at: '2026-07-01T12:00:00Z' },
      [],
    );
    const s = summarizeEmployee([openOverdue], '2026-07', '2026-07-20T12:00:00.000Z', []);
    expect(s.open_overdue).toBe(1);
  });

  it('counts an open task immediately after its exact deadline instant', () => {
    const openOverdue = buildTaskJourney(
      {
        ...TASK,
        id: 'exact-overdue',
        due_date: null,
        due_at: '2026-07-20T10:00:00.000Z',
      },
      [],
    );

    const s = summarizeEmployee(
      [openOverdue],
      '2026-07',
      '2026-07-20T10:00:00.001Z',
      [],
    );

    expect(s.open_overdue).toBe(1);
  });

  it('does not count an open task as overdue at exact deadline equality', () => {
    const dueAt = '2026-07-20T10:00:00.000Z';
    const exactlyDue = buildTaskJourney(
      {
        ...TASK,
        id: 'exact-equality',
        due_date: '2026-07-19',
        due_at: dueAt,
      },
      [],
    );

    const s = summarizeEmployee([exactlyDue], '2026-07', dueAt, []);

    expect(s.open_overdue).toBe(0);
  });

  it('never marks a legacy date-only deadline overdue without exact provenance', () => {
    const legacy = buildTaskJourney(
      {
        ...TASK,
        id: 'legacy-deadline',
        due_date: '2026-07-20',
        due_at: null,
      },
      [],
    );

    const atEquality = summarizeEmployee(
      [legacy],
      '2026-07',
      '2026-07-20T19:59:59.999Z',
      [],
    );
    const immediatelyAfter = summarizeEmployee(
      [legacy],
      '2026-07',
      '2026-07-20T20:00:00.000Z',
      [],
    );

    expect(atEquality.open_overdue).toBe(0);
    expect(immediatelyAfter.open_overdue).toBe(0);
  });

  it('does not count archived tasks as open overdue', () => {
    const archivedOverdue = buildTaskJourney(
      {
        ...TASK,
        id: 't5',
        due_date: '2026-07-01',
        due_at: '2026-07-01T12:00:00Z',
        is_archived: true,
      },
      [],
    );
    const s = summarizeEmployee([archivedOverdue], '2026-07', '2026-07-20T12:00:00.000Z', []);
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
