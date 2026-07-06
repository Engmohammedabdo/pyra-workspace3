import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

const TEMPLATE_FIELDS =
  'id, name, name_ar, description, items, notes, terms_conditions, currency, tax_rate, discount_type, discount_value, is_default, created_by, created_at, updated_at';

/**
 * GET /api/quotes/templates
 * List all quote templates.
 */
export async function GET() {
  try {
    const auth = await requireApiPermission('quotes.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_quote_templates')
      .select(TEMPLATE_FIELDS)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      console.error('Quote templates list error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/quotes/templates error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/quotes/templates
 * Create a new quote template.
 */
export async function POST(request: NextRequest) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('quotes.create');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const { name, name_ar, description, items, notes, terms_conditions, currency, tax_rate, discount_type, discount_value, is_default } = body;

    if (!name?.trim()) {
      return apiValidationError(t('quotes.templateNameRequired'));
    }

    const supabase = createServiceRoleClient();

    // If setting as default, unset other defaults
    if (is_default) {
      await supabase
        .from('pyra_quote_templates')
        .update({ is_default: false })
        .eq('is_default', true);
    }

    const { data, error } = await supabase
      .from('pyra_quote_templates')
      .insert({
        id: generateId('qtpl'),
        name: name.trim(),
        name_ar: name_ar?.trim() || null,
        description: description?.trim() || null,
        items: items || [],
        notes: notes?.trim() || null,
        terms_conditions: terms_conditions || [],
        currency: currency || 'AED',
        tax_rate: tax_rate ?? 5,
        discount_type: discount_type || null,
        discount_value: discount_value || 0,
        is_default: is_default || false,
        created_by: auth.pyraUser.username,
      })
      .select(TEMPLATE_FIELDS)
      .single();

    if (error) {
      console.error('Quote template insert error:', error);
      return apiServerError();
    }

    
    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'quote_template_created', '/dashboard/quotes', { name: body.name });

return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/quotes/templates error:', err);
    return apiServerError();
  }
}
