import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { adminLoginLimiter, accountLockoutLimiter, checkRateLimit } from '@/lib/utils/rate-limit';
import { escapePostgrestValue } from '@/lib/utils/path';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { logError } from '@/lib/observability/log-error';

const ALLOWED_ROLES = new Set(['sales_agent', 'admin']);
const DEVICE_ID_RE = /^[a-zA-Z0-9._-]{4,64}$/;

/**
 * POST /api/mobile/auth/login
 *
 * Device login for the Android call-tracking app. Sales agents log in ONCE
 * per device with their CRM credentials; this endpoint mints a per-device
 * `pyra_api_keys` row (permissions `['calls:device']`) that all later
 * /api/mobile/* requests authenticate with via the `x-api-key` header.
 *
 * Mirrors app/api/auth/login/route.ts (rate limiters, account lockout,
 * signInWithPassword, status gate) and app/api/settings/api-keys/route.ts
 * POST (nanoid raw key, sha256 key_hash, key_prefix) — see CLAUDE.md
 * "Remote Production Tracking" / call-tracking design spec.
 *
 * The Supabase Auth session is intentionally signed out right after
 * verifying the password — the mobile app never uses cookie/session auth,
 * only the minted device API key.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(adminLoginLimiter, request);
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const deviceId = typeof body?.device_id === 'string' ? body.device_id.trim() : '';
    if (!email || !password) return apiError('البريد الإلكتروني وكلمة المرور مطلوبان', 400);
    if (!DEVICE_ID_RE.test(deviceId)) return apiError('device_id غير صالح', 422);

    const lockoutKey = email.toLowerCase();
    const lockout = accountLockoutLimiter.check(lockoutKey);
    if (lockout.limited) return apiError('تم قفل الحساب مؤقتاً — حاول لاحقاً', 429);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return apiError('بيانات الدخول غير صحيحة', 401);
    // no browser session wanted — the device key is the credential
    await supabase.auth.signOut();

    const svc = createServiceRoleClient();
    const username = data.user.user_metadata?.username || data.user.email;
    const { data: pyraUser } = await svc
      .from('pyra_users')
      .select('username, display_name, role, status')
      .or(`username.eq.${escapePostgrestValue(username)},email.eq.${escapePostgrestValue(email)}`)
      .limit(1)
      .maybeSingle();

    if (!pyraUser) return apiError('هذا الحساب غير مسجل في النظام', 403);
    if (pyraUser.status !== 'active') return apiError('الحساب غير نشط — تواصل مع الإدارة', 403);
    if (!ALLOWED_ROLES.has(pyraUser.role)) return apiError('التطبيق متاح لموظفي المبيعات فقط', 403);

    // one active device per agent: deactivate previous device keys
    await svc
      .from('pyra_api_keys')
      .update({ is_active: false })
      .eq('created_by', pyraUser.username)
      .like('name', 'device:%');

    const rawKey = `pyra_${nanoid(40)}`;
    const { error: insertErr } = await svc.from('pyra_api_keys').insert({
      id: generateId('ak'),
      name: `device:${pyraUser.username}:${deviceId}`,
      key_hash: crypto.createHash('sha256').update(rawKey).digest('hex'),
      key_prefix: rawKey.substring(0, 12),
      permissions: ['calls:device'],
      is_active: true,
      expires_at: null,
      created_by: pyraUser.username,
    });
    if (insertErr) throw insertErr;

    accountLockoutLimiter.reset(lockoutKey);
    return apiSuccess({
      device_key: rawKey,
      username: pyraUser.username,
      display_name: pyraUser.display_name,
    }, undefined, 201);
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_device_login' } });
    return apiServerError();
  }
}
