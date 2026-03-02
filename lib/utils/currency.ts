/**
 * Currency conversion utility.
 * All financial reports aggregate amounts in AED.
 * Non-AED amounts are converted using fixed exchange rates.
 */

const EXCHANGE_RATES: Record<string, number> = {
  AED: 1,
  USD: 3.67,
  // Add more as needed:
  // EUR: 4.00,
  // GBP: 4.65,
  // SAR: 0.98,
};

/**
 * Convert an amount to AED using fixed exchange rates.
 * If the currency is already AED or unknown, returns the amount as-is.
 * Rounds to 2 decimal places for financial precision.
 */
export function toAED(amount: number, currency?: string | null): number {
  if (!Number.isFinite(amount)) return 0;
  if (!currency || currency === 'AED') return amount;
  const rate = EXCHANGE_RATES[currency.toUpperCase()];
  if (!rate) {
    console.warn(`toAED: unknown currency "${currency}", returning amount as-is`);
    return amount;
  }
  // Round to 2 decimal places to avoid floating-point precision issues
  return Math.round(amount * rate * 100) / 100;
}
