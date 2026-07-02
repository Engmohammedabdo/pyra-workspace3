import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/crm/customers/[lead_id]/dossier
//
// Single endpoint that powers the entire Active Customer Page
// (/dashboard/crm/customers/[id]). Returns the lead + all linked contracts
// + their invoices + payments + milestones + computed KPIs + a 4-factor
// health score in one shot — avoids 1+N+N×M frontend queries.
//
// Permission:  leads.view
// Scope:       canAccessLead(...) gate — sales agents see only their own leads.
//
// Implementation: 7 Supabase queries in 2 batches (Q1-Q3 parallel anchor data,
// then Q4-Q7 after we know contract/invoice IDs). In-memory aggregation
// computes per-contract KPIs, top-level KPIs, and the health score.
//
// Health Score formula (per Phase 9 Q9-3, documented in CLAUDE.md):
//   30% Recency       — days since last activity
//   30% Payment       — % of last-180d invoices paid on or before due_date
//   20% Active        — has active retainer or in-progress milestones
//   20% Engagement    — count of activities in last 30 days
//
// Color thresholds: 75-100 emerald · 50-74 amber · 25-49 orange · 0-24 red.
//
// Per-contract `type` is derived from `contract_type` column (added in
// Phase 1 migration 005; values seen in production: 'retainer', 'milestone',
// 'fixed'). Heuristic fallback (retainer_amount > 0 → retainer; has
// milestones → project; else → one-off) is documented but unused — kept
// in code as defensive-default for any rows where contract_type is null.
// ────────────────────────────────────────────────────────────────────────────

interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  deal_type: string | null;
  stage_id: string | null;
  is_converted: boolean;
  converted_at: string | null;
  assigned_to: string | null;
  priority: string | null;
  expected_value: string | number | null;
  expected_value_currency: string | null;
  win_probability: number | null;
  last_contact_at: string | null;
  client_id: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

interface ContractType {
  id: string;
  client_id: string | null;
  project_id: string | null;
  lead_id: string | null;
  title: string | null;
  description: string | null;
  contract_type: string | null;
  total_value: string | number | null;
  currency: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  retainer_amount: string | number | null;
  retainer_cycle: string | null;
  billing_day: number | null;
  amount_billed: string | number | null;
  amount_collected: string | number | null;
  created_at: string;
}

interface InvoiceType {
  id: string;
  contract_id: string | null;
  client_id: string | null;
  currency: string | null;
  invoice_number: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  subtotal: string | number | null;
  total: string | number | null;
  amount_paid: string | number | null;
}

interface PaymentType {
  id: string;
  invoice_id: string | null;
  amount: string | number | null;
  payment_date: string | null;
}

interface MilestoneType {
  id: string;
  contract_id: string | null;
  title: string | null;
  description: string | null;
  amount: string | number | null;
  due_date: string | null;
  status: string | null;
  invoice_id: string | null;
  completed_at: string | null;
}

const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const cycleMonths: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
  annual: 12,
};

