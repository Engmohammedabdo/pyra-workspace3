import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CONTRACT_FIELDS } from '@/lib/supabase/fields';
import { resolveUserScope } from '@/lib/auth/scope';

/**
 * Calculate next billing date from billing_day.
 */
function calculateNextBillingDate(billingDay: number): string {
  const now = new Date();
  const day = Math.min(Math.max(billingDay, 1), 28);
  let year = now.getFullYear();
  let month = now.getMonth();

  if (now.getDate() >= day) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }

  const date = new Date(year, month, day);
  return date.toISOString().split('T')[0];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const scope = await resolveUserScope(auth);
  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const { data, error } = await supabase
      .from('pyra_contracts')
      .select(CONTRACT_FIELDS)
      .eq('id', id)
      .single();

    if (error || !data) return apiNotFound();

    // Scope check: non-admins can only view contracts for their clients
    if (!scope.isAdmin && data.client_id && !scope.clientIds.includes(Number(data.client_id))) {
      return apiForbidden();
    }

    // Join client and project names
    let client_name = null;
    let client_company = null;
    let project_name = null;

    if (data.client_id) {
      const { data: client } = await supabase
        .from('pyra_clients')
        .select('name, company')
        .eq('id', data.client_id)
        .single();
      if (client) {
        client_name = client.name;
        client_company = client.company;
      }
    }

    if (data.project_id) {
      const { data: project } = await supabase
        .from('pyra_projects')
        .select('name')
        .eq('id', data.project_id)
        .single();
      if (project) project_name = project.name;
    }

    return apiSuccess({ ...data, client_name, client_company, project_name });
  } catch {
    return apiServerError();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const scope = await resolveUserScope(auth);
  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    // Fetch existing contract for scope check + side-effect comparison
    const { data: existing } = await supabase
      .from('pyra_contracts')
      .select(CONTRACT_FIELDS)
      .eq('id', id)
      .single();

    if (!existing) return apiNotFound();

    // Scope check
    if (!scope.isAdmin && existing.client_id && !scope.clientIds.includes(Number(existing.client_id))) {
      return apiForbidden();
    }

    const body = await req.json();

    // Allowlist fields to prevent mass assignment
    const allowedFields = [
      'title', 'description', 'client_id', 'project_id', 'status',
      'contract_type', 'start_date', 'end_date', 'total_value', 'currency',
      'vat_rate', 'billing_structure', 'notes',
      'retainer_amount', 'retainer_cycle', 'billing_day',
      'amount_billed', 'amount_collected',
    ];
    const update: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) update[field] = body[field];
    }
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_contracts')
      .update(update)
      .eq('id', id)
      .select(CONTRACT_FIELDS)
      .single();

    if (error || !data) return apiNotFound();

    // ── Retainer side-effects on status change ──
    const newStatus = body.status as string | undefined;
    const contractType = data.contract_type || existing.contract_type;

    if (newStatus && newStatus !== existing.status && contractType === 'retainer') {
      // Contract activated → auto-create recurring invoice
      if (newStatus === 'active') {
        const { data: existingRecurring } = await supabase
          .from('pyra_recurring_invoices')
          .select('id')
          .eq('contract_id', id)
          .maybeSingle();

        if (!existingRecurring) {
          const retainerAmount = Number(data.retainer_amount) || 0;
          const retainerCycle = data.retainer_cycle || 'monthly';
          const billingDay = Number(data.billing_day) || 1;

          if (retainerAmount > 0) {
            // Build recurring invoice title with scope
            let riTitle = `اشتراك شهري — ${data.title}`;
            const cycleLabels: Record<string, string> = { monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' };
            const cycleLabel = cycleLabels[retainerCycle] || 'شهري';
            riTitle = `اشتراك ${cycleLabel} — ${data.title}`;

            const riId = generateId('ri');
            await supabase.from('pyra_recurring_invoices').insert({
              id: riId,
              contract_id: id,
              client_id: data.client_id || null,
              title: riTitle,
              items: [{ description: data.title, quantity: 1, rate: retainerAmount }],
              currency: data.currency || 'AED',
              billing_cycle: retainerCycle,
              next_generation_date: calculateNextBillingDate(billingDay),
              status: 'active',
              auto_send: false,
              created_by: auth.pyraUser.username,
            });

            supabase.from('pyra_activity_log').insert({
              id: generateId('al'),
              action_type: 'retainer_recurring_created',
              username: auth.pyraUser.username,
              display_name: auth.pyraUser.display_name,
              target_path: `/finance/contracts/${id}`,
              details: { contract_id: id, recurring_id: riId, retainer_amount: retainerAmount },
            }).then(null, (e: unknown) => console.error('Activity log error:', e));
          }
        } else {
          // Re-activate existing paused recurring invoice
          await supabase
            .from('pyra_recurring_invoices')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('contract_id', id)
            .eq('status', 'paused');
        }
      }

      // Contract deactivated → pause recurring invoice
      if (newStatus === 'completed' || newStatus === 'cancelled') {
        const { data: activeRecurring } = await supabase
          .from('pyra_recurring_invoices')
          .select('id')
          .eq('contract_id', id)
          .eq('status', 'active')
          .maybeSingle();

        if (activeRecurring) {
          await supabase
            .from('pyra_recurring_invoices')
            .update({ status: 'paused', updated_at: new Date().toISOString() })
            .eq('id', activeRecurring.id);

          supabase.from('pyra_activity_log').insert({
            id: generateId('al'),
            action_type: 'retainer_recurring_paused',
            username: auth.pyraUser.username,
            display_name: auth.pyraUser.display_name,
            target_path: `/finance/contracts/${id}`,
            details: { contract_id: id, recurring_id: activeRecurring.id },
          }).then(null, (e: unknown) => console.error('Activity log error:', e));
        }
      }
    }

    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const scope = await resolveUserScope(auth);
  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    // Scope check: verify the contract belongs to a client in scope
    if (!scope.isAdmin) {
      const { data: existing } = await supabase
        .from('pyra_contracts')
        .select('client_id')
        .eq('id', id)
        .single();
      if (!existing) return apiNotFound();
      if (existing.client_id && !scope.clientIds.includes(Number(existing.client_id))) {
        return apiForbidden();
      }
    }

    const { error } = await supabase
      .from('pyra_contracts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'delete_contract',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/finance/contracts/${id}`,
      details: { contract_id: id },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
