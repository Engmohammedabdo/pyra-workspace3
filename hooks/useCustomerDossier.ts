'use client';

/**
 * Single hook that powers the entire Active Customer Page
 * (`/dashboard/crm/customers/[id]`) — wraps the dossier endpoint at
 * `GET /api/crm/customers/[lead_id]/dossier` (server-side aggregation
 * of customer + contracts + invoices + payments + milestones + KPIs +
 * 4-factor health score in one shot, see commit b52b1a6).
 *
 * Caching (Phase 9 Q-B2 — matches workspace convention for "hot data that
 * changes due to admin actions elsewhere"):
 *   - staleTime: 60_000 (1 min) — same shape as useCRMKPIs / useCRMFunnel
 *   - refetchOnWindowFocus: true — admin Alt-Tabs to /dashboard/finance/
 *     to record a payment, comes back, sees updated LTV/MRR/health
 *
 * The TypeScript types here MUST stay in lock-step with the dossier route
 * response shape. If the route's response shape evolves (e.g., new factor
 * in the health score, new field on a contract), update both ends.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';

// ── Sub-types ───────────────────────────────────────────────────────────────

export type ContractTypeTag = 'retainer' | 'project' | 'one-off';
export type HealthColor = 'emerald' | 'amber' | 'orange' | 'red';

export interface DossierCustomer {
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
  created_at: string;
  updated_at: string | null;
  // Folded in from pyra_clients (null when not converted to portal client)
  portal_active: boolean | null;
  client_email: string | null;
  portal_last_login_at: string | null;
  portal_auth_user_id: string | null;
}

export interface DossierInvoice {
  id: string;
  invoice_number: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number;
  total: number;
  /** Server's denormalized cache from pyra_invoices.amount_paid */
  amount_paid: number;
  /** Sum of pyra_payments.amount FOR THIS INVOICE — authoritative for "paid so far" */
  paid_amount: number;
  remaining: number;
}

export interface DossierMilestone {
  id: string;
  title: string | null;
  description: string | null;
  amount: number;
  due_date: string | null;
  status: string | null;
  invoice_id: string | null;
  completed_at: string | null;
}

export interface DossierContract {
  id: string;
  title: string | null;
  type: ContractTypeTag;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  total_value: number;
  currency: string | null;
  retainer_amount: number;
  retainer_cycle: string | null;
  project_id: string | null;
  client_id: string | null;
  invoices: DossierInvoice[];
  milestones: DossierMilestone[];
  kpis: {
    total_value: number;
    total_paid: number;
    remaining: number;
    invoice_count: number;
    /**
     * Counts both `status='completed'` AND `status='invoiced'` per Phase 9
     * Q-A4 (workspace's production milestones use 'invoiced' for terminal/
     * done-and-billed state). Documented in CLAUDE.md "CRM Health Score".
     */
    milestones_completed: number;
    milestones_total: number;
  };
}

export interface DossierTopLevelKPIs {
  /** Lifetime value — sum of pyra_payments.amount across all this customer's contracts */
  ltv: number;
  /** Monthly recurring revenue — sum of active retainers normalised to monthly */
  mrr: number;
  contracts_count: number;
  active_contracts_count: number;
  projects_count: number;
  currency: string;
}

export interface DossierHealthScore {
  score: number;
  color: HealthColor;
  breakdown: {
    recency: number;        // 0-30
    payment: number;        // 0-30
    active_contracts: number; // 0-20
    engagement: number;     // 0-20
  };
  factors: {
    days_since_last_activity: number | null;
    recent_invoices_paid_on_time_pct: number;
    has_active_retainer_or_project: boolean;
    activities_last_30d: number;
  };
}

export interface CustomerDossier {
  customer: DossierCustomer;
  contracts: DossierContract[];
  kpis: DossierTopLevelKPIs;
  health_score: DossierHealthScore;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Fetch the complete Active Customer Page dossier in one HTTP round trip.
 *
 * Returns 404 if the lead doesn't exist OR the caller can't access it
 * (canAccessLead gate is enforced server-side — sales agents see only
 * their own leads). React Query's `error` will surface the 404 message.
 */
export function useCustomerDossier(leadId: string | undefined) {
  return useQuery<CustomerDossier>({
    queryKey: ['crm', 'customers', leadId, 'dossier'],
    queryFn: () => fetchAPI(`/api/crm/customers/${leadId}/dossier`),
    enabled: !!leadId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
