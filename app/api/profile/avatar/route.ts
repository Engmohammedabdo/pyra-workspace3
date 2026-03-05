import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// POST /api/profile/avatar — Upload user avatar
// =============================================================
export async function POST(req: Request) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return apiValidationError('لم يتم اختيار ملف');

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return apiValidationError('حجم الملف يجب أن يكون أقل من 2 ميجابايت');
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return apiValidationError('يجب أن يكون الملف صورة');
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `avatars/${auth.pyraUser.username}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = await createServerSupabaseClient();

    const { error: uploadError } = await supabase.storage
      .from(process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      return apiServerError(uploadError.message);
    }

    const { data: { publicUrl } } = supabase.storage
      .from(process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace')
      .getPublicUrl(path);

    const { error: updateError } = await supabase
      .from('pyra_users')
      .update({ avatar_url: publicUrl })
      .eq('username', auth.pyraUser.username);

    if (updateError) {
      console.error('Avatar URL update error:', updateError);
      return apiServerError(updateError.message);
    }

    return apiSuccess({ avatar_url: publicUrl });
  } catch (err) {
    console.error('POST /api/profile/avatar error:', err);
    return apiServerError();
  }
}
