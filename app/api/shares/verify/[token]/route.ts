import { NextRequest } from 'next/server';
import {
  apiSuccess,
  apiNotFound,
  apiError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { shareDownloadLimiter, checkRateLimit } from '@/lib/utils/rate-limit';

// =============================================================
// GET /api/shares/verify/[token]
// Public endpoint — validates a share token and returns file info
// (without actually downloading the file).
// =============================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const limited = checkRateLimit(shareDownloadLimiter, request);
    if (limited) return limited;

    const { token } = await params;
    const supabase = createServiceRoleClient();

    const { data: shareLink, error: fetchError } = await supabase
      .from('pyra_share_links')
      .select('id, file_path, file_name, expires_at, max_access, access_count, is_active, created_by_display, created_at')
      .eq('token', token)
      .single();

    if (fetchError || !shareLink) {
      return apiNotFound('رابط المشاركة غير موجود أو غير صالح');
    }

    if (!shareLink.is_active) {
      return apiError('رابط المشاركة غير نشط', 410);
    }

    if (shareLink.expires_at) {
      const now = new Date();
      const expiresAt = new Date(shareLink.expires_at);
      if (now > expiresAt) {
        await supabase
          .from('pyra_share_links')
          .update({ is_active: false })
          .eq('id', shareLink.id);
        return apiError('انتهت صلاحية رابط المشاركة', 410);
      }
    }

    if (
      shareLink.max_access > 0 &&
      shareLink.access_count >= shareLink.max_access
    ) {
      await supabase
        .from('pyra_share_links')
        .update({ is_active: false })
        .eq('id', shareLink.id);
      return apiError('تم الوصول إلى الحد الأقصى لعدد التحميلات', 410);
    }

    // Get file size from index
    const { data: fileInfo } = await supabase
      .from('pyra_file_index')
      .select('file_size, mime_type')
      .eq('file_path', shareLink.file_path)
      .single();

    return apiSuccess({
      file_name: shareLink.file_name,
      file_size: fileInfo?.file_size ?? null,
      mime_type: fileInfo?.mime_type ?? null,
      shared_by: shareLink.created_by_display,
      created_at: shareLink.created_at,
      expires_at: shareLink.expires_at,
      downloads_remaining:
        shareLink.max_access > 0
          ? shareLink.max_access - shareLink.access_count
          : null,
    });
  } catch (err) {
    console.error('GET /api/shares/verify/[token] error:', err);
    return apiServerError();
  }
}
