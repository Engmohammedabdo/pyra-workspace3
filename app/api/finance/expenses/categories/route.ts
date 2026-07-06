import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { EXPENSE_CATEGORY_FIELDS } from '@/lib/supabase/fields';
import { logActivity } from '@/lib/api/activity';

export async function GET() {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();

  try {
    const { data, error } = await supabase
      .from('pyra_expense_categories')
      .select(EXPENSE_CATEGORY_FIELDS)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return apiSuccess(data || []);
  } catch {
    return apiServerError();
  }
}

export async function POST(req: NextRequest) {
  const t = await getTranslations('api');
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();
    const { name, name_ar, icon, color } = body;

    if (!name) return apiError(t('finance.categoryNameRequired'), 422);

    // Get max sort_order
    const { data: maxSort } = await supabase
      .from('pyra_expense_categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const { data, error } = await supabase
      .from('pyra_expense_categories')
      .insert({
        id: generateId('ec'),
        name,
        name_ar,
        icon: icon || 'Tag',
        color: color || '#6b7280',
        is_default: false,
        sort_order: (maxSort?.sort_order ?? 0) + 1,
      })
      .select(EXPENSE_CATEGORY_FIELDS)
      .single();

    if (error) throw error;
    
    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'expense_category_created', '/dashboard/expenses', { name: body.name });

return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
