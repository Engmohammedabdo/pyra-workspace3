import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiNotFound, apiServerError, apiForbidden } from '@/lib/api/response';
import { evolutionClient } from '@/lib/evolution/client';

/**
 * GET /api/dashboard/sales/whatsapp/media/[messageId]
 *
 * Proxies WhatsApp media through our server.
 * Evolution API URLs (mmg.whatsapp.net) expire quickly and require auth headers
 * that browsers can't provide. This endpoint fetches via Evolution API's
 * getBase64FromMediaMessage and streams the result.
 *
 * Caches base64 result in the message's metadata.cached_media field to avoid
 * re-fetching from Evolution API on subsequent requests.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { messageId } = await params;
    const supabase = createServiceRoleClient();

    // Get message from DB
    const { data: message, error } = await supabase
      .from('pyra_whatsapp_messages')
      .select('id, message_id, message_type, media_url, instance_name, conversation_id, metadata')
      .eq('id', messageId)
      .single();

    if (error || !message) return apiNotFound('الرسالة غير موجودة');

    // Check agent can access this conversation
    if (message.conversation_id) {
      const { data: conv } = await supabase
        .from('pyra_whatsapp_conversations')
        .select('assigned_to')
        .eq('id', message.conversation_id)
        .single();

      const isAdmin = auth.pyraUser.rolePermissions.includes('*');
      if (!isAdmin && conv?.assigned_to !== auth.pyraUser.username) {
        return apiForbidden();
      }
    }

    // Check if we have cached base64 in metadata
    const metadata = (message.metadata || {}) as Record<string, unknown>;
    if (metadata.cached_media) {
      const cached = metadata.cached_media as { base64: string; mimetype: string };
      const buffer = Buffer.from(cached.base64, 'base64');
      return new Response(buffer, {
        headers: {
          'Content-Type': cached.mimetype || 'application/octet-stream',
          'Cache-Control': 'private, max-age=86400', // cache 24h
        },
      });
    }

    // Fetch from Evolution API using message_id (the WhatsApp message key)
    const waMessageId = message.message_id;
    if (!waMessageId) {
      // Fallback: try to proxy the original URL directly
      if (message.media_url) {
        try {
          const resp = await fetch(message.media_url);
          if (resp.ok) {
            const blob = await resp.arrayBuffer();
            return new Response(blob, {
              headers: {
                'Content-Type': resp.headers.get('Content-Type') || 'application/octet-stream',
                'Cache-Control': 'private, max-age=3600',
              },
            });
          }
        } catch { /* fall through */ }
      }
      return apiNotFound('لا يمكن تحميل الوسائط');
    }

    const instanceName = message.instance_name || 'pyraai';
    const mediaData = await evolutionClient.getMediaBase64(instanceName, waMessageId);

    if (!mediaData?.base64) {
      return apiNotFound('فشل في تحميل الوسائط من واتساب');
    }

    // Cache in DB for future requests (fire-and-forget)
    void supabase
      .from('pyra_whatsapp_messages')
      .update({
        metadata: { ...metadata, cached_media: { base64: mediaData.base64, mimetype: mediaData.mimetype } },
      })
      .eq('id', messageId);

    const buffer = Buffer.from(mediaData.base64, 'base64');
    return new Response(buffer, {
      headers: {
        'Content-Type': mediaData.mimetype || 'application/octet-stream',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[GET /api/whatsapp/media] error:', err);
    return apiServerError();
  }
}
