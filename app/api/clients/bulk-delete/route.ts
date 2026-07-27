import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';

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
 * Applies the SAME guard as DELETE /api/clients/[id] — a client with linked
 * projects, quotes or invoices is refused — but evaluates every id and reports
 * per-client outcomes instead of failing the whole batch on the first block.
 * The caller gets back what was deleted and, for each refusal, why.
 *
 * Two behaviours differ from the single-client route, both deliberate:
 *
 *  1. Guards run as three grouped queries rather than three per client, so a
 *     50-client batch costs a fixed number of round trips.
 *  2. `pyra_sales_leads.client_id` is cleared for every deleted client. There is
 *     no FK on that column, so the single-client route leaves the originating
 *     lead pointing at a row that no longer exists. Deleting in bulk makes that
 *     dangling pointer far easier to create, so it is repaired here.
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
    // Guard on company STRING, matching the single-client route: pyra_projects
    // links to a client by `client_company`, not by id.
    const companies = Array.from(new Set(found.map((c) => c.company).filter(Boolean)));

    // ── Guards: three grouped queries, not three per client ──
    const [quotesRes, invoicesRes, projectsRes] = await Promise.all([
      supabase.from('pyra_quotes').select('client_id').in('client_id', foundIds),
      supabase.from('pyra_invoices').select('client_id').in('client_id', foundIds),
      companies.length > 0
        ? supabase.from('pyra_projects').select('client_company').in('client_company', companies)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (quotesRes.error || invoicesRes.error || projectsRes.error) {
      const guardError = quotesRes.error ?? invoicesRes.error ?? projectsRes.error;
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

    const tally = (rows: { [k: string]: unknown }[] | null, key: string) => {
      const counts = new Map<string, number>();
      for (const row of rows ?? []) {
        const k = row[key];
        if (typeof k === 'string') counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return counts;
    };

    const quoteCounts = tally(quotesRes.data, 'client_id');
    const invoiceCounts = tally(invoicesRes.data, 'client_id');
    const projectCounts = tally(projectsRes.data, 'client_company');

    // ── Split into deletable vs blocked ──────────────
    const deletable: TargetClient[] = [];
    const blocked: BlockedClient[] = [];

    for (const c of found) {
      const parts: string[] = [];
      const projects = projectCounts.get(c.company) ?? 0;
      const quotes = quoteCounts.get(c.id) ?? 0;
      const invoices = invoiceCounts.get(c.id) ?? 0;

      if (projects > 0) parts.push(`${projects} مشروع`);
      if (quotes > 0) parts.push(`${quotes} عرض سعر`);
      if (invoices > 0) parts.push(`${invoices} فاتورة`);

      if (parts.length > 0) {
        blocked.push({ id: c.id, name: c.name, reason: `مرتبط بـ ${parts.join(' و ')}` });
      } else {
        deletable.push(c);
      }
    }

    // Ids the caller asked for that no longer exist — report, don't fail.
    const missing = ids.filter((id) => !foundIds.includes(id));

    if (deletable.length === 0) {
      return apiSuccess({ deleted: [], blocked, missing });
    }

    const deletableIds = deletable.map((c) => c.id);

    // ── Detach originating leads BEFORE the delete ───
    // `pyra_sales_leads.client_id` has no FK, so a delete would leave the lead
    // pointing at a missing row. Done first: if this fails we abort with the
    // clients still intact, which is recoverable. The reverse is not.
    const { error: detachError } = await supabase
      .from('pyra_sales_leads')
      .update({ client_id: null, updated_at: new Date().toISOString() })
      .in('client_id', deletableIds);

    if (detachError) {
      logError({
        error: detachError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { action: 'clients-bulk-delete', stage: 'detach_leads', ids: deletableIds },
      });
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
