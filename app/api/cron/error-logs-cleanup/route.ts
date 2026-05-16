import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/error-logs-cleanup
//
// Phase D Commit 3 (audit P2 #3) — retention TTL for pyra_error_logs.
//
// Auth: x-api-key header → pyra_api_keys (mirrors follow-up-reminders +
//   lead-idle-check pattern)
// Permission: 'cron.error-logs-cleanup' (or '*' wildcard)
// Schedule: 0 3 * * * (daily 03:00 Dubai) via n8n Schedule Trigger →
//   HTTP Request node hitting this endpoint
//
// Logic (LOCK Q-D-4 — hardcoded 90 days):
//   DELETE FROM pyra_error_logs WHERE created_at < NOW() - INTERVAL '90 days'
//
// GDPR/PDPL alignment: Article 5(1)(e) storage limitation. Phase 14.1 left
// the table append-mostly with no TTL, accumulating PII (even after the
// 5-layer redaction, user_id is a username and request_path may carry IDs).
// 90 days balances forensic value against retention discipline.
//
// Tuning: 90 days is intentionally hardcoded (Phase 14.2 simplicity
// philosophy — no runtime knob until proven need). v1.1 may add
// ERROR_LOGS_RETENTION_DAYS env var if SOC2/audit asks for a different
// window, but the audit recommended 90d and Pyramedia is not regulated
// to a stricter standard today.
//
// Idempotency: deleting old rows is naturally idempotent — re-running
// the cron the same day is a no-op (no rows match the cutoff). No row-
// count cap; if the table accumulates >100k rows the DELETE could be
// slow, but at ~14k rows/year typical growth (CRM-PROGRESS estimate)
// this won't happen until year 7+.
// ────────────────────────────────────────────────────────────────────────────

const RETENTION_DAYS = 90;

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.error-logs-cleanup') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.error-logs-cleanup', 403);
    }

    const supabase = createServiceRoleClient();

    // Compute cutoff = now - 90 days (ISO string for the .lt() comparison)
    const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();

    // Delete + return count via select header. Supabase JS doesn't expose a
    // direct DELETE-with-count in one call, so we use a 2-step pattern:
    // first count what we're about to delete (for telemetry), then delete.
    const { count: pruneCount, error: countErr } = await supabase
      .from('pyra_error_logs')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', cutoffIso);

    if (countErr) {
      logError({
        error: countErr,
        request,
        metadata: { action: 'error-logs-cleanup', stage: 'count', cutoff: cutoffIso },
      });
      console.error('[cron/error-logs-cleanup] count failed:', countErr.message);
      return apiServerError();
    }

    if ((pruneCount ?? 0) === 0) {
      return apiSuccess({
        deleted: 0,
        cutoff: cutoffIso,
        retention_days: RETENTION_DAYS,
        message: 'no rows older than retention window',
      });
    }

    // Phase D Commit 3 Reviewer MEDIUM fix — request the actual deleted
    // count from the DELETE call (Supabase JS supports { count: 'exact' }
    // on delete). The pre-delete count was used for telemetry only; the
    // response's `deleted` field must reflect the REAL delete count so
    // n8n workflows alerting on unexpected counts get accurate data.
    const { count: deletedCount, error: deleteErr } = await supabase
      .from('pyra_error_logs')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffIso);

    if (deleteErr) {
      logError({
        error: deleteErr,
        request,
        metadata: { action: 'error-logs-cleanup', stage: 'delete', cutoff: cutoffIso, would_prune: pruneCount },
      });
      console.error('[cron/error-logs-cleanup] delete failed:', deleteErr.message);
      return apiServerError();
    }

    const actualDeleted = deletedCount ?? 0;
    console.log(
      `[cron/error-logs-cleanup] pruned ${actualDeleted} rows older than ${cutoffIso} (retention ${RETENTION_DAYS}d, pre-count estimate ${pruneCount})`,
    );

    return apiSuccess({
      deleted: actualDeleted,
      estimated_before_delete: pruneCount ?? 0,
      cutoff: cutoffIso,
      retention_days: RETENTION_DAYS,
    });
  } catch (err) {
    logError({
      error: err,
      request,
      metadata: { action: 'error-logs-cleanup', stage: 'outer' },
    });
    console.error('[cron/error-logs-cleanup] threw:', err);
    return apiServerError();
  }
}
