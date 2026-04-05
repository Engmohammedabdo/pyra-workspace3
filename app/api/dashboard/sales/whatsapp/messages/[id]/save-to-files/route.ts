import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';
import { evolutionClient } from '@/lib/evolution/client';

/**
 * POST /api/dashboard/sales/whatsapp/messages/[id]/save-to-files
 * Save a WhatsApp media message to the file index.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { id: messageId } = await params;
    const supabase = createServiceRoleClient();

    // Fetch the message
    const { data: msg, error: msgErr } = await supabase
      .from('pyra_whatsapp_messages')
      .select('*, pyra_whatsapp_conversations!left(client_id, instance_name)')
      .eq('id', messageId)
      .single();

    if (msgErr || !msg) return apiNotFound('الرسالة غير موجودة');

    const mediaTypes = ['image', 'document', 'audio', 'video'];
    if (!mediaTypes.includes(msg.message_type)) {
      return apiNotFound('الرسالة لا تحتوي على ملف');
    }

    // Try to get media via Evolution API (base64)
    let fileBuffer: Buffer | null = null;
    let mimeType = 'application/octet-stream';
    let fileName = msg.file_name || `whatsapp-${msg.message_type}-${Date.now()}`;

    if (msg.message_id && msg.instance_name) {
      const media = await evolutionClient.getMediaBase64(
        msg.instance_name,
        msg.message_id,
      );
      if (media?.base64) {
        fileBuffer = Buffer.from(media.base64, 'base64');
        mimeType = media.mimetype || mimeType;
      }
    }

    // If no base64, try fetching from media_url
    if (!fileBuffer && msg.media_url) {
      try {
        const res = await fetch(msg.media_url);
        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          fileBuffer = Buffer.from(arrayBuf);
          mimeType = res.headers.get('content-type') || mimeType;
        }
      } catch {
        // media_url may be expired
      }
    }

    if (!fileBuffer) {
      return apiNotFound('لا يمكن تحميل الملف — الرابط منتهي');
    }

    // Determine file extension
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/webm': '.webm',
      'application/pdf': '.pdf',
    };
    if (!fileName.includes('.')) {
      fileName += extMap[mimeType] || '';
    }

    // Upload to Supabase Storage
    const clientId = msg.pyra_whatsapp_conversations?.client_id || 'general';
    const storagePath = `whatsapp/${clientId}/${Date.now()}-${fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from('files')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadErr) {
      console.error('[save-to-files] Upload error:', uploadErr);
      return apiServerError('فشل رفع الملف');
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('files')
      .getPublicUrl(storagePath);

    // Create file index record
    const fileId = generateId('fi');
    await supabase.from('pyra_file_index').insert({
      id: fileId,
      name: fileName,
      storage_path: storagePath,
      public_url: urlData?.publicUrl || null,
      size_bytes: fileBuffer.length,
      mime_type: mimeType,
      uploaded_by: auth.pyraUser.username,
      client_id: clientId !== 'general' ? clientId : null,
      category: 'whatsapp',
      tags: ['whatsapp', msg.message_type],
    });

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'file_saved_from_whatsapp',
      `/dashboard/files/${fileId}`,
      { message_id: messageId, file_name: fileName },
    );

    return apiSuccess({
      id: fileId,
      name: fileName,
      url: urlData?.publicUrl,
    });
  } catch (err) {
    console.error('POST save-to-files error:', err);
    return apiServerError();
  }
}
