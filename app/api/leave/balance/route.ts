import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const supabase = await createServerSupabaseClient();
  const year = new Date().getFullYear();

  const { data, error } = await supabase
    .from('pyra_leave_balances')
    .select('*')
    .eq('username', auth.pyraUser.username)
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
