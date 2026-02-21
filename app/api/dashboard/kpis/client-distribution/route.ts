import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';

// =============================================================
// GET /api/dashboard/kpis/client-distribution
// Top 8 clients by total paid invoice revenue.
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();

    // Fetch all paid invoices with client info
    const { data: invoices, error } = await supabase
      .from('pyra_invoices')
      .select('client_name, client_company, total')
      .eq('status', 'paid');

    if (error) {
      console.error('Client distribution query error:', error);
      return apiServerError();
    }

    // Group by client_name and sum revenue
    const clientMap: Record<string, { name: string; company: string; revenue: number }> = {};

    for (const inv of invoices || []) {
      const name = inv.client_name || 'غير محدد';
      if (!clientMap[name]) {
        clientMap[name] = {
          name,
          company: inv.client_company || '',
          revenue: 0,
        };
      }
      clientMap[name].revenue += inv.total || 0;
    }

    // Sort by revenue descending, take top 8
    const sorted = Object.values(clientMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    return apiSuccess(sorted);
  } catch (err) {
    console.error('GET /api/dashboard/kpis/client-distribution error:', err);
    return apiServerError();
  }
}
