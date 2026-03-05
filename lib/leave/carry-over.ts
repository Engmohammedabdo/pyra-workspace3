import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';

interface CarryOverResult {
  created: number;
  updated: number;
  details: Array<{
    username: string;
    leave_type_id: string;
    leave_type_name: string;
    remaining: number;
    carried_over: number;
  }>;
}

/**
 * Calculate and apply carry-over from one year to the next.
 *
 * Steps:
 * 1. Fetch leave types with max_carry_over > 0
 * 2. Fetch balances for fromYear
 * 3. Calculate carry-over per user per type
 * 4. Upsert into pyra_leave_balances_v2 for toYear
 */
export async function calculateCarryOver(
  supabase: SupabaseClient,
  fromYear: number,
  toYear: number
): Promise<CarryOverResult> {
  // 1. Fetch leave types with carry-over enabled
  const { data: leaveTypes, error: ltError } = await supabase
    .from('pyra_leave_types')
    .select('*')
    .eq('is_active', true)
    .gt('max_carry_over', 0);

  if (ltError) throw new Error(`Failed to fetch leave types: ${ltError.message}`);
  if (!leaveTypes || leaveTypes.length === 0) {
    return { created: 0, updated: 0, details: [] };
  }

  const typeIds = leaveTypes.map((t) => t.id);
  const typeMap = new Map(leaveTypes.map((t) => [t.id, t]));

  // 2. Fetch balances for fromYear
  const { data: fromBalances, error: fbError } = await supabase
    .from('pyra_leave_balances_v2')
    .select('*')
    .eq('year', fromYear)
    .in('leave_type_id', typeIds);

  if (fbError) throw new Error(`Failed to fetch balances: ${fbError.message}`);
  if (!fromBalances || fromBalances.length === 0) {
    return { created: 0, updated: 0, details: [] };
  }

  // 3. Fetch existing toYear balances to check for upsert
  const { data: toBalances, error: tbError } = await supabase
    .from('pyra_leave_balances_v2')
    .select('id, username, leave_type_id, total_days, carried_over')
    .eq('year', toYear)
    .in('leave_type_id', typeIds);

  if (tbError) throw new Error(`Failed to fetch target year balances: ${tbError.message}`);

  // Build a lookup: `username:leave_type_id` -> existing toYear balance
  const existingMap = new Map(
    (toBalances || []).map((b) => [`${b.username}:${b.leave_type_id}`, b])
  );

  let created = 0;
  let updated = 0;
  const details: CarryOverResult['details'] = [];

  // 4. Calculate and upsert
  for (const balance of fromBalances) {
    const leaveType = typeMap.get(balance.leave_type_id);
    if (!leaveType) continue;

    const remaining = Math.max(0, balance.total_days - balance.used_days);
    if (remaining <= 0) continue;

    const carriedOver = Math.min(remaining, leaveType.max_carry_over);
    if (carriedOver <= 0) continue;

    const key = `${balance.username}:${balance.leave_type_id}`;
    const existing = existingMap.get(key);

    if (existing) {
      // Update: add carry-over to existing record
      const { error: updateError } = await supabase
        .from('pyra_leave_balances_v2')
        .update({
          carried_over: carriedOver,
          total_days: leaveType.default_days + carriedOver,
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error(`Failed to update balance for ${key}:`, updateError.message);
        continue;
      }
      updated++;
    } else {
      // Create new balance record for toYear
      const { error: insertError } = await supabase
        .from('pyra_leave_balances_v2')
        .insert({
          id: generateId('lb'),
          username: balance.username,
          year: toYear,
          leave_type_id: balance.leave_type_id,
          total_days: leaveType.default_days + carriedOver,
          used_days: 0,
          carried_over: carriedOver,
        });

      if (insertError) {
        console.error(`Failed to create balance for ${key}:`, insertError.message);
        continue;
      }
      created++;
    }

    details.push({
      username: balance.username,
      leave_type_id: balance.leave_type_id,
      leave_type_name: leaveType.name_ar || leaveType.name,
      remaining,
      carried_over: carriedOver,
    });
  }

  return { created, updated, details };
}
