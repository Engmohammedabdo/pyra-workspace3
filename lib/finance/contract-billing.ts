import type { SupabaseClient } from '@supabase/supabase-js';
import { INVOICE_STATUS } from '@/lib/constants/statuses';

/**
 * Recompute a contract's amount_billed from its ACTUAL linked invoices —
 * direct `contract_id` link plus milestone-linked invoices — excluding
 * cancelled ones.
 *
 * Finance audit 2026-07-02 (F-BILLED): the old pattern incremented
 * amount_billed on every generate but never decremented on invoice delete or
 * total edit — production drifted to 143,000 billed vs 46,000 real invoices.
 * Derive-from-source is the only safe pattern (mirrors how amount_collected
 * re-sums pyra_payments everywhere).
 *
 * Fire-and-forget-safe: errors are logged, never thrown — callers must not
 * fail a money write because the derived counter refresh failed (the next
 * recompute self-heals).
 */
export async function recalcContractBilled(
  supabase: SupabaseClient,
  contractId: string | null | undefined
): Promise<void> {
  if (!contractId) return;
  try {
    const { data: direct } = await supabase
      .from('pyra_invoices')
      .select('id, total, status')
      .eq('contract_id', contractId);

    const { data: milestoneLinks } = await supabase
      .from('pyra_contract_milestones')
      .select('invoice_id')
      .eq('contract_id', contractId)
      .not('invoice_id', 'is', null);

    const directIds = new Set((direct || []).map((i: { id: string }) => i.id));
    const milestoneOnlyIds = (milestoneLinks || [])
      .map((m: { invoice_id: string | null }) => m.invoice_id)
      .filter((invId): invId is string => !!invId && !directIds.has(invId));

    let milestoneInvoices: { id: string; total: number; status: string }[] = [];
    if (milestoneOnlyIds.length > 0) {
      const { data } = await supabase
        .from('pyra_invoices')
        .select('id, total, status')
        .in('id', milestoneOnlyIds);
      milestoneInvoices = data || [];
    }

    const all = [...(direct || []), ...milestoneInvoices];
    const billed = Math.round(
      all
        .filter((i) => i.status !== INVOICE_STATUS.CANCELLED)
        .reduce((sum, i) => sum + Number(i.total || 0), 0) * 100
    ) / 100;

    const { error } = await supabase
      .from('pyra_contracts')
      .update({ amount_billed: billed, updated_at: new Date().toISOString() })
      .eq('id', contractId);

    if (error) {
      console.error('[recalcContractBilled] update failed:', error.message, { contractId });
    }
  } catch (err) {
    console.error('[recalcContractBilled] threw:', err);
  }
}
