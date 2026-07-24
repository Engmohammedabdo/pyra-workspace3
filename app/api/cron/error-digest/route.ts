import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiError, apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';
import { notifyMany } from '@/lib/notifications/notify';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/error-digest
//
// Daily admin digest of pyra_error_logs. Exists because the table was
// write-only from the app's perspective: lead-idle-check failed 11 consecutive
// days (2026-07-14 → 2026-07-24) and nothing surfaced it — 50 rows accumulated
// since 2026-06-30 with not one ever marked resolved. error-logs-cleanup then
// prunes at 90 days, so an unnoticed failure eventually erases its own
// evidence. Silent on a clean day so the bell keeps meaning something.
//
// Auth: x-api-key header → pyra_api_keys
// Permission: 'cron.error-digest' (or '*' wildcard)
// Schedule: n8n Schedule Trigger — daily, 09:00 Dubai (05:00 UTC).
//
// Window is a rolling 24h lookback (Date.now() - 24h), NOT a Dubai-calendar-day
// bucket — there is no per-day dedup requirement here (unlike
// device-silent-check, which dedups per-device per-Dubai-day). As long as the
// cron fires once daily the rolling window naturally avoids re-notifying about
// the same rows twice. dubaiDayKey() is therefore intentionally NOT used.
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_HOURS = 24;

export async function POST(request: NextRequest) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.error-digest') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.error-digest', 403);
    }

    const supabase = createServiceRoleClient();
    const sinceIso = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const { data: recent, error: recentErr } = await supabase
      .from('pyra_error_logs')
      .select('id, severity, message, metadata, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(500);
    if (recentErr) {
      logError({ error: recentErr, request, metadata: { source: 'cron', job: 'error-digest', stage: 'recent_select' } });
      console.error('[cron/error-digest] recent SELECT failed:', recentErr.message);
      return apiServerError();
    }

    const { count: unresolvedTotal, error: unresolvedErr } = await supabase
      .from('pyra_error_logs')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', false);
    if (unresolvedErr) {
      logError({ error: unresolvedErr, request, metadata: { source: 'cron', job: 'error-digest', stage: 'unresolved_count' } });
      console.error('[cron/error-digest] unresolved count failed:', unresolvedErr.message);
      return apiServerError();
    }

    const rows = recent ?? [];
    // A failing cron is the loudest signal in the table — surface job names.
    const failingJobs = Array.from(
      new Set(
        rows
          .filter((r) => (r.metadata as Record<string, unknown> | null)?.source === 'cron')
          .map((r) => String((r.metadata as Record<string, unknown>)?.job ?? 'unknown')),
      ),
    );

    if (rows.length === 0) {
      return apiSuccess({
        window_hours: WINDOW_HOURS,
        new_errors: 0,
        unresolved_total: unresolvedTotal ?? 0,
        failing_jobs: [],
        admins_notified: 0,
        skipped_no_news: true,
      });
    }

    const { data: adminRows, error: adminsErr } = await supabase
      .from('pyra_users')
      .select('username')
      .eq('role', 'admin')
      .eq('status', 'active');
    if (adminsErr) {
      logError({ error: adminsErr, request, metadata: { source: 'cron', job: 'error-digest', stage: 'admins_select' } });
      console.error('[cron/error-digest] admins SELECT failed:', adminsErr.message);
      return apiServerError();
    }
    const adminUsernames = ((adminRows ?? []) as Array<{ username: string }>).map((a) => a.username);

    let adminsNotified = 0;
    if (adminUsernames.length > 0) {
      const jobsPart = failingJobs.length > 0 ? ` — مهام متوقفة: ${failingJobs.join('، ')}` : '';
      try {
        await notifyMany(supabase, adminUsernames, {
          type: 'system_error_digest',
          title: 'أخطاء جديدة في النظام',
          message: `${rows.length} خطأ جديد خلال آخر ${WINDOW_HOURS} ساعة (${unresolvedTotal ?? 0} غير محلول إجمالاً)${jobsPart}`,
          link: '/dashboard/admin/error-logs',
          entity: { type: 'error_digest', id: rows[0].id },
          from: { username: 'system' },
        });
        adminsNotified = adminUsernames.length;
      } catch (notifyErr) {
        console.error('[cron/error-digest] notify failed:', notifyErr);
      }
    }

    return apiSuccess({
      window_hours: WINDOW_HOURS,
      new_errors: rows.length,
      unresolved_total: unresolvedTotal ?? 0,
      failing_jobs: failingJobs,
      admins_notified: adminsNotified,
      skipped_no_news: false,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { source: 'cron', job: 'error-digest' } });
    console.error('[cron/error-digest] threw:', err);
    return apiServerError();
  }
}
