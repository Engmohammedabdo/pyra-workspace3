import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { getParentPath } from '@/lib/utils/path';

export const dynamic = 'force-dynamic';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// POST /api/files/versions/[id]/restore
// Restore a specific version:
//   1. Save current file as a new version
//   2. Copy the old version back to the original path
//   3. Update the file index
// =============================================================
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await context.params;

    const supabase = await createServerSupabaseClient();
    const storage = createServiceRoleClient();

    // Get the version to restore
    const { data: version, error: fetchError } = await supabase
      .from('pyra_file_versions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !version) {
      return apiNotFound('النسخة غير موجودة');
    }

    const originalPath = version.file_path;
    const parentPath = getParentPath(originalPath);

    // ── Step 1: Save the current file as a new version ──────
    // Get the current version number
    const { data: latestVersions } = await supabase
      .from('pyra_file_versions')
      .select('version_number')
      .eq('file_path', originalPath)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersionNum = ((latestVersions?.[0]?.version_number) || 0) + 1;

    // Download current file
    const { data: currentFileData, error: downloadError } = await storage.storage
      .from(BUCKET)
      .download(originalPath);

    if (!downloadError && currentFileData) {
      // Get current file info from index
      const { data: currentIndex } = await supabase
        .from('pyra_file_index')
        .select('file_size, mime_type')
        .eq('file_path', originalPath)
        .single();

      // Save current as version
      const versionPath = `.versions/${originalPath}_v${nextVersionNum}`;
      await storage.storage
        .from(BUCKET)
        .upload(versionPath, currentFileData, {
          contentType: currentIndex?.mime_type || 'application/octet-stream',
          upsert: true,
        });

      // Create version record for the current file
      await supabase.from('pyra_file_versions').insert({
        id: generateId('fv'),
        file_path: originalPath,
        version_path: versionPath,
        version_number: nextVersionNum,
        file_size: currentIndex?.file_size || 0,
        mime_type: currentIndex?.mime_type || 'application/octet-stream',
        created_by: auth.pyraUser.username,
        created_at: new Date().toISOString(),
      });
    }

    // ── Step 2: Copy the old version back to the original path ──
    const { data: versionFileData, error: versionDownloadError } = await storage.storage
      .from(BUCKET)
      .download(version.version_path);

    if (versionDownloadError || !versionFileData) {
      console.error('Failed to download version file:', versionDownloadError);
      return apiServerError('فشل تحميل ملف النسخة من التخزين');
    }

    const { error: uploadError } = await storage.storage
      .from(BUCKET)
      .upload(originalPath, versionFileData, {
        contentType: version.mime_type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      console.error('Failed to restore version to original path:', uploadError);
      return apiServerError('فشل استعادة النسخة');
    }

    // ── Step 3: Update file index ─────────────────────────
    await supabase.from('pyra_file_index').upsert(
      {
        id: generateId('fi'),
        file_path: originalPath,
        file_name: originalPath.split('/').pop() || '',
        file_name_lower: (originalPath.split('/').pop() || '').toLowerCase(),
        file_size: version.file_size || 0,
        mime_type: version.mime_type || 'application/octet-stream',
        is_folder: false,
        parent_path: parentPath,
        indexed_at: new Date().toISOString(),
      },
      { onConflict: 'file_path' }
    );

    // ── Step 4: Log activity ──────────────────────────────
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'version_restore',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: originalPath,
      details: {
        restored_version: version.version_number,
        new_version_saved: nextVersionNum,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({
      restored: true,
      file_path: originalPath,
      restored_version: version.version_number,
    });
  } catch (err) {
    console.error('POST /api/files/versions/[id]/restore error:', err);
    return apiServerError();
  }
}
