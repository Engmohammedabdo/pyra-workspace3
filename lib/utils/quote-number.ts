import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_RETRIES = 5;

/**
 * Generate the next quote number with race-condition mitigation.
 * Pattern: `{prefix}-{NNNN}` e.g. `QT-0042`
 *
 * Each retry re-fetches the current max to account for concurrent inserts.
 * The database UNIQUE constraint on `quote_number` provides the final
 * safety net — callers should handle insert errors and retry if needed.
 */
export async function generateNextQuoteNumber(
  supabase: SupabaseClient,
  prefix?: string
): Promise<string> {
  // Get prefix from settings if not provided
  if (!prefix) {
    const { data: prefixSetting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'quote_prefix')
      .maybeSingle();
    prefix = prefixSetting?.value || 'QT';
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Re-fetch max on EVERY attempt to pick up concurrent inserts
    const { data: allQuotes } = await supabase
      .from('pyra_quotes')
      .select('quote_number')
      .like('quote_number', `${prefix}-%`);

    let maxNum = 0;
    for (const q of allQuotes || []) {
      const match = q.quote_number.match(/(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    }

    const candidate = `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;

    // Verify candidate is still available
    const { data: existing } = await supabase
      .from('pyra_quotes')
      .select('id')
      .eq('quote_number', candidate)
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
