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

// =============================================================
// GET /api/reviews
// List reviews for a file
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

    const { data: reviews, count, error } = await supabase
      .from('pyra_reviews')
      .select('*', { count: 'exact' })
      .eq('file_path', filePath)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Reviews list error:', error);
      return apiServerError();
    }

    return apiSuccess(reviews || [], {
      total: count ?? 0,
    });
  } catch (err) {
    console.error('GET /api/reviews error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/reviews
// Add a review (comment or approval)
// Body: { file_path, type, text, parent_id? }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { file_path, type, text, parent_id } = body;

    // Validation
    if (!file_path?.trim()) {
      return apiValidationError('مسار الملف مطلوب');
    }
    if (!type || !['comment', 'approval'].includes(type)) {
      return apiValidationError('نوع المراجعة يجب أن يكون comment أو approval');
    }
    if (!text?.trim()) {
      return apiValidationError('نص المراجعة مطلوب');
    }

    const supabase = await createServerSupabaseClient();

    const reviewId = generateId('r');

    const { data: review, error } = await supabase
      .from('pyra_reviews')
      .insert({
        id: reviewId,
        file_path: file_path.trim(),
        username: auth.pyraUser.username,
        display_name: auth.pyraUser.display_name,
        type,
        text: text.trim(),
        resolved: false,
        parent_id: parent_id?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Review create error:', error);
      return apiServerError();
    }

    return apiSuccess(review, undefined, 201);
  } catch (err) {
    console.error('POST /api/reviews error:', err);
    return apiServerError();
  }
}
