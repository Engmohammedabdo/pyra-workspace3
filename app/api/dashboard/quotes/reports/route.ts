import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/dashboard/quotes/reports?type=conversion|pipeline|velocity|agent_performance
 * Quote analytics reports. Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('quotes.view');
    if (isApiError(auth)) return auth;

    const type = request.nextUrl.searchParams.get('type') || 'conversion';
    const supabase = createServiceRoleClient();

    switch (type) {
      case 'conversion': {
        // Conversion funnel: count by status
        const { data: quotes } = await supabase
          .from('pyra_quotes')
          .select('status');

        const counts: Record<string, number> = {};
        for (const q of quotes || []) {
          counts[q.status] = (counts[q.status] || 0) + 1;
        }

        const total = quotes?.length || 0;
        const sent = (counts.sent || 0) + (counts.viewed || 0) + (counts.signed || 0) + (counts.invoiced || 0);
        const signed = (counts.signed || 0) + (counts.invoiced || 0);
        const invoiced = counts.invoiced || 0;

        return apiSuccess({
          funnel: [
            { stage: 'إجمالي العروض', count: total },
            { stage: 'تم الإرسال', count: sent },
            { stage: 'تم التوقيع', count: signed },
            { stage: 'تم الفوترة', count: invoiced },
          ],
          rates: {
            sent_rate: total > 0 ? Math.round((sent / total) * 100) : 0,
            sign_rate: sent > 0 ? Math.round((signed / sent) * 100) : 0,
            invoice_rate: signed > 0 ? Math.round((invoiced / signed) * 100) : 0,
          },
          by_status: counts,
        });
      }

      case 'pipeline': {
        // Active pipeline value
        const { data: active } = await supabase
          .from('pyra_quotes')
          .select('status, total, currency')
          .in('status', ['draft', 'pending_approval', 'sent', 'viewed']);

        let totalValue = 0;
        const byStatus: Record<string, { count: number; value: number }> = {};

        for (const q of active || []) {
          totalValue += q.total || 0;
          if (!byStatus[q.status]) byStatus[q.status] = { count: 0, value: 0 };
          byStatus[q.status].count++;
          byStatus[q.status].value += q.total || 0;
        }

        return apiSuccess({
          total_active: active?.length || 0,
          total_value: totalValue,
          by_status: byStatus,
        });
      }

      case 'velocity': {
        // Average time from sent → signed
        const { data: signed } = await supabase
          .from('pyra_quotes')
          .select('sent_at, signed_at')
          .not('sent_at', 'is', null)
          .not('signed_at', 'is', null)
          .in('status', ['signed', 'invoiced']);

        let totalDays = 0;
        let count = 0;

        for (const q of signed || []) {
          if (q.sent_at && q.signed_at) {
            const days = (new Date(q.signed_at).getTime() - new Date(q.sent_at).getTime()) / 86400000;
            if (days >= 0) {
              totalDays += days;
              count++;
            }
          }
        }

        return apiSuccess({
          average_days_to_sign: count > 0 ? Math.round(totalDays / count * 10) / 10 : null,
          total_signed: count,
        });
      }

      case 'agent_performance': {
        // Performance per sales agent
        const { data: quotes } = await supabase
          .from('pyra_quotes')
          .select('created_by, status, total');

        const agents: Record<string, { total: number; signed: number; value: number; signed_value: number }> = {};

        for (const q of quotes || []) {
          const agent = q.created_by || 'unknown';
          if (!agents[agent]) agents[agent] = { total: 0, signed: 0, value: 0, signed_value: 0 };
          agents[agent].total++;
          agents[agent].value += q.total || 0;
          if (q.status === 'signed' || q.status === 'invoiced') {
            agents[agent].signed++;
            agents[agent].signed_value += q.total || 0;
          }
        }

        const performance = Object.entries(agents).map(([username, data]) => ({
          username,
          ...data,
          conversion_rate: data.total > 0 ? Math.round((data.signed / data.total) * 100) : 0,
        }));

        performance.sort((a, b) => b.signed_value - a.signed_value);

        return apiSuccess(performance);
      }

      default:
        return apiValidationError('نوع التقرير غير صالح. الأنواع المتاحة: conversion, pipeline, velocity, agent_performance');
    }
  } catch (err) {
    console.error('GET /api/dashboard/quotes/reports error:', err);
    return apiServerError();
  }
}
