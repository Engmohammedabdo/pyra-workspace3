import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPLOYEE_PAYMENT_STATUS } from '@/lib/constants/statuses';
import { logError } from '@/lib/observability/log-error';

/**
 * Mark employee payments as paid and propagate to source tasks.
 *
 * Used when a payroll run is paid. Service-role client required.
 *
 * Errors are logged, never thrown — settling pay must not break the
 * caller's response after the money action already succeeded.
 */
export async function markPaymentsPaidAndPropagate(
  supabase: SupabaseClient,
  paymentIds: string[],
): Promise<void> {
  if (!paymentIds.length) return;
  const nowIso = new Date().toISOString();

  const { error: payErr } = await supabase
    .from('pyra_employee_payments')
    .update({ status: EMPLOYEE_PAYMENT_STATUS.PAID, paid_at: nowIso })
    .in('id', paymentIds);
  if (payErr) logError({ error: payErr, metadata: { fn: 'markPaymentsPaidAndPropagate', step: 'payments', paymentIds } });

  // Propagate to source tasks for task-type payments
  const { data: rows, error: selErr } = await supabase
    .from('pyra_employee_payments')
    .select('source_id, source_type')
    .in('id', paymentIds)
    .eq('source_type', 'task')
    .not('source_id', 'is', null);
  if (selErr) {
    logError({ error: selErr, metadata: { fn: 'markPaymentsPaidAndPropagate', step: 'select-tasks' } });
    return;
  }

  const taskIds = [...new Set((rows || []).map((r: { source_id: string | null }) => r.source_id).filter(Boolean))] as string[];
  if (taskIds.length) {
    const { error: taskErr } = await supabase
      .from('pyra_tasks')
      .update({ payment_status: EMPLOYEE_PAYMENT_STATUS.PAID, updated_at: nowIso })
      .in('id', taskIds);
    if (taskErr) logError({ error: taskErr, metadata: { fn: 'markPaymentsPaidAndPropagate', step: 'tasks', taskIds } });
  }
}
