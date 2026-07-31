import type { SupabaseClient } from '@supabase/supabase-js';
import { parseSettingBool, parseSettingNumber } from '@/lib/settings/parse';

/**
 * Card-fee surcharge added on top of an invoice at payment time.
 *
 * The surcharge lives OUTSIDE the invoice (owner's locked decision, 2026-07-25):
 * it is never a pyra_invoice_items row and never a second pyra_payments row. Only
 * the BASE settles the invoice; the surcharge is carried in Stripe session
 * metadata so splitGross() can separate it again at settlement.
 */

/**
 * Sanity ceiling. A fat-fingered "35" instead of "3.5" would otherwise charge a
 * client ten times the intended fee, so anything above this is treated as
 * misconfiguration and the surcharge is dropped to zero.
 */
export const MAX_SURCHARGE_PERCENT = 10;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Split a base amount into its surcharge and gross.
 *
 * ADDITIVE, deliberately — `surcharge` is rounded first, then added:
 *     surcharge = round2(base * pct / 100)
 *     gross     = round2(base + surcharge)
 *
 * The multiplicative form `round2(base * (1 + pct/100))` is NOT equivalent: the
 * two disagree by 0.01 on a small fraction of base/rate pairs, which would leave
 * the gross one fils away from base + surcharge and make the payer's receipt
 * fail to add up. Always compute the surcharge first and add it.
 */
export function calcSurcharge(base: number, percent: number): { surcharge: number; gross: number } {
  const b = round2(base);
  if (!Number.isFinite(percent) || percent <= 0) return { surcharge: 0, gross: b };
  const surcharge = round2((b * percent) / 100);
  return { surcharge, gross: round2(b + surcharge) };
}

/**
 * Validate a per-link override. Returns null when it is not usable, so the
 * caller falls back to the configured default.
 *
 * Absent values are rejected BEFORE the numeric coercion: `Number(null)`,
 * `Number('')` and `Number([])` are all 0, which would otherwise be read as an
 * explicit "charge no fee this time" and silently bypass the default.
 */
export function normalizeSurchargePercent(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;

  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > MAX_SURCHARGE_PERCENT) return null;
  // 2dp is plenty for a fee rate and keeps the stored value tidy.
  return Math.round(n * 100) / 100;
}

/**
 * The configured default surcharge percent, or 0.
 *
 * FAILS TO ZERO by design: if the setting is missing, disabled, unparseable, or
 * out of range we absorb the fee rather than overcharge a client. Getting this
 * backwards would silently inflate every payment.
 */
export async function getSurchargePercent(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('pyra_settings')
    .select('key, value')
    .in('key', ['stripe_surcharge_enabled', 'stripe_surcharge_percent']);

  if (error) return 0;

  const map = Object.fromEntries(
    (data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]),
  );

  if (!parseSettingBool(map.stripe_surcharge_enabled, false)) return 0;

  const pct = parseSettingNumber(map.stripe_surcharge_percent, 0);
  if (pct <= 0 || pct > MAX_SURCHARGE_PERCENT) return 0;
  return pct;
}
