import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { isFileAdmin, getUserAllowedPaths } from '@/lib/auth/file-access';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/dashboard/storage-stats
// Returns storage usage statistics: total size, by type, by folder
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('files.view');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();

    // Fetch all indexed files
    const { data: files, error } = await supabase
      .from('pyra_file_index')
      .select('file_path, file_size, mime_type, parent_path')
      .eq('is_folder', false)
      .order('file_size', { ascending: false });

    if (error) {
      console.error('Storage stats error:', error);
      return apiServerError('فشل في جلب إحصائيات التخزين');
    }

    // For non-admin users, filter files to only their allowed paths
    let allFiles = files || [];
    if (!isFileAdmin(auth)) {
      const allowedPaths = await getUserAllowedPaths(auth);
      if (allowedPaths.length === 0) {
        return apiSuccess({
          totalSize: 0,
          totalFiles: 0,
          typeBreakdown: [],
          topFolders: [],
          largestFiles: [],
        });
      }
      allFiles = allFiles.filter((f) => {
        const fp = f.file_path.replace(/^\/+/, '');
        return allowedPaths.some((ap) => {
          const nap = ap.replace(/^\/+/, '').replace(/\/+$/, '');
          return fp === nap || fp.startsWith(nap + '/');
        });
      });
    }

    // Total size
    const totalSize = allFiles.reduce((sum, f) => sum + (f.file_size || 0), 0);
    const totalFiles = allFiles.length;

    // By MIME type category
    const byType: Record<string, { size: number; count: number }> = {};
    const typeMap: Record<string, string> = {
      'image/': 'صور',
      'video/': 'فيديو',
      'audio/': 'صوت',
      'application/pdf': 'PDF',
      'text/': 'نصوص',
    };

    for (const f of allFiles) {
      const mime = f.mime_type || 'application/octet-stream';
      let category = 'أخرى';
      for (const [prefix, label] of Object.entries(typeMap)) {
        if (mime.startsWith(prefix) || mime === prefix) {
          category = label;
          break;
        }
      }
      if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') {
        category = 'جداول';
      } else if (mime.includes('document') || mime.includes('msword')) {
        category = 'مستندات';
      } else if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('compress')) {
        category = 'أرشيف';
      }

      if (!byType[category]) byType[category] = { size: 0, count: 0 };
      byType[category].size += f.file_size || 0;
      byType[category].count += 1;
    }

    // By top-level folder (top 20)
    const byFolder: Record<string, { size: number; count: number }> = {};
    for (const f of allFiles) {
      const topFolder = f.parent_path?.split('/')[0] || 'جذر';
      if (!byFolder[topFolder]) byFolder[topFolder] = { size: 0, count: 0 };
      byFolder[topFolder].size += f.file_size || 0;
      byFolder[topFolder].count += 1;
    }

    const topFolders = Object.entries(byFolder)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 20)
      .map(([name, data]) => ({ name, ...data }));

    // Type breakdown for chart
    const typeBreakdown = Object.entries(byType)
      .sort((a, b) => b[1].size - a[1].size)
      .map(([name, data]) => ({ name, ...data }));

    // Largest files (top 15)
    const largestFiles = allFiles.slice(0, 15).map((f) => ({
      name: f.file_path.split('/').pop() || '',
      path: f.file_path,
      size: f.file_size || 0,
      type: f.mime_type || '',
    }));

    return apiSuccess({
      totalSize,
      totalFiles,
      typeBreakdown,
      topFolders,
      largestFiles,
    });
  } catch (err) {
    console.error('GET /api/dashboard/storage-stats error:', err);
    return apiServerError();
  }
}
