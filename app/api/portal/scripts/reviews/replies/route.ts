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

function isAuthorizedCompany(company: string | null): boolean {
  if (!company) return false;
  const lower = company.toLowerCase();
  return ALLOWED_COMPANIES.some((c) => lower.includes(c));
}

/**
 * GET /api/portal/scripts/reviews/replies?review_id=xxx
 *
 * Portal endpoint — list all replies for a given review.
 */
export async function GET(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();
    if (!isAuthorizedCompany(client.company)) return apiForbidden();

    const reviewId = request.nextUrl.searchParams.get('review_id');
    if (!reviewId) return apiValidationError('review_id مطلوب');

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('pyra_script_review_replies')
      .select('*')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[portal/scripts/reviews/replies] GET error:', error.message);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('[portal/scripts/reviews/replies] GET unexpected:', err);
    return apiServerError();
  }
}

/**
 * POST /api/portal/scripts/reviews/replies
 *
 * Portal endpoint — client adds a reply to a review.
 * Body: { review_id, message }
 */
export async function POST(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();
    if (!isAuthorizedCompany(client.company)) return apiForbidden();

    const body = await request.json();
    const { review_id, message } = body;

    if (!review_id) return apiValidationError('review_id مطلوب');
    if (!message?.trim()) return apiValidationError('الرد مطلوب');
    if (message.trim().length > 5000) {
      return apiValidationError('الرد طويل جداً (الحد الأقصى 5000 حرف)');
    }

    const supabase = createServiceRoleClient();

    // Verify review exists
    const { data: review, error: reviewError } = await supabase
      .from('pyra_script_reviews')
      .select('id, filename, video_number, version')
      .eq('id', review_id)
      .single();

    if (reviewError || !review) {
      return apiValidationError('المراجعة غير موجودة');
    }

    // Insert reply
    const { data: reply, error } = await supabase
      .from('pyra_script_review_replies')
      .insert({
        id: generateId('rr'),
        review_id,
        sender_type: 'client',
        sender_name: client.name,
        message: message.trim(),
      })
      .select('*')
      .single();

    if (error) {
      console.error('[portal/scripts/reviews/replies] POST error:', error.message);
      return apiServerError();
    }

    // ── Notify all admins (fire-and-forget) ──
    supabase
      .from('pyra_users')
      .select('username')
      .then(async ({ data: admins }) => {
        if (!admins?.length) return;
        const notifs = admins.map((a: { username: string }) => ({
          id: generateId('nt'),
          recipient_username: a.username,
          type: 'script_client_reply',
          title: 'رد العميل على مراجعة السكريبت',
          message: `${client.name} رد على سكريبت فيديو #${String(review.video_number).padStart(2, '0')} (النسخة ${review.version})`,
          source_username: client.name,
          source_display_name: client.name,
          target_path: '/dashboard/script-reviews',
          is_read: false,
          created_at: new Date().toISOString(),
        }));
        const { error: nErr } = await supabase.from('pyra_notifications').insert(notifs);
        if (nErr) console.error('[portal/scripts/reviews/replies] notify error:', nErr.message);
      });

    // ── Activity log (fire-and-forget) ──
    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'script_client_reply',
      username: client.name,
      display_name: client.name,
      target_path: review.filename,
      details: {
        review_id,
        video_number: review.video_number,
        version: review.version,
        message: message.trim(),
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(reply, undefined, 201);
  } catch (err) {
    console.error('[portal/scripts/reviews/replies] POST unexpected:', err);
    return apiServerError();
  }
}
