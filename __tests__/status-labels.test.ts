import { describe, it, expect } from 'vitest';
import arStatuses from '@/messages/ar/statuses.json';
import enStatuses from '@/messages/en/statuses.json';
import {
  INVOICE_STATUS_LABELS, QUOTE_STATUS_LABELS, CONTRACT_STATUS_LABELS,
  EXPENSE_STATUS_LABELS, LEAVE_STATUS_LABELS, PAYROLL_STATUS_LABELS,
  PO_STATUS_LABELS, CREDIT_NOTE_STATUS_LABELS, SUBSCRIPTION_STATUS_LABELS,
  PAYMENT_METHOD_LABELS, BILLING_CYCLE_LABELS, EMPLOYEE_PAYMENT_STATUS_LABELS,
  EVALUATION_STATUS_LABELS, CONTENT_PIPELINE_STATUS_LABELS, FOLLOW_UP_STATUS_LABELS,
  CLIENT_STATUS_LABELS, LEAD_STATUS_LABELS, PIPELINE_STAGE_LABELS_AR,
  LEAD_TYPE_LABELS, LEAD_DEAL_TYPE_LABELS, LEAD_BILLING_CYCLE_LABELS,
  LEAD_ACTIVITY_LABELS_AR, CONVERSATION_STATUS_LABELS, CONVERSATION_PRIORITY_LABELS,
  LEAD_TASK_STATUS_LABELS_AR, LEAD_TASK_PRIORITY_LABELS_AR,
  CALENDAR_EVENT_SOURCE_LABELS_AR, ATTENDANCE_STATUS_LABELS,
} from '@/lib/constants/statuses';

const LEGACY_TO_CATALOG: Array<[Record<string, string>, keyof typeof arStatuses.statuses]> = [
  [INVOICE_STATUS_LABELS, 'invoice'], [QUOTE_STATUS_LABELS, 'quote'],
  [CONTRACT_STATUS_LABELS, 'contract'], [EXPENSE_STATUS_LABELS, 'expense'],
  [LEAVE_STATUS_LABELS, 'leave'], [PAYROLL_STATUS_LABELS, 'payroll'],
  [PO_STATUS_LABELS, 'po'], [CREDIT_NOTE_STATUS_LABELS, 'creditNote'],
  [SUBSCRIPTION_STATUS_LABELS, 'subscription'], [PAYMENT_METHOD_LABELS, 'paymentMethod'],
  [BILLING_CYCLE_LABELS, 'billingCycle'], [EMPLOYEE_PAYMENT_STATUS_LABELS, 'employeePayment'],
  [EVALUATION_STATUS_LABELS, 'evaluation'], [CONTENT_PIPELINE_STATUS_LABELS, 'contentPipeline'],
  [FOLLOW_UP_STATUS_LABELS, 'followUp'], [CLIENT_STATUS_LABELS, 'client'],
  [LEAD_STATUS_LABELS, 'lead'], [PIPELINE_STAGE_LABELS_AR, 'pipelineStage'],
  [LEAD_TYPE_LABELS, 'leadType'], [LEAD_DEAL_TYPE_LABELS, 'leadDealType'],
  [LEAD_BILLING_CYCLE_LABELS, 'leadBillingCycle'], [LEAD_ACTIVITY_LABELS_AR, 'leadActivity'],
  [CONVERSATION_STATUS_LABELS, 'conversation'], [CONVERSATION_PRIORITY_LABELS, 'conversationPriority'],
  [LEAD_TASK_STATUS_LABELS_AR, 'leadTask'], [LEAD_TASK_PRIORITY_LABELS_AR, 'leadTaskPriority'],
  [CALENDAR_EVENT_SOURCE_LABELS_AR, 'calendarEventSource'], [ATTENDANCE_STATUS_LABELS, 'attendance'],
];

describe('statuses catalog extraction fidelity', () => {
  it.each(LEGACY_TO_CATALOG.map(([m, k]) => [k, m] as const))(
    'ar statuses.%s matches the legacy Arabic map verbatim',
    (catalogKey, legacyMap) => {
      expect(arStatuses.statuses[catalogKey]).toEqual(legacyMap);
    },
  );

  it('en mirrors ar key-structure exactly for every entity', () => {
    for (const [entity, arMap] of Object.entries(arStatuses.statuses)) {
      const enMap = (enStatuses.statuses as Record<string, Record<string, string>>)[entity];
      expect(enMap, `missing en entity: ${entity}`).toBeDefined();
      expect(Object.keys(enMap).sort()).toEqual(Object.keys(arMap).sort());
    }
  });
});
