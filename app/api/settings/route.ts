import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// ── Allowed setting keys (whitelist) ─────────────────────────
// Only these keys can be written via the PATCH endpoint.
// Add new keys here when you introduce new settings.
const ALLOWED_KEYS = new Set([
  'app_name',
  'app_logo',
  'primary_color',
  'secondary_color',
  'max_upload_size',
  'allowed_extensions',
  'default_language',
  'maintenance_mode',
  'portal_enabled',
  'portal_welcome_message',
  'notification_email',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_pass',
  'smtp_from',
  'watermark_enabled',
  'watermark_text',
]);

// =============================================================
// GET /api/settings
// Get all settings as key-value object (admin only)
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = await createServerSupabaseClient();

    const { data: settings, error } = await supabase
      .from('pyra_settings')
      .select('*');

    if (error) {
      console.error('Settings list error:', error);
      return apiServerError();
    }

    // Transform array to key-value object
    const settingsMap: Record<string, string> = {};
    for (const setting of settings || []) {
      settingsMap[setting.key] = setting.value;
    }

    return apiSuccess(settingsMap);
  } catch (err) {
    console.error('GET /api/settings error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/settings
// Update settings (admin only)
// Body: { key: value, ... }
// =============================================================
export async function PATCH(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const body = await request.json();

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return apiValidationError('يجب تقديم إعدادات للتحديث');
    }

    // ── Validate keys against whitelist ────────────────────
    const invalidKeys = Object.keys(body).filter((k) => !ALLOWED_KEYS.has(k.trim()));
    if (invalidKeys.length > 0) {
      return apiValidationError(
        `مفاتيح غير مسموح بها: ${invalidKeys.join(', ')}`
      );
    }

    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();
    const errors: string[] = [];

    // Upsert each key-value pair
    for (const [key, value] of Object.entries(body)) {
      const { error } = await supabase
        .from('pyra_settings')
        .upsert(
          {
            key: key.trim(),
            value: String(value),
            updated_at: now,
          },
          { onConflict: 'key' }
        );

      if (error) {
        console.error(`Setting upsert error for "${key}":`, error);
        errors.push(key);
      }
    }

    if (errors.length > 0) {
      return apiServerError(`فشل تحديث الإعدادات: ${errors.join(', ')}`);
    }

    // Return the updated settings
    const { data: settings } = await supabase
      .from('pyra_settings')
      .select('*');

    const settingsMap: Record<string, string> = {};
    for (const setting of settings || []) {
      settingsMap[setting.key] = setting.value;
    }

    return apiSuccess(settingsMap);
  } catch (err) {
    console.error('PATCH /api/settings error:', err);
    return apiServerError();
  }
}
