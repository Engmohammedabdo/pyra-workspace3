import Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';

let _stripe: Stripe | null = null;
let _cachedKey: string | null = null;

/**
 * Read a Stripe setting from pyra_settings table, fallback to env var.
 */
async function getSettingValue(settingKey: string, envKey: string): Promise<string | undefined> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', settingKey)
      .maybeSingle();
    if (data?.value) return data.value;
  } catch {
    // DB read failed — fall through to env
  }
  return process.env[envKey] || undefined;
}

/**
 * Get Stripe client — reads secret key from DB settings first, falls back to env.
 * Caches the client and re-creates if the key changes.
 */
export async function getStripeClient(): Promise<Stripe> {
  const key = await getSettingValue('stripe_secret_key', 'STRIPE_SECRET_KEY');
  if (!key) throw new Error('Stripe secret key not configured');

  if (!_stripe || _cachedKey !== key) {
    _stripe = new Stripe(key, { typescript: true });
    _cachedKey = key;
  }
  return _stripe;
}

/**
 * Get Stripe webhook secret from DB settings or env.
 */
export async function getStripeWebhookSecret(): Promise<string | undefined> {
  return getSettingValue('stripe_webhook_secret', 'STRIPE_WEBHOOK_SECRET');
}

/**
 * Check if Stripe is enabled (has a configured secret key).
 */
export async function isStripeEnabled(): Promise<boolean> {
  const key = await getSettingValue('stripe_secret_key', 'STRIPE_SECRET_KEY');
  return !!key;
}

/**
 * @deprecated Use getStripeClient() instead. Kept for sync compatibility.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      typescript: true,
    });
  }
  return _stripe;
}
