import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_RETRIES = 5;

/**
 * Generate the next invoice number with race-condition mitigation.
 * Pattern: `{prefix}-{NNNN}` e.g. `INV-0042`
 *
 * Each retry re-fetches the current max to account for concurrent inserts.
 * The database UNIQUE constraint on `invoice_number` provides the final
 * safety net — callers should handle insert errors and retry if needed.
 */
export async function generateNextInvoiceNumber(
  supabase: SupabaseClient,
  prefix?: string
): Promise<string> {
  if (!prefix) {
    const { data: prefixSetting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'invoice_prefix')
      .maybeSingle();
    prefix = prefixSetting?.value || 'INV';
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Re-fetch max on EVERY attempt to pick up concurrent inserts
    const { data: allInvoices } = await supabase
      .from('pyra_invoices')
      .select('invoice_number')
      .like('invoice_number', `${prefix}-%`);

    let maxNum = 0;
    for (const inv of allInvoices || []) {
      const match = inv.invoice_number.match(/(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    }

    const candidate = `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;

    // Verify candidate is still available
    const { data: existing } = await supabase
      .from('pyra_invoices')
      .select('id')
      .eq('invoice_number', candidate)
      .maybeSingle();

    if (!existing) {
      return candidate;
    }

    // Small delay to reduce collision probability on retry
    await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
  }

  // Fallback: timestamp-based to guarantee uniqueness
  const ts = Date.now().toString(36);
  return `${prefix}-${ts}`;
}
