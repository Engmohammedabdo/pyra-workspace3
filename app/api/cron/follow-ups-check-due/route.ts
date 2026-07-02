import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyBatch } from '@/lib/notifications/notify';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/follow-ups-check-due
//
// Auth: x-api-key header → pyra_api_keys (Phase 11 external-cron pattern)
// Permission: 'cron.follow-ups-check-due' (or '*' wildcard)
// Schedule: hourly via n8n PyraCRM_Cron
//
// SINGLE RESPONSIBILITY: flip pending follow-ups whose due_at has passed to
// status='overdue' (compare-and-swap on status='pending'), then fire a
// ONE-TIME bell notification per row that just transitioned (skipping departed
// agents + archived leads).
//
// WHY THIS EXISTS: the prior /api/dashboard/sales/follow-ups/check-due was
// gated on requireApiPermission('sales_leads.view') — a cookie-session check
// that the external cron infra (getExternalAuth + x-api-key) CANNOT satisfy, so
// it never ran. Production sat at 25 past-due follow-ups with status='pending'
// and 0 overdue rows, blanking every overdue surface (the 'متأخرة' chip, the
// ai-insights overdue banner's deep-link, overdue-based counts). This route is
// now the ONLY writer of status='overdue'.
//
// SCOPE BOUNDARY: WhatsApp reminders + due-today bells are owned by the separate
// /api/cron/follow-up-reminders cron. This cron only owns the status flip (+ a
// one-time overdue bell on the transition, which fires exactly once per row
// because the CAS moves it out of 'pending').
// ────────────────────────────────────────────────────────────────────────────

interface FlippedRow {
  id: string;
  lead_id: string | null;
  assigned_to: string | null;
  title: string | null;
  due_at: string;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.follow-ups-check-due') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.follow-ups-check-due', 403);
    }

    const supabase = createServiceRoleClient();
    const nowIso = new Date().toISOString();

    // ── Flip pending → overdue (CAS: only rows still pending AND now past due) ──
    // .select() returns exactly the rows that transitioned this tick, so the
    // one-time bell below fires precisely once per follow-up.
    const { data: flipped, error: flipErr } = await supabase
      .from('pyra_sales_follow_ups')
      .update({ status: 'overdue' })
      .eq('status', 'pending')
      .lt('due_at', nowIso)
      .select('id, lead_id, assigned_to, title, due_at');

    if (flipErr) {
      logError({ error: flipErr, request, metadata: { action: 'flip-overdue' } });
      console.error('[cron/follow-ups-check-due] flip failed:', flipErr.message);
      return apiServerError();
    }

    const rows = ((flipped ?? []) as FlippedRow[]).filter((r) => r.assigned_to);
    let notified = 0;

    if (rows.length > 0) {
      // Active-agent set — skip the bell for follow-ups stranded on departed
      // agents (dead inbox). The status flip still happens (overdue is overdue).
      const { data: activeUsers } = await supabase
        .from('pyra_users')
        .select('username')
        .eq('status', 'active');
      const activeSet = new Set((activeUsers ?? []).map((u) => u.username));

      // Archived leads — skip the bell for follow-ups on parked leads.
      const leadIds = [...new Set(rows.map((r) => r.lead_id).filter((v): v is string => !!v))];
      const archivedSet = new Set<string>();
      if (leadIds.length) {
        const { data: leads } = await supabase
          .from('pyra_sales_leads')
          .select('id, archived_at')
          .in('id', leadIds);
        for (const l of leads ?? []) if (l.archived_at) archivedSet.add(l.id);
      }

      const notifs = rows
        .filter((r) => r.assigned_to && activeSet.has(r.assigned_to))
        .filter((r) => !(r.lead_id && archivedSet.has(r.lead_id)))
        .map((r) => ({
          to: r.assigned_to as string,
          type: 'follow_up_due' as const,
          title: '⚠️ متابعة متأخرة',
          message: r.title || 'متابعة بدون عنوان',
          link: `/dashboard/crm/follow-ups?highlight=${r.id}`,
          entity: { type: 'follow_up', id: r.id },
        }));

      if (notifs.length > 0) {
        await notifyBatch(supabase, notifs);
        notified = notifs.length;
      }
    }

    return apiSuccess({ flipped: rows.length, notified });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'follow-ups-check-due' } });
    console.error('[cron/follow-ups-check-due] threw:', err);
    return apiServerError();
  }
}
