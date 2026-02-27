import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { REVENUE_TARGET_FIELDS } from '@/lib/supabase/fields';

export async function GET(req: NextRequest) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const supabase = createServiceRoleClient();
  const url = req.nextUrl.searchParams;
  const periodType = url.get('period_type') || '';
  const current = url.get('current') === 'true';

  try {
    let query = supabase
      .from('pyra_revenue_targets')
      .select(REVENUE_TARGET_FIELDS);

    if (periodType) {
      query = query.eq('period_type', periodType);
    }

    if (current) {
      const today = new Date().toISOString().split('T')[0];
      query = query.lte('period_start', today).gte('period_end', today);
    }

    const { data, error } = await query.order('period_start', { ascending: false });

    if (error) throw error;

    // For each target, calculate actual_revenue from paid/partially_paid invoices
    const enriched = await Promise.all(
      (data || []).map(async (target: {
        id: string;
        period_start: string;
        period_end: string;
        target_amount: number;
      }) => {
        const { data: invoices } = await supabase
          .from('pyra_invoices')
          .select('amount_paid')
          .in('status', ['paid', 'partially_paid'])
          .gte('issue_date', target.period_start)
          .lte('issue_date', target.period_end);

        const actual_revenue = (invoices || []).reduce(
          (sum: number, inv: { amount_paid: number }) => sum + Number(inv.amount_paid),
          0
        );

        const progress_percentage = target.target_amount > 0
          ? Math.round((actual_revenue / target.target_amount) * 100)
          : 0;

        return {
          ...target,
          actual_revenue,
          progress_percentage,
        };
      })
    );

    return apiSuccess(enriched);
  } catch {
    return apiServerError();
  }
}

export async function POST(req: NextRequest) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();
    const { period_type, period_start, period_end, target_amount, currency, notes } = body;

    // Validation
    if (!period_type || !['monthly', 'quarterly', 'yearly'].includes(period_type)) {
      return apiError('نوع الفترة مطلوب (شهري/ربع سنوي/سنوي)', 422);
    }
    if (!period_start || !period_end) {
      return apiError('تاريخ البداية والنهاية مطلوبان', 422);
    }
    if (period_start >= period_end) {
      return apiError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية', 422);
    }
    if (!target_amount || target_amount <= 0) {
      return apiError('المبلغ المستهدف يجب أن يكون أكبر من صفر', 422);
    }

    const { data, error } = await supabase
      .from('pyra_revenue_targets')
      .insert({
        id: generateId('rt'),
        period_type,
        period_start,
        period_end,
        target_amount,
        currency: currency || 'AED',
        notes: notes || null,
        created_by: admin.pyraUser.username,
      })
      .select(REVENUE_TARGET_FIELDS)
      .single();

    if (error) throw error;

    // Activity log (fire-and-forget)
    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'create_revenue_target',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/finance/revenue-targets/${data.id}`,
      details: { period_type, target_amount, currency: currency || 'AED' },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
