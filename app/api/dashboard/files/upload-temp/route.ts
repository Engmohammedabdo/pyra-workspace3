import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';
const MAX_SIZE = 16 * 1024 * 1024; // 16MB

/**
 * POST /api/dashboard/files/upload-temp
 * Upload a temporary file (e.g. WhatsApp attachment).
 * Returns a public URL for the uploaded file.
 * Files are stored in a `_temp/` prefix and can be cleaned up periodically.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.send');
    if (isApiError(auth)) return auth;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return apiError('الملف مطلوب');
    if (file.size > MAX_SIZE) return apiError('حجم الملف أكبر من 16 ميجابايت');

    const ext = file.name.lastIndexOf('.') >= 0
      ? file.name.slice(file.name.lastIndexOf('.'))
      : '';
    const storagePath = `_temp/${generateId('tmp')}${ext}`;

    const storage = createServiceRoleClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await storage.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('Temp upload error:', uploadError);
      return apiServerError(`فشل رفع الملف: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = storage.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    return apiSuccess({
      url: urlData.publicUrl,
      path: storagePath,
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (err) {
    console.error('Upload temp error:', err);
    return apiServerError();
  }
}
