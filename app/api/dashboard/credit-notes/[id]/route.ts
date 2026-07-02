import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CREDIT_NOTE_FIELDS, CREDIT_NOTE_ITEM_FIELDS } from '@/lib/supabase/fields';
import { CREDIT_NOTE_STATUS } from '@/lib/constants/statuses';

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
    const allowedStatuses = [CREDIT_NOTE_STATUS.DRAFT, CREDIT_NOTE_STATUS.ISSUED, CREDIT_NOTE_STATUS.CANCELLED];
    if (!allowedStatuses.includes(status)) {
      return apiValidationError('حالة غير صالحة');
    }

    // Transition map keyed on the CURRENT status (finance audit 2026-07-02,
    // F-CN-GUARD): an APPLIED credit note already has a negative payment on
    // the invoice — resetting it to draft would allow a second apply (double
    // refund) or a delete that orphans the payment. APPLIED is terminal;
    // reversing requires a dedicated un-apply flow that reverses the payment.
    const CN_TRANSITIONS: Record<string, string[]> = {
      [CREDIT_NOTE_STATUS.DRAFT]: [CREDIT_NOTE_STATUS.ISSUED, CREDIT_NOTE_STATUS.CANCELLED],
      [CREDIT_NOTE_STATUS.ISSUED]: [CREDIT_NOTE_STATUS.DRAFT, CREDIT_NOTE_STATUS.CANCELLED],
      [CREDIT_NOTE_STATUS.APPLIED]: [],
      [CREDIT_NOTE_STATUS.CANCELLED]: [],
    };

    const { data: existing } = await supabase
      .from('pyra_credit_notes')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return apiNotFound();

    const allowedNext = CN_TRANSITIONS[existing.status] || [];
    if (!allowedNext.includes(status)) {
      return apiValidationError(`لا يمكن تغيير حالة الإشعار الدائن من "${existing.status}" إلى "${status}"`);
    }

    // Conditional update — if a concurrent apply flipped the status between
    // our read and this write, the .eq('status') filter makes it a no-op.
    const { data, error } = await supabase
      .from('pyra_credit_notes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', existing.status)
      .select(CREDIT_NOTE_FIELDS)
      .maybeSingle();

    if (error || !data) return apiValidationError('تغيّرت حالة الإشعار الدائن أثناء التعديل — أعد تحميل الصفحة');

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
    if (existing.status !== CREDIT_NOTE_STATUS.DRAFT) return apiValidationError('لا يمكن حذف إشعار دائن غير مسودة');

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
