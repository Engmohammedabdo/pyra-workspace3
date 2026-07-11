import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyMany } from '@/lib/notifications/notify';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/device-silent-check
//
// Auth: x-api-key header → pyra_api_keys
// Permission: 'cron.device-silent-check' (or '*' wildcard)
// Schedule: n8n Schedule Trigger — the 25h silence window tolerates a
//   coarse schedule (hourly or every few hours is plenty).
//
// Problem this closes: if Samsung's aggressive background-kill stops the
// call-tracking app, syncing silently stops. Normal syncs only touch the
// network when there ARE calls to send, so `pyra_api_keys.last_used_at`
// alone can't distinguish "phone idle, nothing to sync" from "app dead" —
// GET /api/mobile/ping (called on every EMPTY sync pass) closes that gap
// app-side; this cron is the server-side detector watching for silence.
//
// Logic:
//   1. SELECT active device keys (`name LIKE 'device:%'`).
//   2. silentSince = last_used_at ?? created_at. Candidate if
//      silentSince < now - 25h (15-min sync cadence + generous slack).
//   3. Skip candidates whose owner (created_by) is not an active
//      pyra_users row — a departed agent's retired phone is not an alert.
//   4. Per-device Dubai-day dedup: skip if a 'device_sync_silent'
//      notification already exists for this key's id since Dubai-midnight.
//   5. Notify every active admin (notifyMany) — one notification per
//      still-silent device, all active admins as recipients.
//
// Time-zone: dubaiDayKey() (pure UTC+4 offset math, no DST) is used to
// derive the Dubai-midnight boundary for dedup — never a raw
// `.toISOString().slice(0, 10)` (Phase 15.1 lock).
// ────────────────────────────────────────────────────────────────────────────

const SILENT_THRESHOLD_MS = 25 * 60 * 60 * 1000; // 25h

