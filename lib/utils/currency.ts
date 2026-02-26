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
 */
export function toAED(amount: number, currency?: string | null): number {
  if (!currency || currency === 'AED') return amount;
  const rate = EXCHANGE_RATES[currency.toUpperCase()];
  return rate ? amount * rate : amount;
}
