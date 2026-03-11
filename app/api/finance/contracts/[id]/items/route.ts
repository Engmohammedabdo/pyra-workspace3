import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiForbidden,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CONTRACT_ITEM_FIELDS } from '@/lib/supabase/fields';
import { resolveUserScope } from '@/lib/auth/scope';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/finance/contracts/[id]/items
 * Fetch all contract items grouped by parent/children.
 */
export async function GET(
  _req: NextRequest,
  context: RouteContext
) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const scope = await resolveUserScope(auth);
  const { id } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    // Verify contract exists + scope
    const { data: contract } = await supabase
      .from('pyra_contracts')
      .select('id, client_id')
      .eq('id', id)
      .maybeSingle();

    if (!contract) return apiNotFound('العقد غير موجود');

    if (!scope.isAdmin && contract.client_id && !scope.clientIds.includes(Number(contract.client_id))) {
      return apiForbidden();
    }

    // Fetch all items sorted
    const { data: items, error } = await supabase
      .from('pyra_contract_items')
      .select(CONTRACT_ITEM_FIELDS)
      .eq('contract_id', id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Contract items fetch error:', error);
      return apiServerError();
    }

    // Group: parent items with children nested
    const parents = (items || []).filter((i: { parent_id: string | null }) => !i.parent_id);
    const grouped = parents.map((parent: { id: string }) => ({
      ...parent,
      children: (items || [])
        .filter((i: { parent_id: string | null }) => i.parent_id === parent.id)
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
    }));

    return apiSuccess({ items: grouped });
  } catch (err) {
    console.error('GET /api/finance/contracts/[id]/items error:', err);
    return apiServerError();
  }
}

/**
 * PUT /api/finance/contracts/[id]/items
 * Replace all contract items (backup-rollback pattern).
 *
 * Body: { items: [{ title, description?, children?: [{ title, description? }] }] }
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    // Verify contract exists
    const { data: contract } = await supabase
      .from('pyra_contracts')
      .select('id, title')
      .eq('id', id)
      .maybeSingle();

    if (!contract) return apiNotFound('العقد غير موجود');

    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return apiValidationError('items must be an array');
    }

    // 1. Backup existing items
    const { data: backup } = await supabase
      .from('pyra_contract_items')
      .select('*')
      .eq('contract_id', id);

    // 2. Delete all existing items (children deleted via CASCADE)
    await supabase
      .from('pyra_contract_items')
      .delete()
      .eq('contract_id', id);

    // 3. Build rows — parents first, then children
    const now = new Date().toISOString();
    const parentRows: Array<Record<string, unknown>> = [];
    const childRows: Array<Record<string, unknown>> = [];

    items.forEach((item: { title: string; description?: string; children?: Array<{ title: string; description?: string }> }, idx: number) => {
      const parentId = generateId('cti');
      parentRows.push({
        id: parentId,
        contract_id: id,
        parent_id: null,
        title: item.title,
        description: item.description || null,
        sort_order: idx,
        created_at: now,
        updated_at: now,
      });

      if (Array.isArray(item.children)) {
        item.children.forEach((child, cIdx) => {
          childRows.push({
            id: generateId('cti'),
            contract_id: id,
            parent_id: parentId,
            title: child.title,
            description: child.description || null,
            sort_order: cIdx,
            created_at: now,
            updated_at: now,
          });
        });
      }
    });

    // 4. Insert parents
    if (parentRows.length > 0) {
      const { error: parentErr } = await supabase
        .from('pyra_contract_items')
        .insert(parentRows);

      if (parentErr) {
        console.error('Contract items parent insert error:', parentErr);
        // Rollback
        if (backup?.length) {
          await supabase.from('pyra_contract_items').insert(backup);
        }
        return apiServerError(parentErr.message);
      }
    }

    // 5. Insert children
    if (childRows.length > 0) {
      const { error: childErr } = await supabase
        .from('pyra_contract_items')
        .insert(childRows);

      if (childErr) {
        console.error('Contract items child insert error:', childErr);
        // Rollback: delete inserted parents, restore backup
        await supabase.from('pyra_contract_items').delete().eq('contract_id', id);
        if (backup?.length) {
          await supabase.from('pyra_contract_items').insert(backup);
        }
        return apiServerError(childErr.message);
      }
    }

    // 6. Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'contract_items_updated',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/contracts/${id}`,
      details: {
        contract_title: contract.title,
        items_count: parentRows.length,
        children_count: childRows.length,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    // 7. Return updated items
    const { data: updated } = await supabase
      .from('pyra_contract_items')
      .select(CONTRACT_ITEM_FIELDS)
      .eq('contract_id', id)
      .order('sort_order', { ascending: true });

    const parents = (updated || []).filter((i: { parent_id: string | null }) => !i.parent_id);
    const grouped = parents.map((parent: { id: string }) => ({
      ...parent,
      children: (updated || [])
        .filter((i: { parent_id: string | null }) => i.parent_id === parent.id)
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
    }));

    return apiSuccess({ items: grouped });
  } catch (err) {
    console.error('PUT /api/finance/contracts/[id]/items error:', err);
    return apiServerError();
  }
}
