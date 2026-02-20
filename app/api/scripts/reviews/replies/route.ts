import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';

/**
 * GET /api/scripts/reviews/replies?review_id=xxx
 *
 * Admin endpoint — list all replies for a given review.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const reviewId = request.nextUrl.searchParams.get('review_id');
    if (!reviewId) return apiValidationError('review_id مطلوب');

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('pyra_script_review_replies')
      .select('*')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[api/scripts/reviews/replies] GET error:', error.message);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('[api/scripts/reviews/replies] GET unexpected:', err);
    return apiServerError();
  }
}

/**
 * POST /api/scripts/reviews/replies
 *
 * Admin endpoint — add a reply to a review.
 * Body: { review_id, message }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

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
      .select('id, filename, client_id, client_name, video_number, version')
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
        sender_type: 'admin',
        sender_name: auth.pyraUser.display_name,
        message: message.trim(),
      })
      .select('*')
      .single();

    if (error) {
      console.error('[api/scripts/reviews/replies] POST error:', error.message);
      return apiServerError();
    }

    // ── Notify client (fire-and-forget) ──
    void supabase.from('pyra_client_notifications').insert({
      id: generateId('cn'),
      client_id: review.client_id,
      type: 'script_reply',
      title: 'رد جديد على مراجعة السكريبت',
      message: `${auth.pyraUser.display_name} رد على ملاحظاتك في سكريبت فيديو #${String(review.video_number).padStart(2, '0')} (النسخة ${review.version})`,
      is_read: false,
    });

    // ── Activity log (fire-and-forget) ──
    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'script_reply_sent',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
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
    console.error('[api/scripts/reviews/replies] POST unexpected:', err);
    return apiServerError();
  }
}
