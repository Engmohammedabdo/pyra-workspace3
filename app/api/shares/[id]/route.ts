import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';

// =============================================================
// PATCH /api/shares/[id]
// Update share link (deactivate, change expiry, password, notification)
// Only the creator or an admin can modify a share link.
// Body: { is_active?, expires_at?, password?, notification_email?, max_downloads? }
// =============================================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    // Verify link exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_share_links')
      .select('id, created_by, is_active')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('رابط المشاركة غير موجود');
    }

    // IDOR check: only the creator or admin can modify
    const isOwner = existing.created_by === auth.pyraUser.username;
    const isAdmin = auth.pyraUser.role === 'admin';

    if (!isOwner && !isAdmin) {
      return apiError('ليس لديك صلاحية لتعديل رابط المشاركة هذا', 403);
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Deactivate
    if (typeof body.is_active === 'boolean') {
      updates.is_active = body.is_active;
    }

    // Update expiry
    if (body.expires_at !== undefined) {
      updates.expires_at = body.expires_at;
    }

    // Update max downloads
    if (body.max_downloads !== undefined) {
      updates.max_access = body.max_downloads ? Number(body.max_downloads) : 0;
    }

    // Update password (empty string removes protection)
    if (body.password !== undefined) {
      if (body.password && typeof body.password === 'string' && body.password.trim()) {
        updates.password_hash = await bcrypt.hash(body.password.trim(), 10);
      } else {
        updates.password_hash = null;
      }
    }

    // Update notification email (empty string removes notification)
    if (body.notification_email !== undefined) {
      updates.notification_email = body.notification_email?.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return apiError('لا توجد تعديلات', 400);
    }

    const { data: updated, error } = await supabase
      .from('pyra_share_links')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Share link update error:', error);
      return apiServerError();
    }

    return apiSuccess(updated);
  } catch (err) {
    console.error('PATCH /api/shares/[id] error:', err);
    return apiServerError();
  }
}
