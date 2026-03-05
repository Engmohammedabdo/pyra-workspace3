import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiError, apiUnauthorized } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const { id } = await params;
  const body = await req.json();
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase.from('pyra_leave_requests').select('*').eq('id', id).single();
  if (!existing) return apiNotFound('الطلب غير موجود');

  // Handle approval/rejection
  if (body.status === 'approved' || body.status === 'rejected') {
    if (!hasPermission(auth.pyraUser.rolePermissions, 'leave.approve')) {
      return apiError('غير مصرح بالاعتماد', 403);
    }

    const updates: Record<string, unknown> = {
      status: body.status,
      reviewed_by: auth.pyraUser.username,
      reviewed_at: new Date().toISOString(),
      review_note: body.review_note || null,
    };

    const { data, error } = await supabase.from('pyra_leave_requests').update(updates).eq('id', id).select().single();
    if (error) return apiServerError(error.message);

    // If approved, update leave balance
    if (body.status === 'approved') {
      const year = new Date(existing.start_date).getFullYear();
      const usedKey = `${existing.type}_used`;

      // Upsert balance
      const { data: balance } = await supabase
        .from('pyra_leave_balances')
        .select('*')
        .eq('username', existing.username)
        .eq('year', year)
        .single();

      if (balance) {
        await supabase
          .from('pyra_leave_balances')
          .update({ [usedKey]: ((balance as Record<string, unknown>)[usedKey] as number) + existing.days_count })
          .eq('username', existing.username)
          .eq('year', year);
      } else {
        await supabase
          .from('pyra_leave_balances')
          .insert({
            username: existing.username,
            year,
            [usedKey]: existing.days_count,
          });
      }
    }

    return apiSuccess(data);
  }

  // Cancel own pending request
  if (body.status === 'cancelled' && existing.username === auth.pyraUser.username && existing.status === 'pending') {
    const { error } = await supabase.from('pyra_leave_requests').delete().eq('id', id);
    if (error) return apiServerError(error.message);
    return apiSuccess({ deleted: true });
  }

  return apiError('عملية غير مدعومة', 400);
}
