import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_RETRIES = 5;

/**
 * Generate the next invoice number atomically.
 * Pattern: `{prefix}-{NNNN}` e.g. `INV-0042`
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

  // Fetch all matching numbers and find max numerically (lexicographic sort breaks after 9999)
  const { data: allInvoices } = await supabase
    .from('pyra_invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}-%`);

  let maxNum = 0;
  for (const inv of allInvoices || []) {
    const match = inv.invoice_number.match(/(\d+)$/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
  }
  const nextNum = maxNum + 1;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const candidate = `${prefix}-${String(nextNum + attempt).padStart(4, '0')}`;
    const { data: existing } = await supabase
      .from('pyra_invoices')
      .select('id')
      .eq('invoice_number', candidate)
      .maybeSingle();

    if (!existing) {
      return candidate;
    }
  }

  const ts = Date.now().toString(36);
  return `${prefix}-${ts}`;
}
