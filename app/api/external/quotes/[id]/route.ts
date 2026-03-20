import { NextRequest } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { QUOTE_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/external/quotes/[id]
 * Get a single quote with items.
 * Auth: API key with 'quotes:read' permission
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'quotes:read')) return apiError('لا تملك صلاحية قراءة عروض الأسعار', 403);

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: quote, error } = await supabase
      .from('pyra_quotes')
      .select(QUOTE_FIELDS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('External quote fetch error:', error);
      return apiServerError();
    }
    if (!quote) return apiNotFound('عرض السعر غير موجود');

    const { data: items } = await supabase
      .from('pyra_quote_items')
      .select('id, quote_id, sort_order, description, quantity, rate, amount, created_at')
      .eq('quote_id', id)
      .order('sort_order', { ascending: true });

    return apiSuccess({ ...quote, items: items || [] });
  } catch (err) {
    console.error('GET /api/external/quotes/[id] error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/external/quotes/[id]
 * Update quote status from external source.
 * Auth: API key with 'quotes:create' permission
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'quotes:create')) return apiError('لا تملك صلاحية تعديل عروض الأسعار', 403);

    const { id } = await context.params;
    const body = await req.json();
    const supabase = createServiceRoleClient();

    const { data: existing } = await supabase
      .from('pyra_quotes')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return apiNotFound('عرض السعر غير موجود');

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // Only allow limited field updates from external API
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;

    const { data, error } = await supabase
      .from('pyra_quotes')
      .update(updates)
      .eq('id', id)
      .select(QUOTE_FIELDS)
      .single();

    if (error) {
      console.error('External quote update error:', error);
      return apiServerError();
    }

    return apiSuccess(data);
  } catch (err) {
    console.error('PATCH /api/external/quotes/[id] error:', err);
    return apiServerError();
  }
}
