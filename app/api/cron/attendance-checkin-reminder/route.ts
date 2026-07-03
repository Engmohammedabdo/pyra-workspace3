import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/attendance-checkin-reminder
// Auth: x-api-key → pyra_api_keys; cron.attendance-checkin-reminder or *
// Schedule: every 30 minutes 08:00–16:00 Asia/Dubai via n8n
//
// Scope: ACTIVE users with a PERSONAL work_schedule_id (assigning a personal
// schedule = opting into reminders; users on the org default are skipped).
// Fires when: today is a work day AND now > schedule start + 15 min AND no
// attendance row today AND not on approved leave. One reminder per user/day
// (dedup via pyra_notifications type=attendance_checkin_reminder + Dubai day).
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.attendance-checkin-reminder') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.attendance-checkin-reminder', 403);
    }

    const supabase = createServiceRoleClient();
    const now = new Date();
    const todayKey = dubaiDayKey(now);
    const dubai = new Date(now.getTime() + 4 * 3_600_000);
    const dowDubai = dubai.getUTCDay(); // 0=Sunday (company weekend)
    const minutesNow = dubai.getUTCHours() * 60 + dubai.getUTCMinutes();
    const dayStartUtcIso = new Date(Date.parse(`${todayKey}T00:00:00+04:00`)).toISOString();
    const GRACE_MINUTES = 15;

    const { data: users } = await supabase
      .from('pyra_users')
      .select('username, work_schedule_id')
      .eq('status', 'active')
      .not('work_schedule_id', 'is', null);
    if (!users?.length) return apiSuccess({ reminded: 0 });

    const scheduleIds = [...new Set(users.map((u) => u.work_schedule_id as string))];
    const { data: schedules } = await supabase
      .from('pyra_work_schedules')
      .select('id, work_days, start_time')
      .in('id', scheduleIds);

    let reminded = 0;
    for (const u of users) {
      try {
        const sched = schedules?.find((s) => s.id === u.work_schedule_id);
        if (!sched?.start_time) continue;

        const workDays = (sched.work_days as number[]) || [];
        if (!workDays.includes(dowDubai)) continue;

        const [h, m] = String(sched.start_time).split(':').map(Number);
        if (Number.isNaN(h) || minutesNow < h * 60 + (m || 0) + GRACE_MINUTES) continue;

        const { data: att } = await supabase
          .from('pyra_attendance')
          .select('id')
          .eq('username', u.username)
          .eq('date', todayKey)
          .maybeSingle();
        if (att) continue;

        const { count: onLeave } = await supabase
          .from('pyra_leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('username', u.username)
          .eq('status', 'approved')
          .lte('start_date', todayKey)
          .gte('end_date', todayKey);
        if ((onLeave || 0) > 0) continue;

        const { count: already } = await supabase
          .from('pyra_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_username', u.username)
          .eq('type', 'attendance_checkin_reminder')
          .gte('created_at', dayStartUtcIso);
        if ((already || 0) > 0) continue;

        await notify(supabase, {
          to: u.username,
          type: 'attendance_checkin_reminder',
          title: '⏰ تذكير تسجيل الحضور',
          message: 'موعد دوامك بدأ ولم تسجل حضورك بعد — سجل من صفحة الحضور',
          link: '/dashboard/attendance',
        });
        await sendWhatsAppToUser(
          supabase,
          u.username,
          `⏰ تذكير: موعد دوامك بدأ ولم تسجل حضورك بعد.\nسجل من هنا: ${APP_URL}/dashboard/attendance`,
        );
        reminded++;
      } catch (rowErr) {
        logError({ error: rowErr, request, metadata: { action: 'attendance-reminder-row', username: u.username } });
      }
    }

    return apiSuccess({ reminded });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'attendance-checkin-reminder' } });
    console.error('[cron/attendance-checkin-reminder] threw:', err);
    return apiServerError();
  }
}
