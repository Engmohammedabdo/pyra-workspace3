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

// =============================================================
// POST /api/dashboard/tasks/[id]/payment
// Create an employee payment record when a task is completed
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  if (task.payment_status === 'paid') {
    return apiError('تم دفع هذه المهمة بالفعل', 409);
  }

  // Create employee payment record using service role to bypass RLS
  const serviceClient = createServiceRoleClient();
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
      status: 'pending',
    })
    .select()
    .single();

  if (paymentError) {
    return apiServerError(paymentError.message);
  }

  // Update task payment_status to 'paid'
  const { error: updateError } = await serviceClient
    .from('pyra_tasks')
    .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateError) {
    return apiServerError(updateError.message);
  }

  return apiSuccess(payment);
}
