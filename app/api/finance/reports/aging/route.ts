import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { toAED } from '@/lib/utils/currency';

/**
 * GET /api/finance/reports/aging
 * Invoice Aging Analysis — groups outstanding invoices by age buckets.
 * Buckets: Current (0-30), 31-60, 61-90, 91-120, 120+
 * Params: ?as_of=YYYY-MM-DD (defaults to today)
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();
  const params = req.nextUrl.searchParams;
  const asOf = params.get('as_of') || new Date().toISOString().split('T')[0];
  const asOfDate = new Date(asOf + 'T00:00:00');

  try {
    // Fetch all outstanding invoices (sent, partially_paid, overdue)
    const { data: invoices, error } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, client_id, client_name, issue_date, due_date, total, amount_paid, amount_due, currency, status')
      .in('status', ['sent', 'partially_paid', 'overdue'])
      .gt('amount_due', 0);

    if (error) throw error;

    // Define aging buckets
    const buckets = [
      { label: 'حالي (0-30 يوم)', labelEn: 'Current (0-30)', min: 0, max: 30 },
      { label: '31-60 يوم', labelEn: '31-60 days', min: 31, max: 60 },
      { label: '61-90 يوم', labelEn: '61-90 days', min: 61, max: 90 },
      { label: '91-120 يوم', labelEn: '91-120 days', min: 91, max: 120 },
      { label: 'أكثر من 120 يوم', labelEn: '120+ days', min: 121, max: Infinity },
    ];

    interface AgingInvoice {
      id: string;
      invoice_number: string;
      client_name: string | null;
      issue_date: string;
      due_date: string;
      amount_due: number;
      days_outstanding: number;
    }

    interface BucketResult {
      label: string;
      labelEn: string;
      count: number;
      total: number;
      invoices: AgingInvoice[];
    }

    const bucketResults: BucketResult[] = buckets.map(b => ({
      label: b.label,
      labelEn: b.labelEn,
      count: 0,
      total: 0,
      invoices: [],
    }));

    // Client aggregation
    const clientAging: Record<string, { name: string; buckets: number[] }> = {};

    let totalOutstanding = 0;
    let totalInvoices = 0;

    for (const inv of invoices || []) {
      const issueDate = new Date(inv.issue_date + 'T00:00:00');
      const daysOutstanding = Math.max(0, Math.floor((asOfDate.getTime() - issueDate.getTime()) / 86400000));
      const amountDueAED = toAED(Number(inv.amount_due), inv.currency);

      totalOutstanding += amountDueAED;
      totalInvoices++;

      // Find matching bucket
      for (let i = 0; i < buckets.length; i++) {
        if (daysOutstanding >= buckets[i].min && daysOutstanding <= buckets[i].max) {
          bucketResults[i].count++;
          bucketResults[i].total += amountDueAED;
          bucketResults[i].invoices.push({
            id: inv.id,
            invoice_number: inv.invoice_number,
            client_name: inv.client_name,
            issue_date: inv.issue_date,
            due_date: inv.due_date,
            amount_due: Math.round(amountDueAED * 100) / 100,
            days_outstanding: daysOutstanding,
          });

          // Client aggregation
          const clientKey = inv.client_id || 'unknown';
          if (!clientAging[clientKey]) {
            clientAging[clientKey] = { name: inv.client_name || 'غير محدد', buckets: [0, 0, 0, 0, 0] };
          }
          clientAging[clientKey].buckets[i] += amountDueAED;
          break;
        }
      }
    }

    // Round totals and sort invoices by days_outstanding desc within each bucket
    for (const bucket of bucketResults) {
      bucket.total = Math.round(bucket.total * 100) / 100;
      bucket.invoices.sort((a, b) => b.days_outstanding - a.days_outstanding);
      // Limit to top 20 per bucket
      if (bucket.invoices.length > 20) bucket.invoices = bucket.invoices.slice(0, 20);
    }

    // Build client summary sorted by total outstanding
    const clientSummary = Object.entries(clientAging)
      .map(([clientId, data]) => ({
        client_id: clientId,
        client_name: data.name,
        current: Math.round(data.buckets[0] * 100) / 100,
        days_31_60: Math.round(data.buckets[1] * 100) / 100,
        days_61_90: Math.round(data.buckets[2] * 100) / 100,
        days_91_120: Math.round(data.buckets[3] * 100) / 100,
        days_120_plus: Math.round(data.buckets[4] * 100) / 100,
        total: Math.round(data.buckets.reduce((a, b) => a + b, 0) * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    // Average days outstanding
    const avgDays = totalInvoices > 0
      ? Math.round(
          (invoices || []).reduce((sum, inv) => {
            return sum + Math.max(0, Math.floor((asOfDate.getTime() - new Date(inv.issue_date + 'T00:00:00').getTime()) / 86400000));
          }, 0) / totalInvoices
        )
      : 0;

    return apiSuccess({
      as_of: asOf,
      summary: {
        total_outstanding: Math.round(totalOutstanding * 100) / 100,
        total_invoices: totalInvoices,
        avg_days_outstanding: avgDays,
      },
      buckets: bucketResults,
      by_client: clientSummary,
    });
  } catch (err) {
    console.error('Aging report error:', err);
    return apiServerError();
  }
}
