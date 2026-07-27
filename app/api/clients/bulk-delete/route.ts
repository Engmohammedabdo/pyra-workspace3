import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import {
  findClientDeleteBlockers,
  purgeClientDependents,
} from '@/lib/clients/delete-dependents';

/** Per-request cap. Keeps the guard queries and the Auth-deletion loop bounded. */
const MAX_BULK = 50;

interface TargetClient {
  id: string;
  name: string;
  email: string;
  company: string;
  auth_user_id: string | null;
}

interface BlockedClient {
  id: string;
  name: string;
  reason: string;
}

/**
 * POST /api/clients/bulk-delete
 *
 * Delete several clients in one request. Body: { client_ids: string[] }.
 *
 * Guards and cleanup are shared with DELETE /api/clients/[id] via
 * `lib/clients/delete-dependents` — see that file for which of the 11 tables
 * referencing `pyra_clients` block a delete, which are purged, and why.
 *
 * What differs here is only the batching: every id is evaluated and reported
 * individually instead of failing the whole request on the first block, so the
 * caller gets back what was deleted and, for each refusal, the reason.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('clients.delete');
    if (isApiError(auth)) return auth;

    const body = (await request.json().catch(() => null)) as { client_ids?: unknown } | null;
    if (!body) return apiValidationError('البيانات المرسلة غير صالحة');

    const rawIds = body.client_ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return apiValidationError('اختر عميلاً واحداً على الأقل');
    }

    // De-duplicate and drop non-strings before anything touches the DB.
    const ids = Array.from(
      new Set(rawIds.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)),
    );
    if (ids.length === 0) return apiValidationError('اختر عميلاً واحداً على الأقل');
    if (ids.length > MAX_BULK) {
      return apiValidationError(`الحد الأقصى ${MAX_BULK} عميل في المرة الواحدة`);
    }

    const supabase = createServiceRoleClient();

    // ── Load the targets ─────────────────────────────
    const { data: targets, error: loadError } = await supabase
      .from('pyra_clients')
      .select('id, name, email, company, auth_user_id')
      .in('id', ids);

    if (loadError) {
      logError({
        error: loadError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { action: 'clients-bulk-delete', stage: 'load', count: ids.length },
      });
      return apiServerError();
    }

    const found = (targets ?? []) as TargetClient[];
    if (found.length === 0) return apiValidationError('لم يتم العثور على أي من العملاء المحددين');

    const foundIds = found.map((c) => c.id);

    // ── Guards + purge: shared with DELETE /api/clients/[id] ──
    const { blocked: scanBlocked, error: guardError } = await findClientDeleteBlockers(
      supabase,
      found,
    );

    if (guardError) {
      logError({
        error: guardError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { action: 'clients-bulk-delete', stage: 'guards', count: foundIds.length },
      });
      // Fail CLOSED: without a trustworthy guard result we cannot tell which
      // clients still carry financial history, so nothing is deleted.
      return apiServerError();
    }

    const blocked: BlockedClient[] = scanBlocked;
    const blockedIds = new Set(blocked.map((b) => b.id));
    const deletable = found.filter((c) => !blockedIds.has(c.id));

    // Ids the caller asked for that no longer exist — report, don't fail.
    const missing = ids.filter((id) => !foundIds.includes(id));

    if (deletable.length === 0) {
      return apiSuccess({ deleted: [], blocked, missing });
    }

    const deletableIds = deletable.map((c) => c.id);

    const purge = await purgeClientDependents(supabase, deletableIds);
    if (purge.error) {
      logError({
        error: purge.error,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { action: 'clients-bulk-delete', stage: purge.stage, ids: deletableIds },
      });
      // Clients are still intact — the delete would have failed on the FK anyway.
      return apiServerError();
    }

    // ── Delete the client rows ───────────────────────
    const { error: deleteError } = await supabase
      .from('pyra_clients')
      .delete()
      .in('id', deletableIds);

    if (deleteError) {
      logError({
        error: deleteError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { action: 'clients-bulk-delete', stage: 'delete', ids: deletableIds },
      });
      return apiServerError();
    }

    // ── Remove portal logins (non-critical, mirrors the single route) ──
    for (const c of deletable) {
      if (!c.auth_user_id) continue;
      const { error: authError } = await supabase.auth.admin.deleteUser(c.auth_user_id);
      if (authError) {
        console.error('Bulk client delete — auth user delete failed (non-critical):', authError);
      }
    }

    // ── Audit trail: one row per client, same action type as the single route ──
    for (const c of deletable) {
      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        'client_deleted',
        `/dashboard/clients/${c.id}`,
        {
          client_id: c.id,
          client_name: c.name,
          client_email: c.email,
          company: c.company,
          source: 'bulk',
          batch_size: deletable.length,
        },
        request.headers.get('x-forwarded-for') || undefined,
      );
    }

    return apiSuccess({
      deleted: deletable.map((c) => ({ id: c.id, name: c.name })),
      blocked,
      missing,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'clients-bulk-delete' } });
    console.error('POST /api/clients/bulk-delete error:', err);
    return apiServerError();
  }
}