interface DeviceKeyRow {
  id: string;
  name: string;
  created_by: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface OwnerRow {
  username: string;
  display_name: string;
  status: string;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.device-silent-check') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.device-silent-check', 403);
    }

    const supabase = createServiceRoleClient();
    const now = Date.now();

    // ── Q1: active device keys ──
    const { data: keyRows, error: keysErr } = await supabase
      .from('pyra_api_keys')
      .select('id, name, created_by, last_used_at, created_at')
      .like('name', 'device:%')
      .eq('is_active', true);

    if (keysErr) {
      logError({
        error: keysErr,
        request,
        metadata: { source: 'cron', job: 'device-silent-check', stage: 'keys_select' },
      });
      console.error('[cron/device-silent-check] keys SELECT failed:', keysErr.message);
      return apiServerError();
    }

    const allKeys = (keyRows ?? []) as DeviceKeyRow[];
    const checked = allKeys.length;
    if (checked === 0) {
      return apiSuccess({ checked: 0, silent: 0, notified: 0, skipped_dedup: 0, skipped_inactive_owner: 0 });
    }

    // ── Candidates: silent for > 25h ──
    const candidates = allKeys.filter((k) => {
      const silentSinceMs = new Date(k.last_used_at ?? k.created_at).getTime();
      return now - silentSinceMs > SILENT_THRESHOLD_MS;
    });
    const silent = candidates.length;
    if (silent === 0) {
      return apiSuccess({ checked, silent: 0, notified: 0, skipped_dedup: 0, skipped_inactive_owner: 0 });
    }

    // ── Owner active-status check (skip departed agents' retired phones) ──
    const ownerUsernames = Array.from(
      new Set(candidates.map((k) => k.created_by).filter((u): u is string => !!u)),
    );
    const ownerMap = new Map<string, OwnerRow>();
    if (ownerUsernames.length > 0) {
      const { data: ownerRows, error: ownersErr } = await supabase
        .from('pyra_users')
        .select('username, display_name, status')
        .in('username', ownerUsernames);
      if (ownersErr) {
        logError({
          error: ownersErr,
          request,
          metadata: { source: 'cron', job: 'device-silent-check', stage: 'owners_select' },
        });
        console.error('[cron/device-silent-check] owners SELECT failed:', ownersErr.message);
        return apiServerError();
      }
      for (const u of (ownerRows ?? []) as OwnerRow[]) ownerMap.set(u.username, u);
    }

    let skippedInactiveOwner = 0;
    const activeCandidates = candidates.filter((k) => {
      const owner = k.created_by ? ownerMap.get(k.created_by) : undefined;
      if (!owner || owner.status !== 'active') {
        skippedInactiveOwner++;
        return false;
      }
      return true;
    });

    if (activeCandidates.length === 0) {
      return apiSuccess({
        checked,
        silent,
        notified: 0,
        skipped_dedup: 0,
        skipped_inactive_owner: skippedInactiveOwner,
      });
    }

    // ── Per-device Dubai-day dedup ──
    // dubaiDayKey() → 'YYYY-MM-DD' in Asia/Dubai (pure UTC+4 offset math).
    // Dubai midnight, in UTC, is that date's 00:00:00Z minus the 4h offset.
    const todayKey = dubaiDayKey();
    const dubaiOffsetMs = 4 * 60 * 60 * 1000; // Asia/Dubai is UTC+4 (no DST)
    const dubaiMidnightUtcIso = new Date(
      new Date(`${todayKey}T00:00:00.000Z`).getTime() - dubaiOffsetMs,
    ).toISOString();

    const candidateIds = activeCandidates.map((k) => k.id);
    const { data: existingNotifs, error: dedupErr } = await supabase
      .from('pyra_notifications')
      .select('entity_id')
      .eq('type', 'device_sync_silent')
      .in('entity_id', candidateIds)
      .gte('created_at', dubaiMidnightUtcIso);
    if (dedupErr) {
      logError({
        error: dedupErr,
        request,
        metadata: { source: 'cron', job: 'device-silent-check', stage: 'dedup_select' },
      });
      console.error('[cron/device-silent-check] dedup SELECT failed:', dedupErr.message);
      return apiServerError();
    }
    const alreadyNotifiedSet = new Set(
      ((existingNotifs ?? []) as Array<{ entity_id: string }>).map((r) => r.entity_id),
    );

    const toNotify = activeCandidates.filter((k) => !alreadyNotifiedSet.has(k.id));
    const skippedDedup = activeCandidates.length - toNotify.length;

    if (toNotify.length === 0) {
      return apiSuccess({
        checked,
        silent,
        notified: 0,
        skipped_dedup: skippedDedup,
        skipped_inactive_owner: skippedInactiveOwner,
      });
    }

    // ── Resolve active admins (recipients) ──
    const { data: adminRows, error: adminsErr } = await supabase
      .from('pyra_users')
      .select('username')
      .eq('role', 'admin')
      .eq('status', 'active');
    if (adminsErr) {
      logError({
        error: adminsErr,
        request,
        metadata: { source: 'cron', job: 'device-silent-check', stage: 'admins_select' },
      });
      console.error('[cron/device-silent-check] admins SELECT failed:', adminsErr.message);
      return apiServerError();
    }
    const adminUsernames = ((adminRows ?? []) as Array<{ username: string }>).map((a) => a.username);

    let notified = 0;
    if (adminUsernames.length > 0) {
      for (const key of toNotify) {
        try {
          const owner = key.created_by ? ownerMap.get(key.created_by) : undefined;
          const silentSinceMs = new Date(key.last_used_at ?? key.created_at).getTime();
          const hoursSilent = Math.floor((now - silentSinceMs) / (60 * 60 * 1000));
          await notifyMany(supabase, adminUsernames, {
            type: 'device_sync_silent',
            title: 'هاتف متوقف عن المزامنة',
            message: `هاتف ${owner?.display_name ?? key.created_by ?? 'غير معروف'} متوقف عن المزامنة منذ ${hoursSilent} ساعة`,
            link: '/dashboard/crm/calls',
            entity: { type: 'device', id: key.id },
            from: { username: 'system' },
          });
          notified++;
        } catch (notifyErr) {
          console.error(`[cron/device-silent-check] notify error key=${key.id}:`, notifyErr);
        }
      }
    }

    return apiSuccess({
      checked,
      silent,
      notified,
      skipped_dedup: skippedDedup,
      skipped_inactive_owner: skippedInactiveOwner,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { source: 'cron', job: 'device-silent-check' } });
    console.error('POST /api/cron/device-silent-check threw:', err);
    return apiServerError();
  }
}
