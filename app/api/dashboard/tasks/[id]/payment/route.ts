import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiNotFound,
  apiValidationError,
  apiError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { EMPLOYEE_PAYMENT_STATUS } from '@/lib/constants/statuses';
import { logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';

// =============================================================
// POST /api/dashboard/tasks/[id]/payment
// Create an employee payment record when a task is completed
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json();
    const { username } = body;

    if (!username) {
      return apiValidationError('اسم المستخدم مطلوب');
    }

    // Fetch the task
    const supabase = await createServerSupabaseClient();
    const { data: task, error: taskError } = await supabase
      .from('pyra_tasks')
      .select('id, title, payment_amount, payment_currency, payment_status')
      .eq('id', id)
      .single();

    if (taskError || !task) {
      return apiNotFound('المهمة غير موجودة');
    }

    // Verify the task has a payment amount
    if (!task.payment_amount || task.payment_amount <= 0) {
      return apiValidationError('المهمة لا تحتوي على مبلغ دفع');
    }

    // Verify the task is not already paid
    if (task.payment_status === EMPLOYEE_PAYMENT_STATUS.PAID) {
      return apiError('تم دفع هذه المهمة بالفعل', 409);
    }

    // Create employee payment record using service role to bypass RLS
    const serviceClient = createServiceRoleClient();

    // Block if a non-rejected payment already exists for this task.
    // We no longer flip the task to 'paid' on creation, so guard against
    // accidentally recording the same task payment twice.
    const { data: existingPayment } = await serviceClient
      .from('pyra_employee_payments')
      .select('id, status')
      .eq('source_id', task.id)
      .eq('source_type', 'task')
      .neq('status', EMPLOYEE_PAYMENT_STATUS.REJECTED)
      .maybeSingle();
    if (existingPayment) {
      return apiError('يوجد سجل دفع نشط لهذه المهمة بالفعل', 409);
    }

    const paymentId = generateId('ep');

    const { data: payment, error: paymentError } = await serviceClient
      .from('pyra_employee_payments')
      .insert({
        id: paymentId,
        username,
        source_type: 'task',
        source_id: task.id,
        description: task.title,
        amount: task.payment_amount,
        currency: task.payment_currency || 'AED',
        status: EMPLOYEE_PAYMENT_STATUS.PENDING,
      })
      .select()
      .single();

    if (paymentError) {
      return apiServerError(paymentError.message);
    }

    // Mark task payment as pending — it settles to 'paid' only when the
    // employee_payment is actually paid (manually or via a payroll run).
    const { error: updateError } = await serviceClient
      .from('pyra_tasks')
      .update({ payment_status: EMPLOYEE_PAYMENT_STATUS.PENDING, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      return apiServerError(updateError.message);
    }

    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'task_payment_created', '/dashboard/boards', { task_id: id });

    return apiSuccess(payment);

  } catch (err) {
    logError({ error: err, request: req, metadata: { route: 'tasks/payment' } });
    console.error('[POST /api/dashboard/tasks/[id]/payment] error:', err);
    return apiServerError();
  }
}
