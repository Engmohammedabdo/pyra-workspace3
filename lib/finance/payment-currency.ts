import type { SupabaseClient } from '@supabase/supabase-js';
import { toAED } from '@/lib/utils/currency';

/**
 * Multi-currency-safe payment aggregation (finance audit 2026-07-02, Batch 4).
 *
 * pyra_payments has NO currency column — a payment's currency is its
 * invoice's currency. Locked rule: never sum across currencies. Every
 * cross-invoice aggregate resolves each payment's invoice currency and
 * converts to AED before summing (reference implementation: the P&L report).
 */
export async function getInvoiceCurrencyMap(
  supabase: SupabaseClient,
  invoiceIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const ids = [...new Set(invoiceIds.filter((x): x is string => !!x))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from('pyra_invoices')
    .select('id, currency')
    .in('id', ids);
  if (error) {
    // Fail LOUD — a silent empty map would make every payment fall back to
    // AED and produce plausible-looking wrong sums. Callers sit in
    // try/catch → clean 500 beats corrupted money figures.
    console.error('[payment-currency] invoice currency fetch failed:', error.message);
    throw error;
  }
  for (const row of data || []) {
    map.set(row.id as string, (row.currency as string) || 'AED');
  }
  return map;
}

export function sumPaymentsAED(
  payments: { amount: number | string | null; invoice_id: string | null }[],
  currencyByInvoice: Map<string, string>
): number {
  const total = payments.reduce(
    (sum, p) =>
      sum +
      toAED(
        Number(p.amount || 0),
        (p.invoice_id && currencyByInvoice.get(p.invoice_id)) || 'AED'
      ),
    0
  );
  return Math.round(total * 100) / 100;
}
