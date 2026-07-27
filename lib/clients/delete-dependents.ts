import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared rules for deleting a `pyra_clients` row.
 *
 * `pyra_clients` is referenced by 11 tables. They fall into three groups, and
 * getting the grouping wrong is what made the first bulk-delete release return
 * a raw 500: eight of nine clients were refused by the database over a single
 * leftover portal notification each.
 *
 *  1. Resolves itself — no handling needed:
 *     pyra_client_notes, pyra_client_tag_assignments   (ON DELETE CASCADE)
 *     pyra_recurring_invoices, pyra_stripe_payments    (ON DELETE SET NULL)
 *
 *  2. Blocks the delete AND means something afterwards → report, never destroy:
 *     pyra_quotes, pyra_credit_notes, pyra_file_approvals,
 *     pyra_whatsapp_messages                            (ON DELETE NO ACTION)
 *     plus pyra_invoices and pyra_projects, which carry NO database FK at all
 *     (projects join by company STRING), so they are guarded here or nowhere.
 *
 *  3. Blocks the delete but is meaningless without the client → purge first:
 *     pyra_client_notifications, pyra_client_password_resets
 *
 * `pyra_sales_leads.client_id` is its own case: NO ACTION, but the lead is the
 * record of where the customer came from and must outlive the client row, so it
 * is detached rather than blocked or deleted.
 *
 * Both delete routes (single and bulk) go through here so the two can never
 * disagree about what is safe to destroy.
 */

/** Minimal shape both routes already load before deleting. */
export interface ClientDeleteTarget {
  id: string;
  name: string;
  company: string;
}

export interface ClientDeleteBlocker {
  id: string;
  name: string;
  /** Arabic, user-facing: "مرتبط بـ 2 عرض سعر و 1 فاتورة". */
  reason: string;
}

export interface BlockerScan {
  blocked: ClientDeleteBlocker[];
  /** Non-null when a guard query failed — callers MUST fail closed. */
  error: unknown | null;
}

/** Bare `SupabaseClient`, matching lib/notifications/notify.ts and lib/auth/team-scope.ts. */
type Sb = SupabaseClient;

function tally(rows: Record<string, unknown>[] | null, key: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    const k = row[key];
    if (typeof k === 'string') counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * Find which of `targets` cannot be deleted, and why.
 *
 * Runs one grouped query per dependent table rather than per client, so a
 * 50-client batch costs a fixed number of round trips.
 *
 * On any query error this returns `{ blocked: [], error }` — the caller must
 * abort rather than treat an empty blocker list as "everything is safe".
 */
export async function findClientDeleteBlockers(
  supabase: Sb,
  targets: ClientDeleteTarget[],
): Promise<BlockerScan> {
  if (targets.length === 0) return { blocked: [], error: null };

  const ids = targets.map((c) => c.id);
  const companies = Array.from(new Set(targets.map((c) => c.company).filter(Boolean)));

  const [quotes, invoices, projects, credits, approvals, whatsapp] = await Promise.all([
    supabase.from('pyra_quotes').select('client_id').in('client_id', ids),
    supabase.from('pyra_invoices').select('client_id').in('client_id', ids),
    companies.length > 0
      ? supabase.from('pyra_projects').select('client_company').in('client_company', companies)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('pyra_credit_notes').select('client_id').in('client_id', ids),
    supabase.from('pyra_file_approvals').select('client_id').in('client_id', ids),
    supabase.from('pyra_whatsapp_messages').select('client_id').in('client_id', ids),
  ]);

  const error =
    quotes.error ?? invoices.error ?? projects.error ??
    credits.error ?? approvals.error ?? whatsapp.error ?? null;
  if (error) return { blocked: [], error };

  const byQuote = tally(quotes.data, 'client_id');
  const byInvoice = tally(invoices.data, 'client_id');
  const byProject = tally(projects.data, 'client_company');
  const byCredit = tally(credits.data, 'client_id');
  const byApproval = tally(approvals.data, 'client_id');
  const byWhatsapp = tally(whatsapp.data, 'client_id');

  const blocked: ClientDeleteBlocker[] = [];

  for (const c of targets) {
    const parts: string[] = [];
    const counts: [number, string][] = [
      [byProject.get(c.company) ?? 0, 'مشروع'],
      [byQuote.get(c.id) ?? 0, 'عرض سعر'],
      [byInvoice.get(c.id) ?? 0, 'فاتورة'],
      [byCredit.get(c.id) ?? 0, 'إشعار دائن'],
      [byApproval.get(c.id) ?? 0, 'موافقة على ملف'],
      [byWhatsapp.get(c.id) ?? 0, 'رسالة واتساب'],
    ];
    for (const [n, label] of counts) {
      if (n > 0) parts.push(`${n} ${label}`);
    }
    if (parts.length > 0) {
      blocked.push({ id: c.id, name: c.name, reason: `مرتبط بـ ${parts.join(' و ')}` });
    }
  }

  return { blocked, error: null };
}

export interface PurgeResult {
  /** Non-null when a step failed. The client rows are still intact. */
  error: unknown | null;
  /** Which step failed — for the error log. */
  stage?: 'detach_leads' | 'notifications' | 'password_resets';
}

/**
 * Clear everything that would otherwise abort the delete at the database.
 *
 * Ordering is deliberate: leads are detached FIRST. If that fails we stop with
 * the clients still present, which is recoverable; deleting first and failing to
 * detach is not — it strands leads pointing at rows that no longer exist.
 *
 * Call ONLY for clients that `findClientDeleteBlockers` cleared.
 */
export async function purgeClientDependents(supabase: Sb, ids: string[]): Promise<PurgeResult> {
  if (ids.length === 0) return { error: null };

  // `pyra_sales_leads.client_id` has no FK, so nothing at the database level
  // would stop a delete from stranding the lead. Detach, never delete: the lead
  // is the only record of where the customer came from.
  const { error: detachError } = await supabase
    .from('pyra_sales_leads')
    .update({ client_id: null, updated_at: new Date().toISOString() })
    .in('client_id', ids);
  if (detachError) return { error: detachError, stage: 'detach_leads' };

  const { error: notifError } = await supabase
    .from('pyra_client_notifications')
    .delete()
    .in('client_id', ids);
  if (notifError) return { error: notifError, stage: 'notifications' };

  const { error: resetError } = await supabase
    .from('pyra_client_password_resets')
    .delete()
    .in('client_id', ids);
  if (resetError) return { error: resetError, stage: 'password_resets' };

  return { error: null };
}
