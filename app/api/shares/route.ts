import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
// Note: password protection for share links is not supported in current schema

// =============================================================
// GET /api/shares
// List share links for a file
// Query: ?path=file_path
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const filePath = request.nextUrl.searchParams.get('path')?.trim();

    if (!filePath) {
      return apiValidationError('مسار الملف مطلوب');
    }

    const supabase = await createServerSupabaseClient();

    const { data: links, error } = await supabase
      .from('pyra_share_links')
      .select('*')
      .eq('file_path', filePath)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Share links list error:', error);
      return apiServerError();
    }

    return apiSuccess(links || []);
  } catch (err) {
    console.error('GET /api/shares error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/shares
// Create a share link
// Body: { file_path, expires_in_hours?, max_downloads?, password? }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { file_path, expires_in_hours, max_downloads, password } = body;

    // Validation
    if (!file_path?.trim()) {
      return apiValidationError('مسار الملف مطلوب');
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
