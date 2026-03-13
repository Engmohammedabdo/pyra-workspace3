import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { evolutionClient } from '@/lib/evolution/client';
import { isSuperAdmin } from '@/lib/auth/rbac';

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.send');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { instance_name, number, text, media_url, media_type, mime_type, file_name, lead_id, client_id } = body;

  if (!number) return apiError('رقم الهاتف مطلوب');
  if (!text && !media_url) return apiError('محتوى الرسالة مطلوب');

  // Verify agent owns this instance (unless admin)
  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
  if (!isAdmin && instance_name) {
    const { data: inst } = await supabase
      .from('pyra_whatsapp_instances')
      .select('agent_username')
      .eq('instance_name', instance_name)
      .single();
    if (inst && inst.agent_username !== auth.pyraUser.username) {
      return apiError('ليس لديك صلاحية استخدام هذا الـ Instance', 403);
    }
  }

  // Determine which instance to use
  let instanceToUse = instance_name;
  if (!instanceToUse) {
    // Find agent's instance
    const { data: agentInstance } = await supabase
      .from('pyra_whatsapp_instances')
      .select('instance_name')
      .eq('agent_username', auth.pyraUser.username)
      .eq('status', 'connected')
      .single();
    if (!agentInstance) return apiError('لا يوجد Instance متصل لحسابك');
    instanceToUse = agentInstance.instance_name;
  }

  try {
    let response;
    let messageType = 'text';
    let content = text;

    if (media_url) {
      response = await evolutionClient.sendMedia(instanceToUse, {
        number,
        mediatype: media_type || 'document',
        mimetype: mime_type || 'application/pdf',
        media: media_url,
        caption: text || undefined,
        fileName: file_name,
      });
      messageType = media_type || 'document';
      content = text || file_name || media_url;
    } else {
      response = await evolutionClient.sendText(instanceToUse, { number, text });
    }

    // Normalize JID
    const remoteJid = response.key?.remoteJid || `${number.replace(/\D/g, '')}@s.whatsapp.net`;

    // Save to local database
    await supabase.from('pyra_whatsapp_messages').insert({
      id: generateId('wm'),
      instance_name: instanceToUse,
      remote_jid: remoteJid,
      lead_id: lead_id || null,
      client_id: client_id || null,
      message_id: response.key?.id || null,
      direction: 'outgoing',
      message_type: messageType,
      content,
      media_url: media_url || null,
      file_name: file_name || null,
      status: 'sent',
      timestamp: new Date().toISOString(),
    });

    return apiSuccess({ message_id: response.key?.id, status: 'sent' });
  } catch (err) {
    return apiServerError(`فشل إرسال الرسالة: ${err instanceof Error ? err.message : ''}`);
  }
}
