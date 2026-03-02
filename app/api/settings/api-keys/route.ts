import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { API_KEY_FIELDS } from '@/lib/supabase/fields';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

/**
 * GET /api/settings/api-keys
 * List all API keys (excludes key_hash for security).
 * Admin only.
 */
export async function GET() {
  try {
    const auth = await requireApiPermission('settings.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_api_keys')
      .select(API_KEY_FIELDS)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return apiSuccess(data || []);
  } catch {
    return apiServerError();
  }
}

/**
 * POST /api/settings/api-keys
 * Create a new API key.
 * Admin only.
 * Returns the FULL key once (will never be shown again).
 *
 * Body: { name, permissions: string[], expires_at? }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('settings.manage');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const body = await req.json();

    const { name, permissions, expires_at } = body;

    if (!name || !name.trim()) {
      return apiError('اسم المفتاح مطلوب', 422);
    }
    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return apiError('الصلاحيات مطلوبة', 422);
    }

    // Generate the raw API key
    const rawKey = `pyra_${nanoid(40)}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);

    const apiKeyId = generateId('ak');

    const { data, error } = await supabase
      .from('pyra_api_keys')
      .insert({
        id: apiKeyId,
        name: name.trim(),
        key_hash: keyHash,
        key_prefix: keyPrefix,
        permissions,
        is_active: true,
        expires_at: expires_at || null,
        created_by: auth.pyraUser.username,
      })
      .select(API_KEY_FIELDS)
      .single();

    if (error) throw error;

    // Activity log
    supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'create_api_key',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/settings/api-keys/${apiKeyId}`,
      details: { name: name.trim(), permissions },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    // Return the full key ONCE along with the record
    return apiSuccess({ ...data, key: rawKey }, undefined, 201);
  } catch {
    return apiServerError();
  }
}
