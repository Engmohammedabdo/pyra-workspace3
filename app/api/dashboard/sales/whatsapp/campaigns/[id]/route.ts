import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';

/**
 * GET /api/dashboard/sales/whatsapp/campaigns/[id]
 * Get a single campaign with its contacts.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { data: campaign, error } = await supabase
      .from('pyra_whatsapp_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !campaign) return apiNotFound('الحملة غير موجودة');

    const { data: contacts } = await supabase
      .from('pyra_whatsapp_campaign_contacts')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: true });

    return apiSuccess({ ...campaign, contacts: contacts || [] });
  } catch (err) {
    console.error('GET campaign error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/dashboard/sales/whatsapp/campaigns/[id]
 * Delete a campaign and its contacts.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // Delete contacts first
    await supabase
      .from('pyra_whatsapp_campaign_contacts')
      .delete()
      .eq('campaign_id', id);

    const { error } = await supabase
      .from('pyra_whatsapp_campaigns')
      .delete()
      .eq('id', id);

    if (error) throw error;

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'campaign_deleted',
      `/dashboard/sales/whatsapp-campaigns`,
      { campaign_id: id },
    );

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE campaign error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/dashboard/sales/whatsapp/campaigns/[id]
 * Body: { auto_resume: boolean }
 *
 * The human's stop / re-arm control for the drain cron. Clearing `auto_resume`
 * takes a campaign off the schedule without discarding its queue: pending
 * contacts stay pending, so pressing Send later picks up exactly where it
 * stopped. This is the ONLY way to stop a running programme from the UI —
 * without it, a campaign a human armed would keep resuming every day.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await request.json();
    if (typeof body?.auto_resume !== 'boolean') {
      return apiNotFound('auto_resume مطلوب');
    }

    const supabase = createServiceRoleClient();
    // Stopping must stop the run that is happening NOW, not just tomorrow's.
    // The drain also polls auto_resume, but writing status='paused' here ends
    // it at the next message instead of leaving the row 'sending' — which the
    // cron skips and no UI control could recover.
    const { data: current } = await supabase
      .from('pyra_whatsapp_campaigns')
      .select('status')
      .eq('id', id)
      .maybeSingle();

    const patch: Record<string, unknown> = { auto_resume: body.auto_resume };
    // Only a run that is actually in flight gets moved to 'paused'. A 'draft'
    // campaign has never started, and silently relabelling it 'paused' would
    // misreport it as interrupted work.
    if (body.auto_resume === false && current?.status === 'sending') {
      patch.status = 'paused';
    }

    const { data, error } = await supabase
      .from('pyra_whatsapp_campaigns')
      .update(patch)
      .eq('id', id)
      .neq('status', 'completed')
      .select('id, auto_resume, status')
      .single();

    if (error || !data) return apiNotFound('الحملة غير موجودة');

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      body.auto_resume ? 'campaign_auto_resume_on' : 'campaign_auto_resume_off',
      `/dashboard/sales/whatsapp-campaigns/${id}`,
      { campaign_id: id, auto_resume: body.auto_resume },
    );

    return apiSuccess(data);
  } catch (err) {
    return apiServerError(undefined, err, request);
  }
}
