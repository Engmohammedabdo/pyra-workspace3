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
