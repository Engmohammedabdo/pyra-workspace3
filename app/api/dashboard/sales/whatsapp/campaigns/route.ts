import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';
import { chunk } from '@/lib/utils/chunk';
import {
  pickCampaignSender,
  windowFor,
  type CampaignInstanceLike,
  type SenderRejection,
} from '@/lib/whatsapp/campaign-policy';

/** Per-reason copy, shared with the send route's own refusals. */
const SENDER_ERRORS: Record<SenderRejection, string> = {
  no_line_designated: 'اختر خط الإرسال — لا يوجد خط افتراضي.',
  unknown_line: 'خط الإرسال المحدد غير موجود.',
  notification_line:
    'هذا هو خط إشعارات الموظفين ولا يجوز استخدامه للحملات — حظره يوقف إشعارات النظام كلها.',
  not_connected: 'خط الإرسال غير متصل حالياً.',
  missing_api_key: 'لا يوجد مفتاح API مخزّن لهذا الخط، وأي إرسال منه سيُرفض.',
};

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
    const campaigns = data || [];
    if (campaigns.length === 0) return apiSuccess([]);

    // Per-contact outcome breakdown. Read from the aggregate VIEW, never by
    // counting rows here: PostgREST caps a plain select at 1000 rows, so a
    // JS count would silently under-report any campaign past its 1000th
    // contact — and these numbers are what an operator uses to decide whether
    // a stalled campaign is broken or simply finished.
    const progressById = new Map<string, Record<string, number | string | null>>();
    for (const batch of chunk(campaigns.map((c) => c.id as string), 150)) {
      const { data: rows } = await supabase
        .from('pyra_whatsapp_campaign_progress')
        .select('*')
        .in('campaign_id', batch);
      for (const r of rows ?? []) progressById.set(r.campaign_id as string, r);
    }

    return apiSuccess(
      campaigns.map((c) => {
        const p = progressById.get(c.id as string);
        return {
          ...c,
          send_window: c.instance_name ? windowFor(c.instance_name as string) : null,
          progress: {
            total: Number(p?.total ?? c.total_contacts ?? 0),
            pending: Number(p?.pending ?? 0),
            sent: Number(p?.sent ?? 0),
            skipped: Number(p?.skipped ?? 0),
            invalid: Number(p?.invalid ?? 0),
            failed: Number(p?.failed ?? 0),
            replied: Number(p?.replied ?? 0),
            last_sent_at: (p?.last_sent_at as string | null) ?? null,
          },
        };
      }),
    );
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
    const { name, message_template, contacts, instance_name, daily_cap, segment_key } = body;

    if (!name || !message_template) {
      return apiValidationError('اسم الحملة والرسالة مطلوبين');
    }
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return apiValidationError('يجب إضافة جهات اتصال');
    }

    const supabase = createServiceRoleClient();

    // Validate the line HERE, not at send time. A campaign saved against an
    // unusable line looks ready in the list and only fails once someone
    // presses send on hundreds of contacts.
    const { data: instanceRows } = await supabase
      .from('pyra_whatsapp_instances')
      .select('instance_name, status, api_key, is_notification_line');
    const sender = pickCampaignSender(
      (instanceRows ?? []) as CampaignInstanceLike[],
      instance_name,
    );
    if (!sender.ok) return apiValidationError(SENDER_ERRORS[sender.reason]);
    if (!windowFor(sender.instance.instance_name)) {
      return apiValidationError(
        `لا توجد نافذة إرسال معرّفة للخط ${sender.instance.instance_name}.`,
      );
    }

    const cap = Number(daily_cap);
    if (!Number.isFinite(cap) || cap < 1 || cap > 120) {
      return apiValidationError('الحد اليومي يجب أن يكون بين 1 و 120 رسالة.');
    }

    const campaignId = generateId('camp');

    // Insert campaign
    const { error: campErr } = await supabase
      .from('pyra_whatsapp_campaigns')
      .insert({
        id: campaignId,
        name,
        message_template,
        status: 'draft',
        instance_name: sender.instance.instance_name,
        daily_cap: Math.floor(cap),
        segment_key: typeof segment_key === 'string' ? segment_key : null,
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
