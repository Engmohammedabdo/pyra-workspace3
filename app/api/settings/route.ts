import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/settings
// Get all settings as key-value object (admin only)
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

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
    if (!admin) return apiUnauthorized();

    const body = await request.json();

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return apiValidationError('يجب تقديم إعدادات للتحديث');
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