function deriveContractType(c: ContractType, milestonesByContract: Map<string, MilestoneType[]>): 'retainer' | 'project' | 'one-off' {
  // Primary: trust the contract_type column populated in production
  // (values observed: 'retainer', 'milestone', 'fixed').
  switch (c.contract_type) {
    case 'retainer': return 'retainer';
    case 'milestone': return 'project';
    case 'fixed':
    case 'one-off': return 'one-off';
  }
  // Heuristic fallback for rows with null contract_type (defensive):
  if (num(c.retainer_amount) > 0) return 'retainer';
  if ((milestonesByContract.get(c.id)?.length ?? 0) > 0) return 'project';
  return 'one-off';
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lead_id: string }> },
) {
  try {
    const auth = await requireApiPermission('leads.view');
    if (isApiError(auth)) return auth;

    const { lead_id: leadId } = await params;
    const supabase = createServiceRoleClient();

    // Scope gate — non-admins must own the lead.
    const allowed = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadId,
    );
    if (!allowed) return apiNotFound('العميل غير موجود');

    // ── Batch 1 (parallel) — anchor data ────────────────────────────────────
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const oneEightyDaysAgoDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10); // due_date is DATE, not timestamp — slice to YYYY-MM-DD.

    const [leadRes, activitiesRes, contractsRes, lastActivityRes] = await Promise.all([
      supabase
        .from('pyra_sales_leads')
        .select(
          'id, name, email, phone, company, deal_type, ' +
          'stage_id, is_converted, converted_at, assigned_to, priority, ' +
          'expected_value, expected_value_currency, win_probability, ' +
          'last_contact_at, client_id, source, notes, created_at, updated_at',
        )
        .eq('id', leadId)
        .maybeSingle(),
      supabase
        .from('pyra_lead_activities')
        .select('id, created_at, activity_type')
        .eq('lead_id', leadId)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('pyra_contracts')
        .select(
          'id, client_id, project_id, lead_id, title, description, contract_type, ' +
          'total_value, currency, status, start_date, end_date, ' +
          'retainer_amount, retainer_cycle, billing_day, ' +
          'amount_billed, amount_collected, created_at',
        )
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
      // Single most-recent activity WITHOUT the 30-day floor — the windowed
      // query above (engagement) can never surface an activity older than 30d,
      // so the recency 30-90d / >90d buckets were unreachable from it.
      supabase
        .from('pyra_lead_activities')
        .select('created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (leadRes.error) {
      console.error('dossier: lead fetch error:', leadRes.error.message);
      return apiServerError();
    }
    if (!leadRes.data) return apiNotFound('العميل غير موجود');

    // Casts via unknown — Supabase JS infers a union with a GenericStringError
    // sentinel that doesn't sufficiently overlap with our row shapes; the
    // runtime data is always either null/[] (handled above) or the real shape.
    const lead = leadRes.data as unknown as LeadRow;
    const activities = (activitiesRes.data ?? []) as unknown as Array<{ id: string; created_at: string; activity_type: string }>;
    const lastActivityAt = (lastActivityRes.data as { created_at: string } | null)?.created_at ?? null;
    const contracts = (contractsRes.data ?? []) as unknown as ContractType[];
    const contractIds = contracts.map((c) => c.id);

    // ── Batch 2 (parallel where possible) ──────────────────────────────────
    // Q4 client (only if linked); Q5 invoices, Q6 milestones (need contractIds).
    // Q7 payments depends on Q5's invoice IDs — runs after.
    //
    // Invoices: contract-linked (via contractIds) UNION standalone client
    // invoices (client_id set, contract_id null — the /api/clients→invoice
    // path). Both feed LTV + payment-health; standalone invoices were
    // previously ignored, so a paying client with no contract rendered as
    // 0-revenue / at-risk. The DB de-dupes rows that match both clauses.
    const invoiceCols =
      'id, contract_id, client_id, currency, invoice_number, status, issue_date, due_date, subtotal, total, amount_paid';
    const invoiceOrParts: string[] = [];
    if (contractIds.length) {
      invoiceOrParts.push(`contract_id.in.(${contractIds.map((c) => `"${c}"`).join(',')})`);
    }
    if (lead.client_id) {
      invoiceOrParts.push(`client_id.eq.${lead.client_id}`);
    }

    const [clientRes, invoicesRes, milestonesRes] = await Promise.all([
      lead.client_id
        ? supabase
            .from('pyra_clients')
            .select('id, email, portal_active, auth_user_id, last_login_at')
            .eq('id', lead.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      invoiceOrParts.length
        ? supabase
            .from('pyra_invoices')
            .select(invoiceCols)
            .or(invoiceOrParts.join(','))
            .order('issue_date', { ascending: false })
        : Promise.resolve({ data: [] as InvoiceType[], error: null }),
      contractIds.length
        ? supabase
            .from('pyra_contract_milestones')
            .select('id, contract_id, title, description, amount, due_date, status, invoice_id, completed_at')
            .in('contract_id', contractIds)
            .order('due_date', { ascending: true })
        : Promise.resolve({ data: [] as MilestoneType[], error: null }),
    ]);

    const clientRow = clientRes.data as { id: string; email: string | null; portal_active: boolean | null; auth_user_id: string | null; last_login_at: string | null } | null;
    const invoices = (invoicesRes.data ?? []) as InvoiceType[];
    const milestones = (milestonesRes.data ?? []) as MilestoneType[];
    const invoiceIds = invoices.map((i) => i.id);

    // Q7 — payments (sequential after invoices).
    const paymentsRes = invoiceIds.length
      ? await supabase
          .from('pyra_payments')
          .select('id, invoice_id, amount, payment_date')
          .in('invoice_id', invoiceIds)
      : { data: [] as PaymentType[], error: null };
    const payments = (paymentsRes.data ?? []) as PaymentType[];

    // ── In-memory aggregation ──────────────────────────────────────────────
    const invoicesByContract = new Map<string, InvoiceType[]>();
    for (const inv of invoices) {
      if (!inv.contract_id) continue;
      const arr = invoicesByContract.get(inv.contract_id) ?? [];
      arr.push(inv);
      invoicesByContract.set(inv.contract_id, arr);
    }

    const milestonesByContract = new Map<string, MilestoneType[]>();
    for (const m of milestones) {
      if (!m.contract_id) continue;
      const arr = milestonesByContract.get(m.contract_id) ?? [];
      arr.push(m);
      milestonesByContract.set(m.contract_id, arr);
    }

    const paymentsByInvoice = new Map<string, PaymentType[]>();
    for (const p of payments) {
      if (!p.invoice_id) continue;
      const arr = paymentsByInvoice.get(p.invoice_id) ?? [];
      arr.push(p);
      paymentsByInvoice.set(p.invoice_id, arr);
    }

    // Per-contract enrichment.
    const enrichedContracts = contracts.map((c) => {
      const cInvoices = (invoicesByContract.get(c.id) ?? []).map((inv) => {
        const paid = (paymentsByInvoice.get(inv.id) ?? []).reduce(
          (acc, p) => acc + num(p.amount),
          0,
        );
        const total = num(inv.total);
        return {
          id: inv.id,
          invoice_number: inv.invoice_number,
          status: inv.status,
          issue_date: inv.issue_date,
          due_date: inv.due_date,
          subtotal: num(inv.subtotal),
          total,
          amount_paid: num(inv.amount_paid),
          paid_amount: paid, // sum of pyra_payments for this invoice
          remaining: Math.max(total - paid, 0),
        };
      });
      const cMilestones = (milestonesByContract.get(c.id) ?? []).map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        amount: num(m.amount),
        due_date: m.due_date,
        status: m.status,
        invoice_id: m.invoice_id,
        completed_at: m.completed_at,
      }));
      const totalPaid = cInvoices.reduce((acc, inv) => acc + inv.paid_amount, 0);
      const totalValue = num(c.total_value) || num(c.retainer_amount);
      return {
        id: c.id,
        title: c.title,
        type: deriveContractType(c, milestonesByContract),
        status: c.status,
        start_date: c.start_date,
        end_date: c.end_date,
        total_value: num(c.total_value),
        currency: c.currency,
        retainer_amount: num(c.retainer_amount),
        retainer_cycle: c.retainer_cycle,
        project_id: c.project_id,
        client_id: c.client_id,
        invoices: cInvoices,
        milestones: cMilestones,
        kpis: {
          total_value: totalValue,
          total_paid: totalPaid,
          remaining: Math.max(totalValue - totalPaid, 0),
          invoice_count: cInvoices.length,
          // Q-A4 semantic (Phase 9): workspace's production data uses
          // 'invoiced' for done-and-billed milestones. The KPI label is
          // "milestones_completed" but the spirit is "terminal/done
          // milestones" — count both. Verified against Etmam contracts
          // (cm_KjkMotloVwS8yB6Z, cm_iIED1bYZMScoFXLt etc. all use 'invoiced'
          // even though the parent contract status is 'completed').
          milestones_completed: cMilestones.filter(
            (m) => m.status === 'completed' || m.status === 'invoiced',
          ).length,
          milestones_total: cMilestones.length,
        },
      };
    });

    // Top-level customer KPIs. Money is grouped PER-CURRENCY (never summed
    // across currencies). `ltv`/`mrr` remain single totals for backward-compat
    // consumers; the *_by_currency maps let the UI render one figure per
    // currency, and `currency` now reflects the dominant currency (by LTV)
    // instead of a hardcoded 'AED'.
    const invoiceCurrencyById = new Map<string, string>();
    for (const inv of invoices) invoiceCurrencyById.set(inv.id, inv.currency || 'AED');

    const ltvByCurrency: Record<string, number> = {};
    for (const p of payments) {
      const cur = (p.invoice_id && invoiceCurrencyById.get(p.invoice_id)) || 'AED';
      ltvByCurrency[cur] = (ltvByCurrency[cur] || 0) + num(p.amount);
    }
    const ltv = Object.values(ltvByCurrency).reduce((a, b) => a + b, 0);

    const mrrByCurrency: Record<string, number> = {};
    for (const c of enrichedContracts) {
      if (c.type === 'retainer' && c.status === 'active') {
        const months = cycleMonths[(c.retainer_cycle || 'monthly').toLowerCase()] ?? 1;
        const cur = c.currency || 'AED';
        mrrByCurrency[cur] = (mrrByCurrency[cur] || 0) + c.retainer_amount / months;
      }
    }
    const mrr = Object.values(mrrByCurrency).reduce((a, b) => a + b, 0);

    const dominantCurrency =
      Object.entries(ltvByCurrency).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      enrichedContracts[0]?.currency ||
      'AED';

    const activeContractsCount = enrichedContracts.filter((c) => c.status === 'active' || c.status === 'in_progress').length;
    const projectsCount = enrichedContracts.filter((c) => !!c.project_id).length;

    // ── Health Score (Q9-3 formula, also documented in CLAUDE.md) ──────────
    // Recency (30%): days since the most recent activity — using lastActivityAt
    // (unbounded), NOT the 30-day-windowed `activities` set (which could never
    // surface an activity >30d old, making the 30-90d and >90d buckets
    // unreachable). Falls back to lead.last_contact_at when there are no rows.
    let recencyScore = 0;
    let daysSinceLastActivity: number | null = null;
    const recencyBasis = lastActivityAt ?? lead.last_contact_at;
    if (recencyBasis) {
      const days = Math.floor((Date.now() - new Date(recencyBasis).getTime()) / (24 * 60 * 60 * 1000));
      daysSinceLastActivity = days;
      recencyScore = days < 7 ? 30 : days < 30 ? 20 : days < 90 ? 10 : 0;
    }

    // Payment (30%): % of last-180d invoices paid on or before due_date.
    // Uses the FULL invoice set (contract-linked + standalone) so a client
    // paying only standalone invoices still scores on payment health.
    const recentInvoices = invoices
      .filter((inv) => inv.due_date && inv.due_date >= oneEightyDaysAgoDate);
    let onTimePct = 0;
    if (recentInvoices.length > 0) {
      const onTimePaid = recentInvoices.filter((inv) => {
        if (inv.status !== 'paid') return false;
        // Approximate: check if payments for this invoice came on/before due_date.
        const invPayments = paymentsByInvoice.get(inv.id) ?? [];
        if (invPayments.length === 0) return false;
        const lastPayment = invPayments.reduce(
          (latest, p) => (p.payment_date && p.payment_date > latest ? p.payment_date : latest),
          '',
        );
        return lastPayment !== '' && inv.due_date !== null && lastPayment <= inv.due_date;
      }).length;
      onTimePct = (onTimePaid / recentInvoices.length) * 100;
    }
    const paymentScore = onTimePct > 90 ? 30 : onTimePct > 70 ? 20 : onTimePct > 50 ? 10 : 0;

    // Active contracts (20%)
    const hasActiveRetainer = enrichedContracts.some(
      (c) => c.type === 'retainer' && c.status === 'active',
    );
    const hasInProgressProject = enrichedContracts.some(
      (c) => c.type === 'project' && (c.status === 'in_progress' || c.status === 'active'),
    );
    const onlyCompleted = enrichedContracts.length > 0 &&
      enrichedContracts.every((c) => c.status === 'completed');
    const activeContractsScore = hasActiveRetainer || hasInProgressProject ? 20 : onlyCompleted ? 10 : 0;

    // Engagement (20%): activities in last 30d
    const engagementCount = activities.length;
    const engagementScore = engagementCount > 5 ? 20 : engagementCount > 0 ? 10 : 0;

    const totalScore = recencyScore + paymentScore + activeContractsScore + engagementScore;
    const color: 'emerald' | 'amber' | 'orange' | 'red' =
      totalScore >= 75 ? 'emerald'
      : totalScore >= 50 ? 'amber'
      : totalScore >= 25 ? 'orange'
      : 'red';

    return apiSuccess({
      customer: {
        ...lead,
        client_id: lead.client_id ?? null,
        // Fold in pyra_clients fields (if linked).
        portal_active: clientRow?.portal_active ?? null,
        client_email: clientRow?.email ?? null,
        portal_last_login_at: clientRow?.last_login_at ?? null,
        portal_auth_user_id: clientRow?.auth_user_id ?? null,
      },
      contracts: enrichedContracts,
      kpis: {
        ltv,
        mrr,
        ltv_by_currency: ltvByCurrency,
        mrr_by_currency: mrrByCurrency,
        contracts_count: enrichedContracts.length,
        active_contracts_count: activeContractsCount,
        projects_count: projectsCount,
        currency: dominantCurrency,
      },
      health_score: {
        score: totalScore,
        color,
        breakdown: {
          recency: recencyScore,
          payment: paymentScore,
          active_contracts: activeContractsScore,
          engagement: engagementScore,
        },
        factors: {
          days_since_last_activity: daysSinceLastActivity,
          recent_invoices_paid_on_time_pct: Math.round(onTimePct * 10) / 10,
          has_active_retainer_or_project: hasActiveRetainer || hasInProgressProject,
          activities_last_30d: engagementCount,
        },
      },
    });
  } catch (err) {
    console.error('GET /api/crm/customers/[lead_id]/dossier threw:', err);
    return apiServerError();
  }
}
