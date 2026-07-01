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
          const { error: flag7Err } = await supabase
            .from('pyra_employee_documents')
            .update({ expiry_alert_7_sent: true, expiry_alert_30_sent: true })
            .eq('id', doc.id);
          if (flag7Err) {
            console.error(`[cron/document-expiry-check] 7d flag flip failed doc=${doc.id}:`, flag7Err.message);
            continue; // don't notify if the flag didn't flip — avoids duplicate alerts next run
          }

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
          const { error: flag30Err } = await supabase
            .from('pyra_employee_documents')
            .update({ expiry_alert_30_sent: true })
            .eq('id', doc.id);
          if (flag30Err) {
            console.error(`[cron/document-expiry-check] 30d flag flip failed doc=${doc.id}:`, flag30Err.message);
            continue;
          }

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

    // ── Q2: Already-expired docs that haven't had an "expired" alert yet ──────
    // A document that crossed its expiry_date silently (the 7-day alert already
    // flipped both flags) would otherwise get NO "it's now expired" signal.
    // One-shot via expiry_alert_expired_sent (migration 027), same idempotency
    // discipline: flip the flag BEFORE notify.
    let expired = 0;
    const { data: expiredDocs, error: expiredErr } = await supabase
      .from('pyra_employee_documents')
      .select('id, employee_username, type_id, expiry_date')
      .not('expiry_date', 'is', null)
      .lt('expiry_date', todayKey)
      .eq('expiry_alert_expired_sent', false)
      .limit(200); // bounded batch — the flag flip clears the rest on subsequent ticks

    if (expiredErr) {
      logError({
        error: expiredErr,
        request,
        metadata: { source: 'cron', job: 'document-expiry-check', stage: 'expired_select' },
      });
      console.error('[cron/document-expiry-check] expired SELECT failed:', expiredErr.message);
    } else {
      for (const doc of (expiredDocs ?? []) as Array<{
        id: string;
        employee_username: string;
        type_id: string;
        expiry_date: string;
      }>) {
        try {
          const typeAr = typeMap.get(doc.type_id) ?? 'وثيقة';
          const { error: flagExpErr } = await supabase
            .from('pyra_employee_documents')
            .update({ expiry_alert_expired_sent: true })
            .eq('id', doc.id);
          if (flagExpErr) {
            console.error(`[cron/document-expiry-check] expired flag flip failed doc=${doc.id}:`, flagExpErr.message);
            continue;
          }

          await notify(supabase, {
            to: doc.employee_username,
            type: 'document_expired',
            title: 'وثيقة منتهية الصلاحية',
            message: `${typeAr} انتهت بتاريخ ${doc.expiry_date} — يرجى تجديدها وتحديث الملف`,
            link: '/dashboard/my-documents',
            entity: { type: 'document', id: doc.id },
            from: { username: 'system' },
          });
          expired++;
        } catch (rowErr) {
          console.error(`[cron/document-expiry-check] expired row error doc=${doc.id}:`, rowErr);
        }
      }
    }

    // ── Grouped admin summary ─────────────────────────────────────────────────
    // Notify each admin ONCE covering both the expiring-soon and newly-expired
    // buckets so HR has a single daily action item.
    if ((scanned > 0 || expired > 0) && adminUsernames.length > 0) {
      const titleParts: string[] = [];
      if (scanned > 0) titleParts.push(`${scanned} تنتهي خلال 30 يوماً`);
      if (expired > 0) titleParts.push(`${expired} منتهية`);
      const summaryTitle = `وثائق موظفين: ${titleParts.join(' و')}`;
      for (const adminUsername of adminUsernames) {
        try {
          await notify(supabase, {
            to: adminUsername,
            type: expired > 0 ? 'document_expired' : 'document_expiring_soon',
            title: summaryTitle,
            message: `${processed} إشعار قرب-انتهاء و${expired} إشعار انتهاء أُرسلت للموظفين. راجع وثائق الموظفين.`,
            link: '/dashboard/hr/documents',
            entity: { type: 'document_summary', id: todayKey },
            from: { username: 'system' },
          });
        } catch (adminErr) {
          console.error(`[cron/document-expiry-check] admin notify error username=${adminUsername}:`, adminErr);
        }
      }
    }

    return apiSuccess({ scanned, processed, expired });
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
