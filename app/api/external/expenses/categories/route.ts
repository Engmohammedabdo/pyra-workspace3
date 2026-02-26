import { NextRequest } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/external/expenses/categories
 * List all expense categories (id + name + name_ar).
 * The AI agent MUST use these categories — never invent new ones.
 * Auth: API key with 'expenses:read' permission
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'expenses:read')) return apiError('لا تملك صلاحية قراءة المصروفات', 403);

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_expense_categories')
      .select('id, name, name_ar')
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return apiSuccess(data || []);
  } catch {
    return apiServerError();
  }
}
