import { createServiceRoleClient } from '@/lib/supabase/server';

interface Alert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  target_path?: string;
  data?: Record<string, unknown>;
}

interface AlertsResult {
  alerts: Alert[];
  summary: {
    total_count: number;
    critical_count: number;
    warning_count: number;
    info_count: number;
  };
}

/**
 * Get all finance alerts from multiple sources.
 * Used by both internal (/api/finance/alerts) and external (/api/external/alerts) endpoints.
 */
export async function getFinanceAlerts(): Promise<AlertsResult> {
  const supabase = createServiceRoleClient();
  const alerts: Alert[] = [];
  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysStr = in7Days.toISOString().split('T')[0];
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const in30DaysStr = in30Days.toISOString().split('T')[0];

  // ─── 1. Subscription Renewals (next 7 days) ───
  const { data: renewals } = await supabase
    .from('pyra_subscriptions')
    .select('id, name, cost, currency, next_renewal_date')
    .eq('status', 'active')
    .gte('next_renewal_date', today)
    .lte('next_renewal_date', in7DaysStr);

  if (renewals && renewals.length > 0) {
    for (const sub of renewals) {
      alerts.push({
        type: 'subscription_renewal',
        severity: 'warning',
        title: 'تجديد اشتراك قادم',
        message: `الاشتراك "${sub.name}" سيتجدد في ${sub.next_renewal_date} بقيمة ${Number(sub.cost).toFixed(2)} ${sub.currency}`,
        target_path: `/dashboard/finance/subscriptions/${sub.id}`,
        data: { subscription_id: sub.id, name: sub.name, cost: sub.cost, renewal_date: sub.next_renewal_date },
      });
    }
  }

  // ─── 2. Overdue Invoices ───
  const { data: overdueInvoices, count: overdueCount } = await supabase
    .from('pyra_invoices')
    .select('id, invoice_number, amount_due, client_name', { count: 'exact' })
    .eq('status', 'overdue');

  if (overdueInvoices && overdueInvoices.length > 0) {
    const totalOverdue = overdueInvoices.reduce(
      (sum: number, inv: { amount_due: number }) => sum + Number(inv.amount_due), 0
    );

    alerts.push({
      type: 'overdue_invoices',
      severity: 'critical',
      title: 'فواتير متأخرة',
      message: `يوجد ${overdueCount ?? overdueInvoices.length} فاتورة متأخرة بإجمالي ${totalOverdue.toFixed(2)}`,
      target_path: '/dashboard/invoices?status=overdue',
      data: {
        count: overdueCount ?? overdueInvoices.length,
        total_amount_due: Math.round(totalOverdue * 100) / 100,
        invoices: overdueInvoices.slice(0, 5).map((inv: { id: string; invoice_number: string; amount_due: number; client_name: string | null }) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          amount_due: inv.amount_due,
          client_name: inv.client_name,
        })),
      },
    });
  }

  // ─── 3. Expiring Contracts (next 30 days) ───
  const { data: expiringContracts } = await supabase
    .from('pyra_contracts')
    .select('id, title, end_date, client_id, total_value, currency')
    .in('status', ['active', 'in_progress'])
    .gte('end_date', today)
    .lte('end_date', in30DaysStr);

  if (expiringContracts && expiringContracts.length > 0) {
    const clientIds = [...new Set(expiringContracts.map((c: { client_id: string | null }) => c.client_id).filter(Boolean))];
    let clients: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: clientData } = await supabase
        .from('pyra_clients')
        .select('id, name')
        .in('id', clientIds);
      if (clientData) {
        clients = Object.fromEntries(clientData.map((c: { id: string; name: string }) => [c.id, c.name]));
      }
    }

    for (const contract of expiringContracts) {
      const daysLeft = Math.ceil(
        (new Date(contract.end_date).getTime() - Date.now()) / 86400000
      );
      const clientName = contract.client_id ? clients[contract.client_id] : null;

      alerts.push({
        type: 'expiring_contract',
        severity: daysLeft <= 7 ? 'critical' : 'warning',
        title: 'عقد قارب على الانتهاء',
        message: `العقد "${contract.title}"${clientName ? ` (${clientName})` : ''} ينتهي خلال ${daysLeft} يوم`,
        target_path: `/dashboard/finance/contracts/${contract.id}`,
        data: {
          contract_id: contract.id,
          title: contract.title,
          end_date: contract.end_date,
          days_left: daysLeft,
          total_value: contract.total_value,
        },
      });
    }
  }

  // ─── 4. Budget Overruns (>= 80% utilization) ───
  const { data: projects } = await supabase
    .from('pyra_projects')
    .select('id, name, budget')
    .gt('budget', 0);

  if (projects && projects.length > 0) {
    const projectIds = projects.map((p: { id: string }) => p.id);

    const { data: expenses } = await supabase
      .from('pyra_expenses')
      .select('project_id, amount, vat_amount')
      .in('project_id', projectIds);

    const expByProject: Record<string, number> = {};
    for (const exp of expenses || []) {
      const pid = exp.project_id as string;
      expByProject[pid] = (expByProject[pid] || 0) + Number(exp.amount) + Number(exp.vat_amount);
    }

    for (const proj of projects) {
      const budget = Number(proj.budget);
      const totalExpenses = expByProject[proj.id] || 0;
      const utilization = (totalExpenses / budget) * 100;

      if (utilization >= 80) {
        alerts.push({
          type: 'budget_overrun',
          severity: utilization >= 100 ? 'critical' : 'warning',
          title: utilization >= 100 ? 'تجاوز الميزانية' : 'اقتراب من حد الميزانية',
          message: `المشروع "${proj.name}" استهلك ${utilization.toFixed(0)}% من الميزانية (${totalExpenses.toFixed(2)} من ${budget.toFixed(2)})`,
          target_path: `/dashboard/projects/${proj.id}`,
          data: {
            project_id: proj.id,
            project_name: proj.name,
            budget,
            expenses: Math.round(totalExpenses * 100) / 100,
            utilization: Math.round(utilization * 100) / 100,
          },
        });
      }
    }
  }

  // ─── 5. Recurring Invoices Due ───
  const { data: recurringDue } = await supabase
    .from('pyra_recurring_invoices')
    .select('id, title, next_generation_date, billing_cycle, items, currency')
    .eq('status', 'active')
    .lte('next_generation_date', today);

  if (recurringDue && recurringDue.length > 0) {
    for (const ri of recurringDue) {
      const items = ri.items || [];
      const totalCost = items.reduce(
        (sum: number, item: { quantity: number; rate: number }) =>
          sum + (item.quantity || 1) * (item.rate || 0),
        0
      );

      alerts.push({
        type: 'recurring_due',
        severity: 'info',
        title: 'فاتورة متكررة جاهزة للتوليد',
        message: `"${ri.title}" مستحقة التوليد (${ri.next_generation_date}) بقيمة ${totalCost.toFixed(2)} ${ri.currency}`,
        target_path: '/dashboard/finance/recurring',
        data: {
          recurring_id: ri.id,
          title: ri.title,
          next_generation_date: ri.next_generation_date,
          estimated_total: totalCost,
        },
      });
    }
  }

  // ─── Build Summary ───
  let critical_count = 0;
  let warning_count = 0;
  let info_count = 0;

  for (const alert of alerts) {
    if (alert.severity === 'critical') critical_count++;
    else if (alert.severity === 'warning') warning_count++;
    else info_count++;
  }

  // Sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    alerts,
    summary: {
      total_count: alerts.length,
      critical_count,
      warning_count,
      info_count,
    },
  };
}
