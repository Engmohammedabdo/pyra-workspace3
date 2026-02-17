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
// GET /api/files/tags?file_path=... — Get tags for a file
// GET /api/files/tags?all=true — Get all unique tags in system
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('file_path');
    const all = searchParams.get('all');

    const supabase = await createServerSupabaseClient();

    if (all === 'true') {
      // Return all unique tag names with colors (for autocomplete/filter)
      const { data, error } = await supabase
        .from('pyra_file_tags')
        .select('tag_name, color')
        .order('tag_name');

      if (error) {
        console.error('Tags list error:', error);
        return apiServerError('فشل في جلب الوسوم');
      }

      // Deduplicate by tag_name
      const uniqueTags = Array.from(
        new Map((data || []).map((t) => [t.tag_name, t])).values()
      );

      return apiSuccess(uniqueTags);
    }

    if (!filePath) {
      return apiValidationError('file_path مطلوب');
    }

    const { data, error } = await supabase
      .from('pyra_file_tags')
      .select('*')
      .eq('file_path', filePath)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Tags fetch error:', error);
      return apiServerError('فشل في جلب الوسوم');
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('Tags GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/files/tags — Add tag to file
// Body: { file_path, tag_name, color? }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { file_path, tag_name, color } = body;

    if (!file_path || typeof file_path !== 'string') {
      return apiValidationError('file_path مطلوب');
    }

    if (!tag_name || typeof tag_name !== 'string' || tag_name.trim().length === 0) {
      return apiValidationError('اسم الوسم مطلوب');
    }

    if (tag_name.trim().length > 30) {
      return apiValidationError('اسم الوسم طويل جداً (الحد الأقصى 30 حرف)');
    }

    const TAG_COLORS = [
      '#f97316', '#ef4444', '#22c55e', '#3b82f6',
      '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
      '#6b7280',
    ];

    const tagColor = color && TAG_COLORS.includes(color) ? color : (color || '#f97316');

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_file_tags')
      .upsert(
        {
          id: generateId('tg'),
          file_path: file_path.trim(),
          tag_name: tag_name.trim(),
          color: tagColor,
          created_by: auth.pyraUser.username,
        },
        { onConflict: 'file_path,tag_name' }
      )
      .select()
      .single();

    if (error) {
      console.error('Tag create error:', error);
      return apiServerError('فشل في إضافة الوسم');
    }

    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('Tags POST error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/files/tags — Remove tag from file
// Body: { file_path, tag_name }
// =============================================================
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { file_path, tag_name } = body;

    if (!file_path || !tag_name) {
      return apiValidationError('file_path و tag_name مطلوبان');
    }

    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from('pyra_file_tags')
      .delete()
      .eq('file_path', file_path)
      .eq('tag_name', tag_name);

    if (error) {
      console.error('Tag delete error:', error);
      return apiServerError('فشل في حذف الوسم');
    }

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('Tags DELETE error:', err);
    return apiServerError();
  }
}
