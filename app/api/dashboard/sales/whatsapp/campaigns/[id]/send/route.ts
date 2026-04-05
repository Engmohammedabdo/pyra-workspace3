import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';
import { evolutionClient } from '@/lib/evolution/client';

/**
 * POST /api/dashboard/sales/whatsapp/campaigns/[id]/send
 * Send a broadcast campaign. Rate-limited to 1 message per second.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // Fetch campaign
    const { data: campaign, error: campErr } = await supabase
      .from('pyra_whatsapp_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (campErr || !campaign) return apiNotFound('الحملة غير موجودة');

    if (campaign.status === 'sending' || campaign.status === 'completed') {
      return apiServerError('الحملة قيد الإرسال أو مكتملة');
    }

    // Update campaign status to sending
    await supabase
      .from('pyra_whatsapp_campaigns')
      .update({ status: 'sending', sent_at: new Date().toISOString() })
      .eq('id', id);

    // Fetch pending contacts
    const { data: contacts } = await supabase
      .from('pyra_whatsapp_campaign_contacts')
      .select('*')
      .eq('campaign_id', id)
      .eq('status', 'pending');

    if (!contacts || contacts.length === 0) {
      await supabase
        .from('pyra_whatsapp_campaigns')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);
      return apiSuccess({ sent: 0 });
    }

    // Determine instance name (use first available instance)
    const { data: instances } = await supabase
      .from('pyra_whatsapp_instances')
      .select('instance_name')
      .eq('status', 'connected')
      .limit(1);

    const instanceName = instances?.[0]?.instance_name || 'pyraai';

    // Send asynchronously with rate limiting
    let sentCount = 0;
    const sendBatch = async () => {
      for (const contact of contacts) {
        try {
          // Replace {{name}} placeholder
          const message = campaign.message_template.replace(
            /\{\{name\}\}/gi,
            contact.contact_name || '',
          );

          await evolutionClient.sendText(instanceName, {
            number: contact.contact_phone.replace(/\D/g, ''),
            text: message,
          });

          sentCount++;
          await supabase
            .from('pyra_whatsapp_campaign_contacts')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', contact.id);

          await supabase
            .from('pyra_whatsapp_campaigns')
            .update({ sent_count: sentCount })
            .eq('id', id);

          // Rate limit: 1 second delay
          await new Promise((r) => setTimeout(r, 1000));
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          await supabase
            .from('pyra_whatsapp_campaign_contacts')
            .update({ status: 'failed', error_message: errMsg })
            .eq('id', contact.id);
        }
      }

      // Mark campaign as completed
      await supabase
        .from('pyra_whatsapp_campaigns')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          sent_count: sentCount,
        })
        .eq('id', id);
    };

    // Fire and forget — don't block the response
    void sendBatch();

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'campaign_send_started',
      `/dashboard/sales/whatsapp-campaigns`,
      { campaign_id: id, total_contacts: contacts.length },
    );

    return apiSuccess({ started: true, total: contacts.length });
  } catch (err) {
    console.error('POST campaign send error:', err);
    return apiServerError();
  }
}
