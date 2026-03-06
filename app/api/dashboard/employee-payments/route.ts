import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';

const VALID_SOURCE_TYPES = ['task', 'overtime', 'bonus', 'deduction'];

// =============================================================
// GET /api/dashboard/employee-payments
// List employee payments with optional filters.
// Query params: ?username=X&status=X&month=YYYY-MM
// Admin sees all, employees see only their own.
// =============================================================
export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('payroll.view');
    if (isApiError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'payroll.manage');

    const supabase = createServiceRoleClient();

    let query = supabase
      .from('pyra_employee_payments')
      .select('*, pyra_users(display_name)')
      .order('created_at', { ascending: false })
      .limit(200);

    // Non-admins can only see their own payments
    if (!canManage) {
      query = query.eq('username', auth.pyraUser.username);
    } else {
      // Admin can filter by username
      const usernameFilter = searchParams.get('username');
      if (usernameFilter) {
        query = query.eq('username', usernameFilter);
      }
    }

    // Filter by status
    const statusFilter = searchParams.get('status');
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    // Filter by month (YYYY-MM)
    const monthParam = searchParams.get('month');
    if (monthParam) {
      const parts = monthParam.split('-');
      if (parts.length === 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const startDate = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59`;
        query = query.gte('created_at', startDate).lte('created_at', endDate);
      }
    }

    const { data, error } = await query;

    if (error) return apiServerError(error.message);

    // Flatten nested pyra_users join so client gets flat display_name
    const flattened = (data || []).map((p: Record<string, unknown>) => ({
      ...p,
      display_name: (p as { pyra_users?: { display_name?: string } }).pyra_users?.display_name || null,
      pyra_users: undefined,
    }));

    return apiSuccess(flattened);
  } catch (err) {
    console.error('GET /api/dashboard/employee-payments error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/dashboard/employee-payments
// Create a manual payment entry (bonus, deduction, overtime, etc.)
// Body: { username, source_type, description, amount, currency? }
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('payroll.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    const { username, source_type, description, amount, currency } = body;

    // Validate required fields
    if (!username) {
      return apiValidationError('اسم المستخدم مطلوب');
    }
    if (!source_type || !VALID_SOURCE_TYPES.includes(source_type)) {
      return apiValidationError('نوع المصدر غير صالح — يجب أن يكون أحد: task, overtime, bonus, deduction');
    }
    if (!description) {
      return apiValidationError('الوصف مطلوب');
    }
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return apiValidationError('المبلغ مطلوب ويجب أن يكون رقماً');
    }

    const supabase = createServiceRoleClient();
    const paymentId = generateId('ep');

    const { data, error } = await supabase
      .from('pyra_employee_payments')
      .insert({
        id: paymentId,
        username,
        source_type,
        description,
        amount: Number(amount),
        currency: currency || 'AED',
        status: 'pending',
      })
      .select('*, pyra_users(display_name)')
      .single();

    if (error) return apiServerError(error.message);

    // Flatten nested pyra_users join for POST response too
    const flatData = data ? {
      ...data,
      display_name: (data as { pyra_users?: { display_name?: string } }).pyra_users?.display_name || null,
      pyra_users: undefined,
    } : data;

    // Activity log
    const { error: logErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'employee_payment_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/payroll',
      details: { payment_id: paymentId, username: username, source_type, amount: Number(amount) },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });
    if (logErr) console.error('Activity log error:', logErr);

    return apiSuccess(flatData, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/employee-payments error:', err);
    return apiServerError();
  }
}
