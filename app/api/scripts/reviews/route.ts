import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiUnauthorized,
  apiServerError,
} from '@/lib/api/response';

/**
 * GET /api/scripts/reviews
 *
 * Admin endpoint — list all script reviews.
 * Supports optional filters: ?status=approved&video_number=1
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const videoNumber = searchParams.get('video_number');

    const supabase = createServiceRoleClient();
    let query = supabase
      .from('pyra_script_reviews')
      .select('*')
      .order('video_number', { ascending: true })
      .order('version', { ascending: true });

    if (status) query = query.eq('status', status);
    if (videoNumber) query = query.eq('video_number', parseInt(videoNumber));

    const { data, error } = await query;

    if (error) {
      console.error('[api/scripts/reviews] GET error:', error.message);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('[api/scripts/reviews] GET unexpected:', err);
    return apiServerError();
  }
}
