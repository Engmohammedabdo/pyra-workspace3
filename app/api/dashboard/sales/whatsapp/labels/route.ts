import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

/**
 * GET /api/dashboard/sales/whatsapp/labels
 * List all conversation labels.
 */
export async function GET() {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('pyra_conversation_labels')
      .select('id, name, name_ar, color, description, created_by, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Labels query error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('[GET /api/dashboard/sales/whatsapp/labels] error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/dashboard/sales/whatsapp/labels
 * Create a new conversation label.
 * Body: { name, name_ar, color, description? }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    const { name, name_ar, color, description } = body;

    if (!name || !color) {
      return apiValidationError('الاسم واللون مطلوبان');
    }

    const supabase = createServiceRoleClient();
    const id = generateId('cl');

    const { data, error } = await supabase
      .from('pyra_conversation_labels')
      .insert({
        id,
        name,
        name_ar: name_ar || name,
        color,
        description: description || null,
        created_by: auth.pyraUser.username,
      })
      .select()
      .single();

    if (error) {
      console.error('Create label error:', error);
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'label_created',
      '/dashboard/sales/whatsapp',
      { label_id: id, name }
    );

    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('[POST /api/dashboard/sales/whatsapp/labels] error:', err);
    return apiServerError();
  }
}

/**
 * PUT /api/dashboard/sales/whatsapp/labels
 * Update an existing label.
 * Body: { id, name?, name_ar?, color?, description? }
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return apiValidationError('معرف التسمية مطلوب');

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('pyra_conversation_labels')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update label error:', error);
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'label_updated',
      '/dashboard/sales/whatsapp',
      { label_id: id }
    );

    return apiSuccess(data);
  } catch (err) {
    console.error('[PUT /api/dashboard/sales/whatsapp/labels] error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/dashboard/sales/whatsapp/labels
 * Delete a label (cascades to assignments).
 * Body: { id }
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    const { id } = body;

    if (!id) return apiValidationError('معرف التسمية مطلوب');

    const supabase = createServiceRoleClient();

    // Remove assignments first
    await supabase
      .from('pyra_conversation_label_assignments')
      .delete()
      .eq('label_id', id);

    const { error } = await supabase
      .from('pyra_conversation_labels')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete label error:', error);
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'label_deleted',
      '/dashboard/sales/whatsapp',
      { label_id: id }
    );

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('[DELETE /api/dashboard/sales/whatsapp/labels] error:', err);
    return apiServerError();
  }
}
