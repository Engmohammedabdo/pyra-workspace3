import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiError, apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';
import { notifyMany } from '@/lib/notifications/notify';
import { dubaiDayKey } from '@/lib/utils/format';

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
// Schedule: n8n Schedule Trigger — daily, 06:00 Asia/Dubai (02:00 UTC), on
//   its OWN dedicated Schedule Trigger node in PyraCRM_Cron.
//
//   Originally this HTTP node was wired as a second branch off the SAME
//   Schedule Trigger that fires lead-idle-check — n8n halts a whole execution
//   when a node errors with no onError set, and lead-idle-check ran first, so
//   in the exact scenario this digest exists to catch (idle-check 500ing
//   daily) the digest never ran either. Fixed 2026-07-25 by giving it its own
//   trigger, one hour after idle-check's real fire time so same-day failures
//   get reported same-day. (That real fire time was also mislabeled — the
//   shared trigger's node name said "09:00 Dubai (05:00 UTC)" but its cron
//   expression, `0 5 * * *` in the instance's Asia/Dubai default timezone,
//   actually fires at 05:00 Dubai / 01:00 UTC. Corrected alongside this fix.)
//
// Window is a rolling 24h lookback (Date.now() - 24h), NOT a Dubai-calendar-day
// bucket — the rolling window is only used to decide WHICH error rows count as
// "new" for this run's message. As long as the cron fires once daily that
// window naturally avoids re-describing the same rows twice.
//
// Notify dedup IS still required, mirroring device-silent-check: a manual
// re-fire of this workflow (e.g. during rollout verification) on the same
// Dubai day is a near-certainty. Before calling notifyMany we check for an
// existing 'system_error_digest' notification created since Dubai midnight
// (dubaiDayKey() pure UTC+4 offset math, no DST — Phase 15.1 lock, never a
// raw `.toISOString().slice(0, 10)`) and skip the notify if one exists. The
// dedup lookup fails CLOSED (500, same as device-silent-check's own
// dedup-query failure) — a DB blip must never silently risk a double-send to
// every admin.
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

    // True DB count for the window — `recent` above is capped at 500 rows for
    // deriving `failing_jobs` only. During a real incident storm (the exact
    // case this cron exists to catch) the capped array's .length would
    // silently understate `new_errors` (project rule: user-facing counts come
    // from a DB count/aggregate, never a capped array's .length).
    const { count: newErrorsCount, error: newErrorsErr } = await supabase
      .from('pyra_error_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sinceIso);
    if (newErrorsErr) {
      logError({ error: newErrorsErr, request, metadata: { source: 'cron', job: 'error-digest', stage: 'new_errors_count' } });
      console.error('[cron/error-digest] new_errors count failed:', newErrorsErr.message);
      return apiServerError();
    }

    const rows = recent ?? [];
    const newErrors = newErrorsCount ?? 0;
    // A failing cron is the loudest signal in the table — surface job names.
    const failingJobs = Array.from(
      new Set(
        rows
          .filter((r) => (r.metadata as Record<string, unknown> | null)?.source === 'cron')
          .map((r) => String((r.metadata as Record<string, unknown>)?.job ?? 'unknown')),
      ),
    );

    if (newErrors === 0) {
      return apiSuccess({
        window_hours: WINDOW_HOURS,
        new_errors: 0,
        unresolved_total: unresolvedTotal ?? 0,
        failing_jobs: [],
        admins_notified: 0,
        skipped_no_news: true,
        skipped_already_notified_today: false,
      });
    }

    // Per-Dubai-day notify dedup (mirrors device-silent-check). Fails CLOSED —
    // a lookup error must never risk a same-day double-send to every admin.
    const todayKey = dubaiDayKey();
    const dubaiOffsetMs = 4 * 60 * 60 * 1000; // Asia/Dubai is UTC+4 (no DST)
    const dubaiMidnightUtcIso = new Date(
      new Date(`${todayKey}T00:00:00.000Z`).getTime() - dubaiOffsetMs,
    ).toISOString();

    const { data: existingDigest, error: dedupErr } = await supabase
      .from('pyra_notifications')
      .select('id')
      .eq('type', 'system_error_digest')
      .gte('created_at', dubaiMidnightUtcIso)
      .limit(1);
    if (dedupErr) {
      logError({ error: dedupErr, request, metadata: { source: 'cron', job: 'error-digest', stage: 'dedup_select' } });
      console.error('[cron/error-digest] dedup SELECT failed:', dedupErr.message);
      return apiServerError();
    }

    if ((existingDigest ?? []).length > 0) {
      return apiSuccess({
        window_hours: WINDOW_HOURS,
        new_errors: newErrors,
        unresolved_total: unresolvedTotal ?? 0,
        failing_jobs: failingJobs,
        admins_notified: 0,
        skipped_no_news: false,
        skipped_already_notified_today: true,
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
          message: `${newErrors} خطأ جديد خلال آخر ${WINDOW_HOURS} ساعة (${unresolvedTotal ?? 0} غير محلول إجمالاً)${jobsPart}`,
          link: '/dashboard/admin/error-logs',
          // rows[0] backs the entity id purely for notify's grouping/dedup
          // key; guard against the (rare) race where new_errors_count picks
          // up a row inserted after the capped `recent` select already ran.
          entity: { type: 'error_digest', id: rows[0]?.id ?? `digest-${todayKey}` },
          from: { username: 'system' },
        });
        adminsNotified = adminUsernames.length;
      } catch (notifyErr) {
        console.error('[cron/error-digest] notify failed:', notifyErr);
      }
    }

    return apiSuccess({
      window_hours: WINDOW_HOURS,
      new_errors: newErrors,
      unresolved_total: unresolvedTotal ?? 0,
      failing_jobs: failingJobs,
      admins_notified: adminsNotified,
      skipped_no_news: false,
      skipped_already_notified_today: false,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { source: 'cron', job: 'error-digest' } });
    console.error('[cron/error-digest] threw:', err);
    return apiServerError();
  }
}
