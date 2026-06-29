import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notifications/notify';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/document-expiry-check
//
// Auth: x-api-key header → pyra_api_keys
// Permission: 'cron.document-expiry-check' OR '*' wildcard
// Schedule: daily 08:00 Asia/Dubai via n8n Schedule Trigger → HTTP Request
//
// Logic:
//   1. Fetch all employee docs with a non-null expiry_date ≤ today+30d
//      where at least one alert flag (30d or 7d) is still false.
//   2. For each doc:
//      - 7-day tier  (expiry_date ≤ today+7 AND expiry_alert_7_sent=false):
//          flip expiry_alert_7_sent=true + expiry_alert_30_sent=true,
//          then notify the employee (critical).
//      - 30-day tier (else AND expiry_alert_30_sent=false):
//          flip expiry_alert_30_sent=true,
//          then notify the employee.
//      Flags flip REGARDLESS of notify outcome (idempotency — Phase 11 lock).
//   3. After the loop: send ONE grouped admin summary notification per admin
//      showing the total count of expiring docs (if any were processed).
//
// Idempotency:
//   The `expiry_alert_*_sent` flags on pyra_employee_documents are the dedup
//   mechanism. Once a flag is true the document is excluded from future scans
//   automatically (the SELECT filter `= false`).  Flags are flipped BEFORE
//   the notify call so that a notify exception cannot cause duplicate alerts.
//
// Time-zone:
//   dubaiDayKey() computes a YYYY-MM-DD key in Asia/Dubai time (UTC+4, no DST)
//   matching the format stored in pyra_employee_documents.expiry_date (date col).
// ─────────────────────────────────────────────────────────────────────────────

interface DocRow {
  id: string;
  employee_username: string;
  type_id: string;
  expiry_date: string;
  expiry_alert_30_sent: boolean;
  expiry_alert_7_sent: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    const perms = ctx.apiKey.permissions as string[];
    if (!perms.includes('cron.document-expiry-check') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.document-expiry-check', 403);
    }

    const supabase = createServiceRoleClient();

    // ── Date windows (Dubai-offset YYYY-MM-DD keys) ───────────────────────────
    const todayKey = dubaiDayKey();
    const in7Key  = dubaiDayKey(new Date(Date.now() + 7  * 24 * 60 * 60 * 1000));
    const in30Key = dubaiDayKey(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    // ── Prefetch: document type names (for human-readable notifications) ──────
    const { data: typeRows } = await supabase
      .from('pyra_document_types')
      .select('id, name_ar');
    const typeMap = new Map<string, string>(
      (typeRows ?? []).map((t: { id: string; name_ar: string }) => [t.id, t.name_ar]),
    );

    // ── Prefetch: admin usernames (grouped summary recipients) ────────────────
    const { data: adminRows } = await supabase
      .from('pyra_users')
      .select('username')
      .eq('role', 'admin')
      .eq('status', 'active');
    const adminUsernames: string[] = (adminRows ?? []).map(
      (a: { username: string }) => a.username,
    );

    // ── Q1: Candidate docs — expiring within 30 days, at least one flag unsent
    // The filter `.or('expiry_alert_30_sent.eq.false,expiry_alert_7_sent.eq.false')`
    // ensures we only process rows that still need at least one notification.
    const { data: docs, error: docsErr } = await supabase
      .from('pyra_employee_documents')
      .select('id, employee_username, type_id, expiry_date, expiry_alert_30_sent, expiry_alert_7_sent')
      .not('expiry_date', 'is', null)
      .gte('expiry_date', todayKey)  // not already expired
      .lte('expiry_date', in30Key)   // within 30-day window
      .or('expiry_alert_30_sent.eq.false,expiry_alert_7_sent.eq.false');

    if (docsErr) {
      logError({
        error: docsErr,
        request,
        metadata: { source: 'cron', job: 'document-expiry-check', stage: 'docs_select' },
      });
      console.error('[cron/document-expiry-check] docs SELECT failed:', docsErr.message);
      return apiServerError();
    }

    const allDocs = (docs ?? []) as DocRow[];
    const scanned = allDocs.length;
    let processed = 0;

    // ── Per-doc loop — per-row try/catch so one failure doesn't stop the rest ─
    for (const doc of allDocs) {
      try {
        const typeAr = typeMap.get(doc.type_id) ?? 'وثيقة';
        const within7 = doc.expiry_date <= in7Key;

        if (within7 && !doc.expiry_alert_7_sent) {
          // ── 7-day tier (critical) ──────────────────────────────────────────
          // Flip BOTH flags so the 30-day email is never sent after the 7-day one.
          // Flags flip BEFORE notify (idempotency: notify failure won't re-queue).
          await supabase
            .from('pyra_employee_documents')
            .update({ expiry_alert_7_sent: true, expiry_alert_30_sent: true })
            .eq('id', doc.id);

          await notify(supabase, {
            to: doc.employee_username,
            type: 'document_expiring_soon',
            title: 'وثيقة تنتهي خلال 7 أيام أو أقل',
            message: `${typeAr} تنتهي بتاريخ ${doc.expiry_date} — يرجى التجديد فوراً`,
            link: '/dashboard/my-documents',
            entity: { type: 'document', id: doc.id },
            from: { username: 'system' },
          });
          processed++;
        } else if (!doc.expiry_alert_30_sent) {
          // ── 30-day tier ────────────────────────────────────────────────────
          // Flip flag BEFORE notify (same idempotency guarantee).
          await supabase
            .from('pyra_employee_documents')
            .update({ expiry_alert_30_sent: true })
            .eq('id', doc.id);

          await notify(supabase, {
            to: doc.employee_username,
            type: 'document_expiring_soon',
            title: 'وثيقة تنتهي قريباً',
            message: `${typeAr} تنتهي بتاريخ ${doc.expiry_date} — لديك 30 يوماً للتجديد`,
            link: '/dashboard/my-documents',
            entity: { type: 'document', id: doc.id },
            from: { username: 'system' },
          });
          processed++;
        }
        // else: within30 but alert_30 already sent AND (within7 is false OR alert_7 already sent)
        //       → no action needed (both relevant flags already set)
      } catch (rowErr) {
        console.error(`[cron/document-expiry-check] row error doc=${doc.id}:`, rowErr);
        // Continue processing other docs — don't let one row failure abort the job.
      }
    }

    // ── Grouped admin summary ─────────────────────────────────────────────────
    // Notify each admin ONCE with the total number of expiring docs (scanned, not
    // just processed) so HR can review even docs whose alerts were previously sent.
    if (scanned > 0 && adminUsernames.length > 0) {
      for (const adminUsername of adminUsernames) {
        try {
          await notify(supabase, {
            to: adminUsername,
            type: 'document_expiring_soon',
            title: `${scanned} وثيقة موظفين تنتهي خلال 30 يوماً`,
            message: `${processed} إشعار جديد أُرسل. راجع وثائق الموظفين المنتهية أو القريبة من الانتهاء`,
            link: '/dashboard/hr/documents',
            entity: { type: 'document_summary', id: todayKey },
            from: { username: 'system' },
          });
        } catch (adminErr) {
          console.error(`[cron/document-expiry-check] admin notify error username=${adminUsername}:`, adminErr);
        }
      }
    }

    return apiSuccess({ scanned, processed });
  } catch (err) {
    logError({
      error: err,
      request,
      metadata: { source: 'cron', job: 'document-expiry-check' },
    });
    console.error('[cron/document-expiry-check] threw:', err);
    return apiServerError();
  }
}
