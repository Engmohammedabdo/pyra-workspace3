import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { QUOTE_APPROVAL_FIELDS } from '@/lib/supabase/fields';
import { generateId } from '@/lib/utils/id';
import { notifyQuoteApproved, notifyQuoteRejected } from '@/lib/email/notify';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/dashboard/sales/approvals/[id]
 * Approve or reject a quote approval request.
 * Body: { action: 'approve' | 'reject', comments?: string }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireApiPermission('quote_approvals.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { action, comments } = body;

  if (!action || !['approve', 'reject'].includes(action)) {
    return apiError('الإجراء يجب أن يكون approve أو reject');
  }

  // Get the approval record
  const { data: approval, error: fetchError } = await supabase
    .from('pyra_quote_approvals')
    .select(`${QUOTE_APPROVAL_FIELDS}, quote_id`)
    .eq('id', id)
    .single();

  if (fetchError || !approval) return apiError('طلب الموافقة غير موجود', 404);
  if (approval.status !== 'pending') return apiError('تم الرد على هذا الطلب مسبقاً');

  const newApprovalStatus = action === 'approve' ? 'approved' : 'rejected';
  // When approved: quote goes to draft (ready to be sent)
  // When rejected: quote goes to rejected
  const newQuoteStatus = action === 'approve' ? 'draft' : 'rejected';

  // Update approval record
  const { data: updated, error: updateError } = await supabase
    .from('pyra_quote_approvals')
    .update({
      status: newApprovalStatus,
      approved_by: auth.pyraUser.username,
      comments: comments || null,
      responded_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(QUOTE_APPROVAL_FIELDS)
    .single();

  if (updateError) return apiServerError(updateError.message);

  // Update quote status
  await supabase
    .from('pyra_quotes')
    .update({
      status: newQuoteStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', approval.quote_id);

  // Log activity
  await supabase.from('pyra_activity_log').insert({
    id: generateId('log'),
    action_type: action === 'approve' ? 'quote_approved' : 'quote_rejected',
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    target_path: `/quotes/${approval.quote_id}`,
    details: { approval_id: id, comments },
    ip_address: request.headers.get('x-forwarded-for') || 'unknown',
  });

  // Internal notification to the sales agent who requested approval
  if (approval.requested_by) {
    // Get quote number for notification
    const { data: quoteInfo } = await supabase
      .from('pyra_quotes')
      .select('quote_number')
      .eq('id', approval.quote_id)
      .single();
    const quoteNumber = quoteInfo?.quote_number || '';

    void supabase.from('pyra_notifications').insert({
      id: generateId('nt'),
      recipient_username: approval.requested_by,
      type: action === 'approve' ? 'quote_approved' : 'quote_rejected',
      title: action === 'approve' ? 'تمت الموافقة على عرض السعر' : 'تم رفض عرض السعر',
      message: action === 'approve'
        ? `تمت الموافقة على عرض السعر ${quoteNumber}${comments ? ` — ${comments}` : ''}`
        : `تم رفض عرض السعر ${quoteNumber}${comments ? ` — السبب: ${comments}` : ''}`,
      source_username: auth.pyraUser.username,
      source_display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/quotes/${approval.quote_id}`,
      is_read: false,
    });

    // Email notification (fire-and-forget)
    if (action === 'approve') {
      notifyQuoteApproved({
        requestedBy: approval.requested_by,
        quoteNumber,
        approvedBy: auth.pyraUser.display_name || auth.pyraUser.username,
        quoteId: approval.quote_id,
        comments,
      });
    } else {
      notifyQuoteRejected({
        requestedBy: approval.requested_by,
        quoteNumber,
        rejectedBy: auth.pyraUser.display_name || auth.pyraUser.username,
        quoteId: approval.quote_id,
        comments,
      });
    }
  }

  return apiSuccess(updated);
}
