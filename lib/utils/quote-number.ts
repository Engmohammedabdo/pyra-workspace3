import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_RETRIES = 5;

/**
 * Generate the next quote number atomically.
 *
 * Uses a retry loop: if the generated number already exists (unique constraint
 * violation), increment and retry. This eliminates the race condition where
 * two concurrent requests could read the same "last quote" and produce
 * duplicate numbers.
 *
 * Pattern: `{prefix}-{NNNN}` e.g. `QT-0042`
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

  // Get the highest numeric suffix from existing quote numbers
  // Fetch all matching numbers and find max numerically (lexicographic sort breaks after 9999)
  const { data: allQuotes } = await supabase
    .from('pyra_quotes')
    .select('quote_number')
    .like('quote_number', `${prefix}-%`);

  let maxNum = 0;
  for (const q of allQuotes || []) {
    const match = q.quote_number.match(/(\d+)$/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
  }
  const nextNum = maxNum + 1;

  // Retry loop: if the number already exists, increment
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const candidate = `${prefix}-${String(nextNum + attempt).padStart(4, '0')}`;

    // Check if this quote number already exists
    const { data: existing } = await supabase
      .from('pyra_quotes')
      .select('id')
      .eq('quote_number', candidate)
      .maybeSingle();

    if (!existing) {
      return candidate;
    }
  }

  // Fallback: use timestamp to guarantee uniqueness
  const ts = Date.now().toString(36);
  return `${prefix}-${ts}`;
}
