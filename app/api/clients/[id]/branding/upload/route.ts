import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sanitizeFileName } from '@/lib/utils/path';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/clients/[id]/branding/upload
 * Upload a branding image (logo, favicon, or login background).
 * Admin only.
 *
 * FormData: { file: File, field: 'logo' | 'favicon' | 'login_background' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('clients.edit');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const field = formData.get('field') as string | null;

    if (!file || !(file instanceof File)) {
      return apiValidationError('الملف مطلوب');
    }

    if (!field || !['logo', 'favicon', 'login_background'].includes(field)) {
      return apiValidationError('نوع الحقل غير صالح');
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiValidationError('حجم الملف يجب أن يكون أقل من 5 ميجابايت');
    }

    if (!file.type.startsWith('image/')) {
      return apiValidationError('يجب أن يكون الملف صورة');
    }

    const supabase = createServiceRoleClient();

    // Get client company for folder path
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('company')
      .eq('id', id)
      .maybeSingle();

    if (!client) {
      return apiValidationError('العميل غير موجود');
    }

    // Build storage path: clients/{company-slug}/branding/{field}.{ext}
    const companySlug = sanitizeFileName(client.company.trim())
      .replace(/\s+/g, '-')
      .toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `${field}.${ext}`;
    const storagePath = `clients/${companySlug}/branding/${fileName}`;

    // Convert File to buffer for Supabase upload
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage (upsert to replace existing)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Branding upload error:', uploadError);
      return apiServerError('فشل في رفع الملف');
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    return apiSuccess({ url: publicUrl, path: storagePath }, undefined, 201);
  } catch (err) {
    console.error('POST /api/clients/[id]/branding/upload error:', err);
    return apiServerError();
  }
}
