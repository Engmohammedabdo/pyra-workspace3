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
import { EMPLOYEE_PAYMENT_STATUS } from '@/lib/constants/statuses';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';

const VALID_SOURCE_TYPES = ['task', 'overtime', 'bonus', 'deduction', 'commission'];

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
      .select('*')
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

    // Enrich with display_name from pyra_users
    const usernames = [...new Set((data || []).map((p: { username: string }) => p.username))];
    const { data: users } = usernames.length > 0
      ? await supabase.from('pyra_users').select('username, display_name').in('username', usernames)
      : { data: [] };
    const userMap = new Map((users || []).map((u: { username: string; display_name: string }) => [u.username, u.display_name]));

    const enriched = (data || []).map((p: Record<string, unknown>) => ({
      ...p,
      display_name: userMap.get(p.username as string) || p.username,
    }));

    return apiSuccess(enriched);
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
        status: EMPLOYEE_PAYMENT_STATUS.PENDING,
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
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.EMPLOYEE_PAYMENT}_${ACTIVITY_ACTIONS.CREATE}`,
      '/dashboard/payroll',
      { payment_id: paymentId, username: username, source_type, amount: Number(amount), source: 'employee_payment_created' },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    return apiSuccess(flatData, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/employee-payments error:', err);
    return apiServerError();
  }
}
