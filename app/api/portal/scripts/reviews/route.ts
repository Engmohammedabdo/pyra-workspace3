import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';

const ALLOWED_COMPANIES = ['injazat', 'إنجازات', 'etmam', 'إتمام'];
const SAFE_FILENAME = /^video-\d+-[\w-]+\.md$/i;

function isAuthorizedCompany(company: string | null): boolean {
  if (!company) return false;
  const lower = company.toLowerCase();
  return ALLOWED_COMPANIES.some((c) => lower.includes(c));
}

/**
 * GET /api/portal/scripts/reviews
 * Returns all script review records for the Etmam scripts.
 */
export async function GET() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();
    if (!isAuthorizedCompany(client.company)) return apiForbidden();

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('pyra_script_reviews')
      .select('id, filename, video_number, version, status, comment, client_name, reviewed_at, created_at, updated_at')
      .order('video_number', { ascending: true });

    if (error) {
      console.error('[portal/scripts/reviews] GET error:', error.message);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('[portal/scripts/reviews] GET unexpected:', err);
    return apiServerError();
  }
}

/**
 * POST /api/portal/scripts/reviews
 * Create or update a script review (upsert on filename).
 * Body: { filename, video_number, version, status, comment? }
 */
export async function POST(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();
    if (!isAuthorizedCompany(client.company)) return apiForbidden();

    const body = await request.json();
    const { filename, video_number, version, status, comment } = body;

    // ── Validate ──
    if (!filename || !SAFE_FILENAME.test(filename)) {
      return apiValidationError('اسم ملف غير صالح');
    }
    if (!['approved', 'revision_requested'].includes(status)) {
      return apiValidationError('حالة غير صالحة');
    }
    if (status === 'revision_requested') {
      if (!comment?.trim()) {
        return apiValidationError('التعليق مطلوب عند طلب التعديل');
      }
      if (comment.trim().length > 5000) {
        return apiValidationError('التعليق طويل جداً (الحد الأقصى 5000 حرف)');
      }
    }

    const now = new Date().toISOString();
    const supabase = createServiceRoleClient();

    // ── Upsert: check if exists ──
    const { data: existing } = await supabase
      .from('pyra_script_reviews')
      .select('id')
      .eq('filename', filename)
      .single();

    let review;

    if (existing) {
      const { data, error } = await supabase
        .from('pyra_script_reviews')
        .update({
          status,
          comment: comment?.trim() || null,
          client_id: client.id,
          client_name: client.name,
          reviewed_at: now,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select('id, filename, video_number, version, status, comment, client_name, reviewed_at, updated_at')
        .single();

      if (error) {
        console.error('[portal/scripts/reviews] update error:', error.message);
        return apiServerError();
      }
      review = data;
    } else {
      const { data, error } = await supabase
        .from('pyra_script_reviews')
        .insert({
          id: generateId('sr'),
          filename,
          video_number: video_number || 0,
          version: version || 1,
          status,
          comment: comment?.trim() || null,
          client_id: client.id,
          client_name: client.name,
          reviewed_at: now,
        })
        .select('id, filename, video_number, version, status, comment, client_name, reviewed_at, created_at')
        .single();

      if (error) {
        console.error('[portal/scripts/reviews] insert error:', error.message);
        return apiServerError();
      }
      review = data;
    }

    // ── Activity log (fire-and-forget) ──
    const actionType = status === 'approved' ? 'script_approved' : 'script_revision_requested';
    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: actionType,
      username: client.name,
      display_name: client.name,
      target_path: filename,
      details: {
        video_number,
        version,
        status,
        comment: comment?.trim() || null,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    }).then(({ error: logErr }) => {
      if (logErr) console.error('[activity-log] insert error:', logErr.message);
    });

    // ── Notify all admins (fire-and-forget) ──
    const notifTitle = status === 'approved'
      ? 'العميل اعتمد سكريبت'
      : 'العميل طلب تعديل سكريبت';
    const notifMessage = status === 'approved'
      ? `${client.name} اعتمد سكريبت فيديو #${String(video_number).padStart(2, '0')} (النسخة ${version})`
      : `${client.name} طلب تعديل سكريبت فيديو #${String(video_number).padStart(2, '0')} (النسخة ${version})`;
    Promise.resolve(
      supabase
        .from('pyra_users')
        .select('username')
        .eq('role', 'admin')
        .then(async ({ data: admins }) => {
          if (!admins?.length) return;
          const notifs = admins.map((a: { username: string }) => ({
            id: generateId('nt'),
            recipient_username: a.username,
            type: actionType,
            title: notifTitle,
            message: notifMessage,
            source_username: client.name,
            source_display_name: client.name,
            target_path: '/dashboard/script-reviews',
            is_read: false,
            created_at: now,
          }));
          const { error: nErr } = await supabase.from('pyra_notifications').insert(notifs);
          if (nErr) console.error('[portal/scripts/reviews] notify error:', nErr.message);
        })
    ).catch((err: unknown) => console.error('[portal/scripts/reviews] notification chain error:', err));

    return apiSuccess(review, undefined, existing ? 200 : 201);
  } catch (err) {
    console.error('[portal/scripts/reviews] POST unexpected:', err);
    return apiServerError();
  }
}
