import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError, apiNotFound, apiValidationError } from '@/lib/api/response';

// =============================================================
// PATCH /api/dashboard/leave-types/[id]
// Update a leave type (only provided fields).
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('leave.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json();

    // Only allow updating specific fields
    const allowedFields = [
      'name', 'name_ar', 'icon', 'color', 'default_days',
      'max_carry_over', 'requires_attachment', 'is_paid', 'sort_order',
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
      .from('pyra_leave_types')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return apiNotFound('نوع الإجازة غير موجود');
      return apiServerError(error.message);
    }

    return apiSuccess(data);
  } catch (err) {
    console.error('PATCH /api/dashboard/leave-types/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/dashboard/leave-types/[id]
// Soft-delete a leave type (set is_active = false).
// =============================================================
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('leave.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_leave_types')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return apiNotFound('نوع الإجازة غير موجود');
      return apiServerError(error.message);
    }

    return apiSuccess(data);
  } catch (err) {
    console.error('DELETE /api/dashboard/leave-types/[id] error:', err);
    return apiServerError();
  }
}
