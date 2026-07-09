import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';

// ── Allowed setting keys (whitelist) ─────────────────────────
// Only these keys can be written via the PATCH endpoint.
// Add new keys here when you introduce new settings.
const ALLOWED_KEYS = new Set([
  // Company info
  'company_name',
  'company_logo',
  // Quote settings
  'quote_prefix',
  'quote_expiry_days',
  'vat_rate',
  // Bank data
  'bank_name',
  'bank_account_name',
  'bank_account_no',
  'bank_iban',
  // Storage / file settings
  'max_upload_size_mb',
  'max_storage_gb',
  'auto_version_on_upload',
  'max_versions_per_file',
  'trash_auto_purge_days',
  'allow_public_shares',
  'share_default_expiry_hours',
  // Security settings
  'session_timeout_minutes',
  'max_failed_logins',
  'lockout_duration_minutes',
  // Legacy / system keys (keep for backward compat)
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
  'smtp_from_name',
  'smtp_allow_insecure',
  'watermark_enabled',
  'watermark_text',
  // Invoice settings
  'invoice_prefix',
  'payment_terms_days',
  'default_currency',
  // Stripe settings
  'stripe_enabled',
  'stripe_publishable_key',
  'stripe_secret_key',
  'stripe_webhook_secret',
  // KPI settings
  'kpi_storage_warning_percent',
  // Dunning / collection settings
  'dunning_enabled',
  'late_penalty_rate',
  'late_penalty_grace_days',
  'dunning_reminder_interval_days',
  // Expense settings
  'expense_approval_required',
  // Invoice discount defaults
  'default_early_payment_discount_percent',
  'default_early_payment_discount_days',
  // Credit note settings
  'credit_note_prefix',
  // Purchase order settings
  'po_prefix',
  // Commission settings
  'commission_rate',
  'commission_trigger',
  'commission_auto_calculate',
  // Board settings
  'board_default_template',
  'board_auto_create_with_project',
  'board_require_due_date',
  'board_enable_time_tracking',
  'board_overdue_notification',
  'board_notify_on_assign',
  'board_notify_on_comment',
  'board_client_portal_visible',
  'board_max_attachments_mb',
  'board_done_auto_archive_days',
  // WhatsApp settings
  'whatsapp_ai_suggestions_enabled',
  'whatsapp_ai_provider',
  'whatsapp_ai_api_key',
  'whatsapp_business_hours',
]);

// =============================================================
// GET /api/settings
// Get all settings as key-value object (admin only)
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('settings.view');
    if (isApiError(auth)) return auth;

    // Service role: pyra_settings is locked to service-role-only (audit Gap #3
    // Phase 1 — it holds SMTP/Stripe secrets). This route is admin-gated above
    // (settings.view / settings.manage), so service role is the correct client.
    const supabase = createServiceRoleClient();

    const { data: settings, error } = await supabase
      .from('pyra_settings')
      .select('key, value');

    if (error) {
      console.error('Settings list error:', error);
      return apiServerError();
    }

    // Transform array to key-value object
    const settingsMap: Record<string, string> = {};
    for (const setting of settings || []) {
      settingsMap[setting.key] = setting.value;
    }

    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'settings_updated', '/dashboard/settings', {});

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
    const auth = await requireApiPermission('settings.manage');
    if (isApiError(auth)) return auth;

    const t = await getTranslations('api');
    const body = await request.json();

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return apiValidationError(t('settings.updateRequired'));
    }

    // ── Validate keys against whitelist ────────────────────
    const invalidKeys = Object.keys(body).filter((k) => !ALLOWED_KEYS.has(k.trim()));
    if (invalidKeys.length > 0) {
      return apiValidationError(
        t('settings.disallowedKeys', { keys: invalidKeys.join(', ') })
      );
    }

    // Service role: pyra_settings is locked to service-role-only (audit Gap #3
    // Phase 1 — it holds SMTP/Stripe secrets). This route is admin-gated above
    // (settings.view / settings.manage), so service role is the correct client.
    const supabase = createServiceRoleClient();
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
      return apiServerError(t('settings.updateFailed', { errors: errors.join(', ') }));
    }

    // Return the updated settings
    const { data: settings } = await supabase
      .from('pyra_settings')
      .select('key, value');

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
