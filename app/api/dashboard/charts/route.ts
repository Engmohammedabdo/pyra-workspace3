import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/dashboard/charts
// Data for dashboard charts: activity trend, project status, storage by type
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await getApiAdmin();
    if (!auth) {
      const { getApiAuth } = await import('@/lib/api/auth');
      const basicAuth = await getApiAuth();
      if (!basicAuth) return apiUnauthorized();
      return apiForbidden();
    }

    const supabase = await createServerSupabaseClient();

    // Run all chart queries in parallel
    const [activityResult, projectsResult, storageResult] = await Promise.all([
      // 1. Activity trend: last 7 days
      getActivityTrend(supabase),

      // 2. Project status breakdown
      getProjectStatusBreakdown(supabase),

      // 3. Storage by file type
      getStorageByType(supabase),
    ]);

    return apiSuccess({
      activityTrend: activityResult,
      projectStatus: projectsResult,
      storageByType: storageResult,
    });
  } catch (err) {
    console.error('Charts data error:', err);
    return apiServerError();
  }
}

// ── Activity trend: count per day for last 7 days ──
async function getActivityTrend(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
) {
  const days: { date: string; label: string; count: number }[] = [];
  const DAY_LABELS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const startOfDay = `${dateStr}T00:00:00.000Z`;
    const endOfDay = `${dateStr}T23:59:59.999Z`;

    const { count } = await supabase
      .from('pyra_activity_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay);

    days.push({
      date: dateStr,
      label: DAY_LABELS[d.getDay()],
      count: count || 0,
    });
  }

  return days;
}

// ── Project status breakdown ──
async function getProjectStatusBreakdown(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
) {
  const statuses = ['active', 'in_progress', 'review', 'completed', 'archived'];
  const STATUS_LABELS: Record<string, string> = {
    active: 'نشط',
    in_progress: 'قيد التنفيذ',
    review: 'مراجعة',
    completed: 'مكتمل',
    archived: 'مؤرشف',
  };

  const results = await Promise.all(
    statuses.map(async (status) => {
      const { count } = await supabase
        .from('pyra_projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);

      return {
        status,
        label: STATUS_LABELS[status],
        count: count || 0,
      };
    })
  );

  return results.filter((r) => r.count > 0);
}

// ── Storage by file type ──
async function getStorageByType(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
) {
  const { data: files } = await supabase
    .from('pyra_file_index')
    .select('mime_type, file_size');

  if (!files || files.length === 0) {
    return [];
  }

  const typeMap: Record<string, { label: string; size: number; count: number }> = {
    image: { label: 'صور', size: 0, count: 0 },
    video: { label: 'فيديو', size: 0, count: 0 },
    audio: { label: 'صوت', size: 0, count: 0 },
    pdf: { label: 'PDF', size: 0, count: 0 },
    document: { label: 'مستندات', size: 0, count: 0 },
    archive: { label: 'أرشيف', size: 0, count: 0 },
    other: { label: 'أخرى', size: 0, count: 0 },
  };

  for (const file of files) {
    const mime = file.mime_type || '';
    const size = file.file_size || 0;

    if (mime.startsWith('image/')) {
      typeMap.image.size += size;
      typeMap.image.count++;
    } else if (mime.startsWith('video/')) {
      typeMap.video.size += size;
      typeMap.video.count++;
    } else if (mime.startsWith('audio/')) {
      typeMap.audio.size += size;
      typeMap.audio.count++;
    } else if (mime === 'application/pdf') {
      typeMap.pdf.size += size;
      typeMap.pdf.count++;
    } else if (
      mime.includes('word') || mime.includes('document') ||
      mime.includes('spreadsheet') || mime.includes('presentation') ||
      mime.includes('excel') || mime.includes('powerpoint') ||
      mime === 'text/plain'
    ) {
      typeMap.document.size += size;
      typeMap.document.count++;
    } else if (
      mime.includes('zip') || mime.includes('rar') ||
      mime.includes('tar') || mime.includes('gzip') || mime.includes('7z')
    ) {
      typeMap.archive.size += size;
      typeMap.archive.count++;
    } else {
      typeMap.other.size += size;
      typeMap.other.count++;
    }
  }

  return Object.entries(typeMap)
    .filter(([, v]) => v.count > 0)
    .map(([key, v]) => ({
      type: key,
      label: v.label,
      size: v.size,
      count: v.count,
    }));
}
