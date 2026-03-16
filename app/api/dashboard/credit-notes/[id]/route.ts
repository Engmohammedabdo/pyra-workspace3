import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CREDIT_NOTE_FIELDS, CREDIT_NOTE_ITEM_FIELDS } from '@/lib/supabase/fields';

/**
 * GET /api/dashboard/credit-notes/[id]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('finance.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_credit_notes')
      .select(CREDIT_NOTE_FIELDS)
      .eq('id', id)
      .single();

    if (error || !data) return apiNotFound();

    // Fetch items
    const { data: items } = await supabase
      .from('pyra_credit_note_items')
      .select(CREDIT_NOTE_ITEM_FIELDS)
      .eq('credit_note_id', id)
      .order('sort_order', { ascending: true });

    return apiSuccess({ ...data, items: items || [] });
  } catch (err) {
    console.error('GET credit-note detail error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/dashboard/credit-notes/[id]
 * Update status (issue, cancel)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('finance.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json();
    const supabase = createServiceRoleClient();

    const { status } = body;
    const allowedStatuses = ['draft', 'issued', 'cancelled'];
    if (!allowedStatuses.includes(status)) return apiNotFound();

    const { data, error } = await supabase
      .from('pyra_credit_notes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(CREDIT_NOTE_FIELDS)
      .single();

    if (error || !data) return apiNotFound();

    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: `credit_note_${status}`,
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/credit-notes/${id}`,
      details: { credit_note_number: data.credit_note_number, status },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(data);
  } catch (err) {
    console.error('PATCH credit-note error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/dashboard/credit-notes/[id]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('finance.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // Only allow deleting drafts
    const { data: existing } = await supabase
      .from('pyra_credit_notes')
      .select('status, credit_note_number')
      .eq('id', id)
      .single();

    if (!existing) return apiNotFound();
    if (existing.status !== 'draft') return apiServerError('لا يمكن حذف إشعار دائن غير مسودة');

    const { error } = await supabase.from('pyra_credit_notes').delete().eq('id', id);
    if (error) throw error;

    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'credit_note_deleted',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/credit-notes`,
      details: { credit_note_number: existing.credit_note_number },
      ip_address: 'unknown',
    });

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE credit-note error:', err);
    return apiServerError();
  }
}
