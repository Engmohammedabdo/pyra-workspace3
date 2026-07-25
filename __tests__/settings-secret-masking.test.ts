import { describe, it, expect } from 'vitest';
import {
  maskSecretSettings,
  isMaskedValue,
  isSecretSettingKey,
  MASK_BODY,
  SECRET_SETTING_KEYS,
} from '@/app/api/settings/mask';

/**
 * GET /api/settings returned every value verbatim, so the live sk_live_ Stripe
 * key, the webhook signing secret and the SMTP password reached the browser on
 * every settings page load.
 */
describe('maskSecretSettings', () => {
  it('never returns a live Stripe secret', () => {
    const out = maskSecretSettings({ stripe_secret_key: 'sk_live_ABCDEFGHIJKLMNOPQRST' });
    expect(out.stripe_secret_key).not.toContain('sk_live_');
    expect(out.stripe_secret_key).toBe(MASK_BODY + 'QRST');
  });

  it('masks every declared secret key', () => {
    for (const key of Object.keys(SECRET_SETTING_KEYS)) {
      const out = maskSecretSettings({ [key]: 'supersecretvalue12345' });
      expect(out[key].startsWith(MASK_BODY)).toBe(true);
      expect(out[key]).not.toContain('supersecret');
    }
  });

  it('does not reveal a tail for password-like secrets', () => {
    // smtp_pass is short enough that 4 trailing chars are a real fraction of it.
    expect(maskSecretSettings({ smtp_pass: 'hunter2hunter2hunter2' }).smtp_pass).toBe(MASK_BODY);
  });

  it('leaves the publishable key readable — it is public by design', () => {
    const pk = 'pk_live_51ABCDEF';
    expect(maskSecretSettings({ stripe_publishable_key: pk }).stripe_publishable_key).toBe(pk);
  });

  it('passes ordinary settings through untouched', () => {
    expect(maskSecretSettings({ company_name: 'Pyramedia' }).company_name).toBe('Pyramedia');
  });

  it('leaves an unset secret empty so the UI can show "not set"', () => {
    expect(maskSecretSettings({ stripe_secret_key: '' }).stripe_secret_key).toBe('');
  });

  it('does not mutate the input map', () => {
    const input = { stripe_secret_key: 'sk_live_ABCDEFGHIJKL' };
    maskSecretSettings(input);
    expect(input.stripe_secret_key).toBe('sk_live_ABCDEFGHIJKL');
  });
});

/**
 * The settings form round-trips whatever GET returned. Without this guard a save
 * that never touched the Stripe field would overwrite the real key with bullets.
 */
describe('isMaskedValue', () => {
  it('recognises a mask coming back from the UI', () => {
    expect(isMaskedValue(MASK_BODY)).toBe(true);
    expect(isMaskedValue(MASK_BODY + 'QRST')).toBe(true);
  });

  it('does not mistake a real new secret for a mask', () => {
    expect(isMaskedValue('sk_live_brandnewkey')).toBe(false);
    expect(isMaskedValue('')).toBe(false);
  });

  it('tolerates non-string input', () => {
    expect(isMaskedValue(undefined)).toBe(false);
    expect(isMaskedValue(42)).toBe(false);
  });
});

describe('isSecretSettingKey', () => {
  it('identifies the secrets and nothing else', () => {
    expect(isSecretSettingKey('stripe_secret_key')).toBe(true);
    expect(isSecretSettingKey('stripe_publishable_key')).toBe(false);
    expect(isSecretSettingKey('company_name')).toBe(false);
  });

  it('is not fooled by inherited Object properties', () => {
    expect(isSecretSettingKey('constructor')).toBe(false);
    expect(isSecretSettingKey('toString')).toBe(false);
  });
});
