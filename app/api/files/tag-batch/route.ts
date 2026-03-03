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
// POST /api/files/tag-batch
// Add a tag to multiple files at once
// Body: { paths: string[], tag_name: string, color?: string }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { paths, tag_name, color } = body;

    if (!Array.isArray(paths) || paths.length === 0) {
      return apiValidationError('قائمة الملفات مطلوبة');
    }

    if (!tag_name || typeof tag_name !== 'string' || tag_name.trim().length === 0) {
      return apiValidationError('اسم الوسم مطلوب');
    }

    if (tag_name.trim().length > 30) {
      return apiValidationError('اسم الوسم طويل جداً (الحد الأقصى 30 حرف)');
    }

    const tagColor = color || '#f97316';
    const supabase = await createServerSupabaseClient();
    let tagged = 0;

    for (const filePath of paths) {
      if (!filePath || typeof filePath !== 'string') continue;

      const { error } = await supabase.from('pyra_file_tags').upsert(
        {
          id: generateId('tg'),
          file_path: filePath.trim(),
          tag_name: tag_name.trim(),
          color: tagColor,
          created_by: auth.pyraUser.username,
        },
        { onConflict: 'file_path,tag_name' }
      );

      if (!error) tagged++;
    }

    return apiSuccess({ tagged });
  } catch (err) {
    console.error('POST /api/files/tag-batch error:', err);
    return apiServerError();
  }
}
