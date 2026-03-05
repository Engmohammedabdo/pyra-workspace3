import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import bcrypt from 'bcryptjs';
import { canAccessPath } from '@/lib/auth/file-access';
// =============================================================
// GET /api/shares
// List share links for a file (excludes token from response)
// Query: ?path=file_path
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiPermission('files.share');
    if (isApiError(authResult)) return authResult;
    const auth = authResult;

    const filePath = request.nextUrl.searchParams.get('path')?.trim();

    if (!filePath) {
      return apiValidationError('مسار الملف مطلوب');
    }

    // Path-based access control
    if (!canAccessPath(auth, filePath)) {
      return apiForbidden();
    }

    const supabase = await createServerSupabaseClient();

    // Note: token excluded from select to prevent exposure in list response
    // password_hash is replaced with has_password boolean in response
    const { data: links, error } = await supabase
      .from('pyra_share_links')
      .select('id, file_path, file_name, created_by, created_by_display, expires_at, max_access, access_count, is_active, created_at, password_hash, notification_email')
      .eq('file_path', filePath)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Share links list error:', error);
      return apiServerError();
    }

    // Map password_hash to has_password boolean (don't expose hash)
    const safeLinks = (links || []).map(({ password_hash, ...rest }) => ({
      ...rest,
      has_password: !!password_hash,
    }));

    return apiSuccess(safeLinks);
  } catch (err) {
    console.error('GET /api/shares error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/shares
// Create a share link
// Body: { file_path, expires_in_hours?, max_downloads?, password?, notification_email? }
// Returns: full share link data including token (only on creation)
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiPermission('files.share');
    if (isApiError(authResult)) return authResult;
    const auth = authResult;

    const body = await request.json();
    const { file_path, expires_in_hours, max_downloads, password, notification_email } = body;

    // Validation
    if (!file_path?.trim()) {
      return apiValidationError('مسار الملف مطلوب');
    }

    // Path-based access control
    if (!canAccessPath(auth, file_path.trim())) {
      return apiForbidden();
    }

    const supabase = await createServerSupabaseClient();

    const token = generateId('sh');

    // Calculate expiry
    let expiresAt: string | null = null;
    if (expires_in_hours && Number(expires_in_hours) > 0) {
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + Number(expires_in_hours));
      expiresAt = expiryDate.toISOString();
    }

    // Extract file name from path
    const fileName = file_path.trim().split('/').pop() || 'file';

    // Calculate default expiry if not provided (7 days)
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 7);
    const finalExpiresAt = expiresAt || defaultExpiry.toISOString();

    // Hash password if provided
    let passwordHash: string | null = null;
    if (password && typeof password === 'string' && password.trim()) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    // Validate notification email if provided
    const notifEmail = notification_email?.trim() || null;

    const { data: shareLink, error } = await supabase
      .from('pyra_share_links')
      .insert({
        id: generateId('sl'),
        file_path: file_path.trim(),
        file_name: fileName,
        token,
        created_by: auth.pyraUser.username,
        created_by_display: auth.pyraUser.display_name,
        expires_at: finalExpiresAt,
        max_access: max_downloads ? Number(max_downloads) : 0,
        access_count: 0,
        is_active: true,
        password_hash: passwordHash,
        notification_email: notifEmail,
      })
      .select()
      .single();

    if (error) {
      console.error('Share link create error:', error);
      return apiServerError();
    }

    return apiSuccess(shareLink, undefined, 201);
  } catch (err) {
    console.error('POST /api/shares error:', err);
    return apiServerError();
  }
}
