import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { lockAccount, unlockAccount } from '@/lib/hr/lock-account';
import { notifyMany } from '@/lib/notifications/notify';
import { logError } from '@/lib/observability/log-error';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/access-reconcile
//
// Auth: x-api-key header → pyra_api_keys
// Permission: 'cron.access-reconcile' OR '*' wildcard
// Schedule: daily 06:00 UTC (10:00 Dubai) via n8n Schedule Trigger → HTTP Request
//           (PyraHR_Cron workflow — see offboarding task-6 brief step 4)
//
// This is the offboarding safety net (Task 6): a PATCH-time hook
// (lib/hr/lock-account.ts wired into the users PATCH route) locks/unlocks a
// GoTrue account the moment an admin flips pyra_users.status via the UI. But
// three paths bypass that hook entirely:
//   - Users already deactivated BEFORE the lock-account hook shipped
//   - The service-role onboarding-cancel path (sets status directly, no PATCH)
//   - The re-hire ban bug (an account re-activated without an explicit unban)
//
// This cron asserts the desired ban state for EVERY user, unconditionally,
// every day — closing all three gaps regardless of which write path produced
// the drift.
//
// Idempotency-by-assertion: auth.users.banned_until is NOT readable via
// PostgREST (the auth schema is not exposed to the client), so the cron
// cannot "check current ban state, then fix only what's wrong". Instead it
// unconditionally calls lockAccount()/unlockAccount() for every row.
// lockAccount/unlockAccount are themselves idempotent at the GoTrue layer
// (re-banning a banned user or re-unbanning an active user is a no-op), so
// this is safe to run daily regardless of the previous day's outcome. Cost:
// one GoTrue admin call per user per run (~7 users today) — acceptable at
// this scale. v1.1 could add a readable ban-state cache if the user count
// grows large enough to matter.
// ─────────────────────────────────────────────────────────────────────────────

interface UserRow {
  username: string;
  status: string | null;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.access-reconcile') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.access-reconcile', 403);
    }

    const supabase = createServiceRoleClient();

    // ── Fetch every user's status ────────────────────────────────────────────
    const { data: users, error } = await supabase
      .from('pyra_users')
      .select('username, status');

    if (error) {
      logError({ error, request, metadata: { source: 'cron', job: 'access-reconcile', stage: 'users_select' } });
      console.error('[cron/access-reconcile] users SELECT failed:', error.message);
      return apiServerError();
    }

    // ── Assert the desired ban state for every user (idempotent) ────────────
    let banned = 0;
    let unbanned = 0;
    const failures: string[] = [];

    for (const u of (users ?? []) as UserRow[]) {
      if (u.status !== 'active') {
        const r = await lockAccount(supabase, u.username);
        if (r.locked) banned += 1;
        else failures.push(`${u.username}:lock:${r.error}`);
      } else {
        const r = await unlockAccount(supabase, u.username);
        if (r.unlocked) unbanned += 1;
        else failures.push(`${u.username}:unlock:${r.error}`);
      }
    }

    // A non-empty failures list means a write path bypassed the PATCH hook —
    // surface it to active admins so it doesn't rot silently (most common
    // cause: a username with no pyra_auth_mapping row — resolveAuthUserId
    // could not resolve an auth user id to ban/unban).
    if (failures.length > 0) {
      const { data: admins } = await supabase
        .from('pyra_users')
        .select('username')
        .eq('role', 'admin')
        .eq('status', 'active');

      await notifyMany(
        supabase,
        (admins ?? []).map((a: { username: string }) => a.username),
        {
          type: 'system',
          title: 'تعذّر ضبط قفل بعض الحسابات',
          message: `فشل ضبط ${failures.length} حساب أثناء المطابقة اليومية`,
          link: '/dashboard/users',
          from: { username: 'system' },
        },
      );
    }

    return apiSuccess({ banned, unbanned, failures });
  } catch (err) {
    logError({ error: err, request, metadata: { source: 'cron', job: 'access-reconcile' } });
    console.error('[cron/access-reconcile] threw:', err);
    return apiServerError();
  }
}
