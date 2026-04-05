import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

/**
 * GET /api/dashboard/sales/whatsapp/campaigns
 * List all broadcast campaigns.
 */
export async function GET() {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('pyra_whatsapp_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET campaigns error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/dashboard/sales/whatsapp/campaigns
 * Create a new broadcast campaign.
 * Body: { name, message_template, contacts: [{phone, name}] }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.manage');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const { name, message_template, contacts } = body;

    if (!name || !message_template) {
      return apiValidationError('اسم الحملة والرسالة مطلوبين');
    }
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return apiValidationError('يجب إضافة جهات اتصال');
    }

    const supabase = createServiceRoleClient();
    const campaignId = generateId('camp');

    // Insert campaign
    const { error: campErr } = await supabase
      .from('pyra_whatsapp_campaigns')
      .insert({
        id: campaignId,
        name,
        message_template,
        status: 'draft',
        total_contacts: contacts.length,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        created_by: auth.pyraUser.username,
      });

    if (campErr) throw campErr;

    // Insert campaign contacts
    const contactRows = contacts.map((c: { phone: string; name?: string }) => ({
      id: generateId('cc'),
      campaign_id: campaignId,
      contact_phone: c.phone,
      contact_name: c.name || null,
      status: 'pending',
    }));

    const { error: contactErr } = await supabase
      .from('pyra_whatsapp_campaign_contacts')
      .insert(contactRows);

    if (contactErr) throw contactErr;

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'campaign_created',
      `/dashboard/sales/whatsapp-campaigns`,
      { campaign_id: campaignId, name, contacts_count: contacts.length },
    );

    return apiSuccess({ id: campaignId, name, total_contacts: contacts.length });
  } catch (err) {
    console.error('POST campaigns error:', err);
    return apiServerError();
  }
}
