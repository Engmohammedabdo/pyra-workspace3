import { NextRequest, NextResponse } from 'next/server';
import {
  apiNotFound,
  apiError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { shareDownloadLimiter, checkRateLimit } from '@/lib/utils/rate-limit';
import { isPathSafe } from '@/lib/utils/path';
import bcrypt from 'bcryptjs';
import { sendEmail, emailTemplates } from '@/lib/email/mailer';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// =============================================================
// GET /api/shares/download/[token]
// Public download via share token — NO AUTH REQUIRED
// Accepts optional ?password= query param for password-protected shares
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
      .select('id, token, file_path, file_name, expires_at, max_access, access_count, is_active, password_hash, notification_email, created_by_display')
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

    // Validate: max_access not exceeded (0 = unlimited)
    if (
      shareLink.max_access > 0 &&
      shareLink.access_count >= shareLink.max_access
    ) {
      // Deactivate the link
      await supabase
        .from('pyra_share_links')
        .update({ is_active: false })
        .eq('id', shareLink.id);

      return apiError('تم الوصول إلى الحد الأقصى لعدد التحميلات', 410);
    }

    // Verify password if protected
    if (shareLink.password_hash) {
      const password = request.nextUrl.searchParams.get('password') || '';
      if (!password) {
        return apiError('كلمة المرور مطلوبة لتحميل هذا الملف', 403);
      }
      const isValid = await bcrypt.compare(password, shareLink.password_hash);
      if (!isValid) {
        return apiError('كلمة المرور غير صحيحة', 403);
      }
    }

    // Path traversal check on stored path
    if (!isPathSafe(shareLink.file_path)) {
      return apiError('مسار الملف غير صالح', 400);
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(shareLink.file_path);

    if (downloadError || !fileData) {
      console.error('Share download error:', downloadError);
      return apiServerError('فشل في تحميل الملف');
    }

    // Increment access count atomically (prevents race condition with concurrent downloads)
    const { error: rpcError } = await supabase.rpc('increment_share_access', {
      link_id: shareLink.id,
    });
    if (rpcError) {
      console.error('Share access count increment error:', rpcError);
    }

    // Send download notification email (fire-and-forget)
    if (shareLink.notification_email) {
      const fileName = shareLink.file_path.split('/').pop() || 'download';
      sendEmail({
        to: shareLink.notification_email,
        subject: `تم تحميل الملف "${fileName}" عبر رابط المشاركة`,
        html: emailTemplates.shareDownloaded({
          fileName,
          sharedBy: shareLink.created_by_display,
          downloadedAt: new Date().toISOString(),
        }),
      }).catch((err) => {
        console.error('[Share] Download notification email error:', err);
      });
    }

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
