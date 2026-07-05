'use client';

import { useTranslations } from 'next-intl';

export type StatusEntity =
  | 'invoice' | 'quote' | 'contract' | 'expense' | 'leave' | 'payroll'
  | 'po' | 'creditNote' | 'subscription' | 'paymentMethod' | 'billingCycle'
  | 'employeePayment' | 'evaluation' | 'contentPipeline' | 'followUp'
  | 'client' | 'lead' | 'pipelineStage' | 'leadType' | 'leadDealType'
  | 'leadBillingCycle' | 'leadActivity' | 'conversation' | 'conversationPriority'
  | 'leadTask' | 'leadTaskPriority' | 'calendarEventSource' | 'attendance';

/**
 * Locale-aware status label lookup. Falls back to the raw status value when
 * a key is unknown (never throws in render paths).
 * Module phases 2–6 swap their *_STATUS_LABELS imports onto this.
 */
export function useStatusLabels(entity: StatusEntity): (status: string) => string {
  const t = useTranslations(`statuses.${entity}`);
  // Cast: status arrives as a runtime string (DB value); t.has() guards it.
  return (status: string) =>
    t.has(status as Parameters<typeof t>[0])
      ? t(status as Parameters<typeof t>[0])
      : status;
}
