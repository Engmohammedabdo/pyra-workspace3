import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const supabase = await createServerSupabaseClient();
  const serviceSupabase = createServiceRoleClient();
  const year = new Date().getFullYear();
  const username = auth.pyraUser.username;

  // ─── Try dynamic balances from pyra_leave_balances_v2 + pyra_leave_types ───
  try {
    const { data: v2Balances, error: v2Error } = await serviceSupabase
      .from('pyra_leave_balances_v2')
      .select('*, pyra_leave_types(*)')
      .eq('username', username)
      .eq('year', year);

    // If we got v2 data (even empty array means the table exists), proceed
    if (!v2Error && v2Balances) {
      // Also fetch all active leave types so we can show types with no balance yet
      const { data: allTypes } = await serviceSupabase
        .from('pyra_leave_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (allTypes && allTypes.length > 0) {
        // Build a map of existing balances
        const balanceMap = new Map(
          v2Balances.map((b) => [b.leave_type_id, b])
        );

        // Merge: for each leave type, return balance or defaults
        const dynamicBalances = allTypes.map((lt) => {
          const bal = balanceMap.get(lt.id);
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
            total_days: bal?.total_days ?? lt.default_days,
            used_days: bal?.used_days ?? 0,
            carried_over: bal?.carried_over ?? 0,
            remaining: (bal?.total_days ?? lt.default_days) - (bal?.used_days ?? 0),
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
    }
  } catch {
    // If v2 tables don't exist or query fails, fall through to legacy
  }

  // ─── Fallback: Legacy pyra_leave_balances table ───
  const { data, error } = await supabase
    .from('pyra_leave_balances')
    .select('*')
    .eq('username', username)
    .eq('year', year)
    .single();

  if (error && error.code !== 'PGRST116') return apiServerError(error.message);

  // Return defaults if no balance record exists
  const balance = data || {
    annual_total: 30, annual_used: 0,
    sick_total: 15, sick_used: 0,
    personal_total: 5, personal_used: 0,
  };

  return apiSuccess(balance);
}
