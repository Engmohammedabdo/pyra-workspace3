import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('timesheet.view');
  if (isApiError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const status = searchParams.get('status');

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from('pyra_timesheet_periods')
    .select('*')
    .order('start_date', { ascending: false });

  if (username) {
    query = query.eq('username', username);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.limit(100);
  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('timesheet.view');
  if (isApiError(auth)) return auth;

  const body = await req.json();
  const { start_date, end_date, period_type } = body;

  if (!start_date || !end_date) {
    return apiValidationError('تاريخ البداية والنهاية مطلوبان');
  }

  if (new Date(end_date) <= new Date(start_date)) {
    return apiValidationError('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
  }

  const serviceClient = createServiceRoleClient();

  const { data, error } = await serviceClient
    .from('pyra_timesheet_periods')
    .insert({
      id: generateId('tsp'),
      username: auth.pyraUser.username,
      start_date,
      end_date,
      period_type: period_type || 'weekly',
      total_hours: 0,
      status: 'open',
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data, undefined, 201);
}
