import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/dashboard/evaluations/criteria
// List all evaluation criteria, ordered by sort_order.
// =============================================================
export async function GET(_req: NextRequest) {
  try {
    const auth = await requireApiPermission('evaluations.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_evaluation_criteria')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) return apiServerError(error.message);
    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/dashboard/evaluations/criteria error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/dashboard/evaluations/criteria
// Create a new evaluation criterion.
// Body: { name, name_ar, description?, weight?, category? }
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('evaluations.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json().catch(() => ({}));
    const { name, name_ar, description, weight, category } = body;

    if (!name || !name_ar) {
      return apiValidationError('الاسم والاسم بالعربية مطلوبان');
    }

    const supabase = createServiceRoleClient();
    const id = generateId('evc');

    // Get the max sort_order for auto-increment
    const { data: maxRow } = await supabase
      .from('pyra_evaluation_criteria')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextSortOrder = (maxRow?.sort_order || 0) + 1;

    const { data, error } = await supabase
      .from('pyra_evaluation_criteria')
      .insert({
        id,
        name,
        name_ar,
        description: description || null,
        weight: weight || 1.0,
        category: category || null,
        is_active: true,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);
    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/evaluations/criteria error:', err);
    return apiServerError();
  }
}
