import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/reports/storage
// Storage usage report from pyra_file_index.
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();

    const [
      totalFilesRes,
      totalFoldersRes,
      allFilesRes,
      largestFilesRes,
    ] = await Promise.all([
      // Total files (not folders)
      supabase
        .from('pyra_file_index')
        .select('id', { count: 'exact', head: true })
        .eq('is_folder', false),

      // Total folders
      supabase
        .from('pyra_file_index')
        .select('id', { count: 'exact', head: true })
        .eq('is_folder', true),

      // All files for size and mime type aggregation
      supabase
        .from('pyra_file_index')
        .select('file_size, mime_type')
        .eq('is_folder', false)
        .limit(10000),

      // Top 10 largest files
      supabase
        .from('pyra_file_index')
        .select('file_name, file_path, file_size, mime_type')
        .eq('is_folder', false)
        .order('file_size', { ascending: false })
        .limit(10),
    ]);

    const allFiles = allFilesRes.data || [];

    // Total size
    const totalSizeBytes = allFiles.reduce(
      (sum: number, f: { file_size: number }) => sum + (f.file_size || 0),
      0
    );

    // Group by mime type
    const mimeMap: Record<string, { count: number; total_size: number }> = {};
    for (const f of allFiles) {
      const mime = (f as { mime_type: string }).mime_type || 'unknown';
      if (!mimeMap[mime]) {
        mimeMap[mime] = { count: 0, total_size: 0 };
      }
      mimeMap[mime].count += 1;
      mimeMap[mime].total_size += (f as { file_size: number }).file_size || 0;
    }

    const byMimeType = Object.entries(mimeMap)
      .map(([mime_type, data]) => ({
        mime_type,
        count: data.count,
        total_size: data.total_size,
      }))
      .sort((a, b) => b.total_size - a.total_size)
      .slice(0, 10);

    return apiSuccess({
      total_files: totalFilesRes.count ?? 0,
      total_folders: totalFoldersRes.count ?? 0,
      total_size_bytes: totalSizeBytes,
      by_mime_type: byMimeType,
      largest_files: largestFilesRes.data || [],
    });
  } catch (err) {
    console.error('GET /api/reports/storage error:', err);
    return apiServerError();
  }
}
