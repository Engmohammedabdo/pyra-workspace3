import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError, apiNotFound, apiValidationError } from '@/lib/api/response';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';

// =============================================================
// PATCH /api/hr/document-types/[id]
// Update a document type (only provided fields).
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('documents.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json();

    // Only allow updating specific fields
    const allowedFields = [
      'name', 'name_ar', 'requires_expiry', 'sort_order', 'is_active',
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError('لا توجد حقول لتحديثها');
    }

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_document_types')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return apiNotFound('نوع المستند غير موجود');
      return apiServerError(error.message);
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.DOCUMENT}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/hr/documents',
      { source: 'document_type_updated', id },
    );

    return apiSuccess(data);
  } catch (err) {
    console.error('PATCH /api/hr/document-types/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/hr/document-types/[id]
// Soft-delete a document type (set is_active = false).
// =============================================================
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('documents.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_document_types')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return apiNotFound('نوع المستند غير موجود');
      return apiServerError(error.message);
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.DOCUMENT}_${ACTIVITY_ACTIONS.DELETE}`,
      '/dashboard/hr/documents',
      { source: 'document_type_deleted', id },
    );

    return apiSuccess(data);
  } catch (err) {
    console.error('DELETE /api/hr/document-types/[id] error:', err);
    return apiServerError();
  }
}
