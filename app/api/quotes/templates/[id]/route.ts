import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';

type RouteContext = { params: Promise<{ id: string }> };

const TEMPLATE_FIELDS =
  'id, name, name_ar, description, items, notes, terms_conditions, currency, tax_rate, discount_type, discount_value, is_default, created_by, created_at, updated_at';

/**
 * GET /api/quotes/templates/[id]
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('quotes.view');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_quote_templates')
      .select(TEMPLATE_FIELDS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Quote template fetch error:', error);
      return apiServerError();
    }
    if (!data) return apiNotFound('القالب غير موجود');

    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'quote_template_updated', '/dashboard/quotes', { id });

    return apiSuccess(data);
  } catch (err) {
    console.error('GET /api/quotes/templates/[id] error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/quotes/templates/[id]
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('quotes.edit');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const body = await request.json();
    const supabase = createServiceRoleClient();

    const { data: existing } = await supabase
      .from('pyra_quote_templates')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return apiNotFound('القالب غير موجود');

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) {
      if (!body.name?.trim()) return apiValidationError('اسم القالب مطلوب');
      updates.name = body.name.trim();
    }
    if (body.name_ar !== undefined) updates.name_ar = body.name_ar?.trim() || null;
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.items !== undefined) updates.items = body.items;
    if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;
    if (body.terms_conditions !== undefined) updates.terms_conditions = body.terms_conditions;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.tax_rate !== undefined) updates.tax_rate = body.tax_rate;
    if (body.discount_type !== undefined) updates.discount_type = body.discount_type || null;
    if (body.discount_value !== undefined) updates.discount_value = body.discount_value || 0;

    if (body.is_default !== undefined) {
      if (body.is_default) {
        await supabase
          .from('pyra_quote_templates')
          .update({ is_default: false })
          .eq('is_default', true);
      }
      updates.is_default = body.is_default;
    }

    const { data, error } = await supabase
      .from('pyra_quote_templates')
      .update(updates)
      .eq('id', id)
      .select(TEMPLATE_FIELDS)
      .single();

    if (error) {
      console.error('Quote template update error:', error);
      return apiServerError();
    }

    return apiSuccess(data);
  } catch (err) {
    console.error('PATCH /api/quotes/templates/[id] error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/quotes/templates/[id]
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('quotes.delete');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('pyra_quote_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Quote template delete error:', error);
      return apiServerError();
    }

    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'quote_template_deleted', '/dashboard/quotes', { id });

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/quotes/templates/[id] error:', err);
    return apiServerError();
  }
}
