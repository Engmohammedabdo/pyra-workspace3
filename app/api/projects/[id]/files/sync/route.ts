import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type RouteContext = { params: Promise<{ id: string }> };

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';
const MAX_DEPTH = 15;

/**
 * POST /api/projects/[id]/files/sync
 *
 * Scan Supabase Storage under the project's storage_path and register
 * any files that are not yet in pyra_project_files.
 * This fixes files that were uploaded directly to Storage (outside the app).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id: projectId } = await context.params;
    const supabase = await createServerSupabaseClient();

    // ── Get project details ────────────────────────────────
    const { data: project, error: projErr } = await supabase
      .from('pyra_projects')
      .select('id, storage_path, client_id, team_id')
      .eq('id', projectId)
      .single();

    if (projErr || !project) {
      return apiNotFound('المشروع غير موجود');
    }

    // Employee access check
    if (auth.pyraUser.role === 'employee') {
      if (!project.team_id) {
        return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
      }
      const { data: membership } = await supabase
        .from('pyra_team_members')
        .select('id')
        .eq('team_id', project.team_id)
        .eq('username', auth.pyraUser.username)
        .maybeSingle();
      if (!membership) {
        return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
      }
    }

    if (!project.storage_path) {
      return apiServerError('هذا المشروع ليس له مسار تخزين محدد');
    }

    const username = auth.pyraUser.username;
    const displayName = auth.pyraUser.display_name;

    // ── Get existing files already linked to this project ──
    const { data: existingFiles } = await supabase
      .from('pyra_project_files')
      .select('file_path')
      .eq('project_id', projectId);

    const existingPaths = new Set(
      (existingFiles || []).map((f: { file_path: string }) => f.file_path)
    );

    // ── Scan Storage recursively ───────────────────────────
    const storage = createServiceRoleClient();
    let synced = 0;
    let skipped = 0;
    let errors = 0;

    async function scanFolder(folderPath: string, depth: number = 0): Promise<void> {
      if (depth > MAX_DEPTH) return;

      const { data: items, error } = await storage.storage
        .from(BUCKET)
        .list(folderPath, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

      if (error || !items) {
        errors++;
        return;
      }

      for (const item of items) {
        if (item.name === '.emptyFolderPlaceholder' || item.name === '.gitkeep') continue;

        const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;

        if (item.id === null) {
          // Folder → recurse
          await scanFolder(itemPath, depth + 1);
        } else {
          // File → check if already linked
          if (existingPaths.has(itemPath)) {
            skipped++;
            continue;
          }

          const fileSize = item.metadata?.size || 0;
          const mimeType = item.metadata?.mimetype || 'application/octet-stream';

          const { error: insertErr } = await supabase
            .from('pyra_project_files')
            .insert({
              id: generateId('pf'),
              project_id: projectId,
              file_name: item.name,
              file_path: itemPath,
              file_size: fileSize,
              mime_type: mimeType,
              uploaded_by: username,
              client_visible: true,
              needs_approval: false,
              version: 1,
              created_at: new Date().toISOString(),
            });

          if (insertErr) {
            console.error(`Sync: error inserting ${itemPath}:`, insertErr);
            errors++;
          } else {
            synced++;
          }
        }
      }
    }

    // Scan starting from the project's storage path
    await scanFolder(project.storage_path);

    // ── Also scan alternative paths (common naming variants) ──
    // E.g. if storage_path is "projects/injazat/etmam-brand-identity"
    // also check "projects/injazat/Etmam" in case user uploaded there
    const pathParts = project.storage_path.split('/');
    if (pathParts.length >= 3) {
      const basePath = pathParts.slice(0, 2).join('/'); // projects/injazat

      // List all folders under the company folder
      const { data: companyFolders } = await storage.storage
        .from(BUCKET)
        .list(basePath, { limit: 100 });

      if (companyFolders) {
        // Get the project slug from storage path
        const projectSlug = pathParts[2].toLowerCase();

        for (const folder of companyFolders) {
          if (folder.id !== null) continue; // Skip files
          const folderLower = folder.name.toLowerCase();

          // Check if this folder matches the project name (case-insensitive or partial)
          const altPath = `${basePath}/${folder.name}`;
          if (
            altPath !== project.storage_path && // Don't re-scan the main path
            (folderLower === projectSlug ||
              projectSlug.startsWith(folderLower) ||
              folderLower.startsWith(projectSlug.split('-')[0]))
          ) {
            await scanFolder(altPath);
          }
        }
      }
    }

    // ── Notify client if new files were synced ─────────────
    if (synced > 0 && project.client_id) {
      try {
        await supabase.from('pyra_client_notifications').insert({
          id: generateId('cn'),
          client_id: project.client_id,
          type: 'file_upload',
          title: 'ملفات جديدة',
          message: `تم إضافة ${synced} ملف جديد للمشروع`,
          target_project_id: projectId,
          is_read: false,
        });
      } catch (e) {
        // Non-critical
      }
    }

    // ── Log activity ───────────────────────────────────────
    if (synced > 0) {
      await supabase.from('pyra_activity_log').insert({
        id: generateId('al'),
        action_type: 'project_files_synced',
        username: username,
        display_name: displayName,
        target_path: project.storage_path,
        details: { project_id: projectId, synced, skipped, errors },
        ip_address: request.headers.get('x-forwarded-for') || 'unknown',
      });
    }

    return apiSuccess({
      synced,
      skipped,
      errors,
      storage_path: project.storage_path,
      message:
        synced > 0
          ? `تم مزامنة ${synced} ملف جديد${skipped > 0 ? `، ${skipped} موجود مسبقاً` : ''}`
          : `لا توجد ملفات جديدة للمزامنة (${skipped} موجود مسبقاً)`,
    });
  } catch (err) {
    console.error('Project files sync error:', err);
    return apiServerError(
      `خطأ في المزامنة: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
