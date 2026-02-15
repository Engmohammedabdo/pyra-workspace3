import { NextRequest, NextResponse } from 'next/server';
import {
  apiNotFound,
  apiError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPassword } from '@/lib/utils/password';
import { shareDownloadLimiter, checkRateLimit } from '@/lib/utils/rate-limit';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// =============================================================
// GET /api/shares/download/[token]
// Public download via share token — NO AUTH REQUIRED
// =============================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate limit public downloads (no auth — most exposed endpoint)
    const limited = checkRateLimit(shareDownloadLimiter, request);
    if (limited) return limited;

    const { token } = await params;
    const supabase = createServiceRoleClient();

    // Find share link by token
    const { data: shareLink, error: fetchError } = await supabase
      .from('pyra_share_links')
      .select('*')
      .eq('token', token)
      .single();

    if (fetchError || !shareLink) {
      return apiNotFound('رابط المشاركة غير موجود أو غير صالح');
    }

    // Validate: is_active
    if (!shareLink.is_active) {
      return apiError('رابط المشاركة غير نشط', 410);
    }

    // Validate: not expired
    if (shareLink.expires_at) {
      const now = new Date();
      const expiresAt = new Date(shareLink.expires_at);
      if (now > expiresAt) {
        // Deactivate the expired link
        await supabase
          .from('pyra_share_links')
          .update({ is_active: false })
          .eq('id', shareLink.id);

        return apiError('انتهت صلاحية رابط المشاركة', 410);
      }
    }

    // Validate: max_downloads not exceeded
    if (
      shareLink.max_downloads !== null &&
      shareLink.download_count >= shareLink.max_downloads
    ) {
      // Deactivate the link
      await supabase
        .from('pyra_share_links')
        .update({ is_active: false })
        .eq('id', shareLink.id);

      return apiError('تم الوصول إلى الحد الأقصى لعدد التحميلات', 410);
    }

    // Validate password if set (timing-safe comparison via scrypt)
    if (shareLink.password_hash) {
      const providedPassword = request.nextUrl.searchParams.get('password') || '';
      if (!verifyPassword(providedPassword, shareLink.password_hash)) {
        return apiError('كلمة المرور غير صحيحة', 403);
      }
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(shareLink.file_path);

    if (downloadError || !fileData) {
      console.error('Share download error:', downloadError);
      return apiServerError('فشل في تحميل الملف');
    }

    // Increment download count
    await supabase
      .from('pyra_share_links')
      .update({ download_count: shareLink.download_count + 1 })
      .eq('id', shareLink.id);

    // Extract filename from path
    const fileName = shareLink.file_path.split('/').pop() || 'download';

    // Determine content type
    const contentType = fileData.type || 'application/octet-stream';

    // Stream the file
    const buffer = Buffer.from(await fileData.arrayBuffer());

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('GET /api/shares/download/[token] error:', err);
    return apiServerError();
  }
}
