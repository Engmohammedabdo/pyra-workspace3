/**
 * Secret masking for the settings API.
 *
 * GET /api/settings used to `.select('key, value')` and return everything
 * verbatim, so a live `sk_live_…` Stripe key, the webhook signing secret and the
 * SMTP password were delivered to the browser on every settings page load —
 * landing in the network log, any saved HAR, the React Query cache, and the
 * reach of any browser extension with host permissions on the origin. That
 * defeated the point of audit Gap #3 Phase 1, which locked pyra_settings to
 * service-role precisely because it holds these values.
 *
 * A sentinel is used rather than a boolean `is_set` flag because the settings
 * form binds directly to the returned string map: a sentinel keeps the field a
 * string, so the input renders and the "configured" state stays visible with no
 * client change. PATCH then treats an unchanged sentinel as "leave it alone".
 */

/**
 * revealTail shows the last 4 characters so an admin can tell WHICH key is
 * installed without exposing it. Only for values with a public prefix
 * convention and enough entropy that 4 trailing characters are meaningless —
 * never for passwords, where the tail is a real fraction of the secret.
 */
export const SECRET_SETTING_KEYS: Record<string, { revealTail: boolean }> = {
  stripe_secret_key: { revealTail: true },
  stripe_webhook_secret: { revealTail: true },
  smtp_pass: { revealTail: false },
  whatsapp_ai_api_key: { revealTail: false },
};

export const MASK_BODY = '••••••••';

export function isSecretSettingKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(SECRET_SETTING_KEYS, key);
}

/** True when a submitted value is a mask coming back unchanged from the UI. */
export function isMaskedValue(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(MASK_BODY);
}

function maskOne(key: string, value: string): string {
  // Empty stays empty so the UI can honestly render "not set".
  if (!value) return '';
  return SECRET_SETTING_KEYS[key].revealTail && value.length >= 12
    ? MASK_BODY + value.slice(-4)
    : MASK_BODY;
}

/**
 * Replace every secret value with a mask. Non-secret settings — including
 * stripe_publishable_key, which is public by design and read by the client —
 * pass through untouched.
 */
export function maskSecretSettings(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...map };
  for (const key of Object.keys(out)) {
    if (isSecretSettingKey(key)) out[key] = maskOne(key, out[key] ?? '');
  }
  return out;
}
