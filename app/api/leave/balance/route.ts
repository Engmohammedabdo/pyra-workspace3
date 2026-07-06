import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const serviceSupabase = createServiceRoleClient();
  const year = new Date().getFullYear();
  const username = auth.pyraUser.username;

  // pyra_leave_balances_v2 is the SINGLE source of truth for leave balances
  // (Batch D lock) — the legacy v1 pyra_leave_balances table is dead.
  const { data: v2Balances, error: v2Error } = await serviceSupabase
    .from('pyra_leave_balances_v2')
    .select('*, pyra_leave_types(*)')
    .eq('username', username)
    .eq('year', year);

  if (v2Error) return apiServerError(v2Error.message);

  // Also fetch all active leave types so we can show types with no balance yet
  const { data: allTypes, error: typesError } = await serviceSupabase
    .from('pyra_leave_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (typesError) return apiServerError(typesError.message);

  // Build a map of existing balances
  const balanceMap = new Map(
    (v2Balances ?? []).map((b) => [b.leave_type_id, b])
  );

  // Merge: for each leave type, return balance or defaults.
  // available = total_days + carried_over − used_days
  const dynamicBalances = (allTypes ?? []).map((lt) => {
    const bal = balanceMap.get(lt.id);
    const totalDays = bal?.total_days ?? lt.default_days;
    const usedDays = bal?.used_days ?? 0;
    const carriedOver = bal?.carried_over ?? 0;
    return {
      leave_type_id: lt.id,
      name: lt.name,
      name_ar: lt.name_ar,
      icon: lt.icon,
      color: lt.color,
      default_days: lt.default_days,
      max_carry_over: lt.max_carry_over,
      requires_attachment: lt.requires_attachment,
      is_paid: lt.is_paid,
      total_days: totalDays,
      used_days: usedDays,
      carried_over: carriedOver,
      remaining: totalDays + carriedOver - usedDays,
    };
  });

  return apiSuccess({
    version: 'v2',
    year,
    balances: dynamicBalances,
    // Legacy fields for backward compatibility
    annual_total: dynamicBalances.find((b) => b.name === 'annual')?.total_days ?? 30,
    annual_used: dynamicBalances.find((b) => b.name === 'annual')?.used_days ?? 0,
    sick_total: dynamicBalances.find((b) => b.name === 'sick')?.total_days ?? 15,
    sick_used: dynamicBalances.find((b) => b.name === 'sick')?.used_days ?? 0,
    personal_total: dynamicBalances.find((b) => b.name === 'personal')?.total_days ?? 5,
    personal_used: dynamicBalances.find((b) => b.name === 'personal')?.used_days ?? 0,
  });
}
