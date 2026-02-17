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
// GET /api/favorites
// List current user's favorites
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_favorites')
      .select('*')
      .eq('username', auth.pyraUser.username)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Favorites list error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/favorites error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/favorites
// Toggle favorite (add if not exists, remove if exists)
// Body: { file_path, item_type?: 'file'|'folder', display_name? }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { file_path, item_type, display_name } = body;

    if (!file_path || typeof file_path !== 'string') {
      return apiValidationError('مسار الملف مطلوب');
    }

    const supabase = await createServerSupabaseClient();
    const username = auth.pyraUser.username;

    // Check if already favorited
    const { data: existing } = await supabase
      .from('pyra_favorites')
      .select('id')
      .eq('username', username)
      .eq('file_path', file_path)
      .maybeSingle();

    if (existing) {
      // Remove favorite (toggle off)
      await supabase
        .from('pyra_favorites')
        .delete()
        .eq('id', existing.id);

      return apiSuccess({ action: 'removed', file_path });
    }

    // Add favorite (toggle on)
    const { data: favorite, error } = await supabase
      .from('pyra_favorites')
      .insert({
        id: generateId('fav'),
        username,
        file_path,
        item_type: item_type || 'file',
        display_name: display_name || file_path.split('/').pop() || file_path,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Favorite add error:', error);
      return apiServerError('فشل في إضافة المفضلة');
    }

    return apiSuccess({ action: 'added', favorite }, undefined, 201);
  } catch (err) {
    console.error('POST /api/favorites error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/favorites
// Remove a specific favorite
// Body: { file_path }
// =============================================================
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { file_path } = body;

    if (!file_path) {
      return apiValidationError('مسار الملف مطلوب');
    }

    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from('pyra_favorites')
      .delete()
      .eq('username', auth.pyraUser.username)
      .eq('file_path', file_path);

    if (error) {
      console.error('Favorite delete error:', error);
      return apiServerError();
    }

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/favorites error:', err);
    return apiServerError();
  }
}
