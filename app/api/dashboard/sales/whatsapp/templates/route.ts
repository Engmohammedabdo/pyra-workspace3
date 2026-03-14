import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { WA_TEMPLATE_FIELDS } from '@/lib/supabase/fields';

/**
 * GET /api/dashboard/sales/whatsapp/templates
 * List all WhatsApp quick reply templates.
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_whatsapp_templates')
      .select(WA_TEMPLATE_FIELDS)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('WA templates list error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/dashboard/sales/whatsapp/templates error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/dashboard/sales/whatsapp/templates
 * Create a new quick reply template.
 * Body: { title, content, category?, shortcut? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.manage');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const { title, content, category, shortcut } = body;

    if (!title?.trim()) return apiValidationError('عنوان القالب مطلوب');
    if (!content?.trim()) return apiValidationError('محتوى القالب مطلوب');

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_whatsapp_templates')
      .insert({
        id: generateId('wt'),
        title: title.trim(),
        content: content.trim(),
        category: category?.trim() || 'general',
        shortcut: shortcut?.trim() || null,
        created_by: auth.pyraUser.username,
      })
      .select(WA_TEMPLATE_FIELDS)
      .single();

    if (error) {
      console.error('WA template insert error:', error);
      return apiServerError();
    }

    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/sales/whatsapp/templates error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/dashboard/sales/whatsapp/templates
 * Delete a template by ID (passed in body or query param).
 * Body: { id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.manage');
    if (isApiError(auth)) return auth;

    const body = await request.json().catch(() => ({}));
    const templateId = body.id || request.nextUrl.searchParams.get('id');

    if (!templateId) return apiValidationError('معرف القالب مطلوب');

    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('pyra_whatsapp_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      console.error('WA template delete error:', error);
      return apiServerError();
    }

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/dashboard/sales/whatsapp/templates error:', err);
    return apiServerError();
  }
}
