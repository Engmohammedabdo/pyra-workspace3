import type { SupabaseClient } from '@supabase/supabase-js';
import { isAssignableUser } from '@/lib/auth/lead-scope';
import { notifyBatch } from '@/lib/notifications/notify';
import { PIPELINE_FINAL_STAGES } from '@/lib/constants/statuses';

/** A lead needs handover unless it is archived or in a codebase-terminal stage.
 *  NULL/custom stages count as open (safe over-inclusion — admin can pick "leave").
 *  Terminal set comes from PIPELINE_FINAL_STAGES; pyra_pipeline_stages is empty
 *  and has no won/lost columns, so it is intentionally NOT read. */
export function isOpenLeadStage(stageId: string | null): boolean {
  if (stageId === null) return true;
  return !(PIPELINE_FINAL_STAGES as readonly string[]).includes(stageId);
}

export interface HandoverItem {
  id: string;
  label: string;
}
export interface HandoverList {
  leads: HandoverItem[];
  follow_ups: HandoverItem[];
  tasks: HandoverItem[];
  whatsapp: HandoverItem[];
  lead_tasks: HandoverItem[];
  direct_reports: HandoverItem[]; // active reports whose manager is the leaver
  external_files: { count: number; hosts: string[] }; // EXTERNAL-DEPENDENCY — warn only
  access: { board_members: number; team_members: number; wa_settings: number; favorites: number };
}

export class HandoverReadError extends Error {}

async function orThrow<T>(
  p: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  ctx: string,
): Promise<T> {
  const { data, error } = await p;
  if (error) throw new HandoverReadError(`${ctx}: ${error.message}`);
  return (data ?? []) as unknown as T;
}

/**
 * Read every WORK/ACCESS/EXTERNAL source still tied to `username`. FAIL-CLOSED:
 * any read error throws HandoverReadError so the caller aborts the exit rather
 * than showing an empty list (Supabase returns {error}, not a throw, so a bad
 * column would otherwise read as "nothing to hand over").
 */
export async function buildHandover(
  serviceClient: SupabaseClient,
  username: string,
): Promise<HandoverList> {
  // Terminal stages come from the codebase constant PIPELINE_FINAL_STAGES (via
  // isOpenLeadStage) — pyra_pipeline_stages is empty and has no won/lost columns.
  // A NULL or custom (ps_*) stage counts as open (safe over-inclusion; admin
  // picks "leave").
  const leadRows = (await orThrow(
    serviceClient
      .from('pyra_sales_leads')
      .select('id, name, stage_id')
      .eq('assigned_to', username)
      .is('archived_at', null),
    'leads',
  )) as { id: string; name: string | null; stage_id: string | null }[];
  const leads = leadRows.filter((l) => isOpenLeadStage(l.stage_id));

  const followUps = (await orThrow(
    serviceClient
      .from('pyra_sales_follow_ups')
      .select('id, title, status')
      .eq('assigned_to', username)
      .in('status', ['pending', 'overdue']),
    'follow_ups',
  )) as { id: string; title: string | null }[];

  // Board tasks — three explicit reads (avoids a fragile PostgREST nested-join
  // alias on pyra_tasks.column_id): 1) task_ids assigned to the leaver,
  // 2) those tasks that are not archived, 3) whether each task's column is a
  // "done" column. A task with a NULL/unknown column counts as OPEN.
  const assignRows = (await orThrow(
    serviceClient.from('pyra_task_assignees').select('task_id').eq('username', username),
    'task_assignees',
  )) as { task_id: string }[];
  const assignedTaskIds = [...new Set(assignRows.map((a) => a.task_id))];
  let openTasks: { id: string; title: string | null }[] = [];
  if (assignedTaskIds.length) {
    const taskRows = (await orThrow(
      serviceClient
        .from('pyra_tasks')
        .select('id, title, column_id')
        .in('id', assignedTaskIds)
        .eq('is_archived', false),
      'tasks',
    )) as { id: string; title: string | null; column_id: string | null }[];
    const columnIds = [...new Set(taskRows.map((t) => t.column_id).filter((c): c is string => !!c))];
    const doneColumnIds = new Set<string>();
    if (columnIds.length) {
      const columnRows = (await orThrow(
        serviceClient.from('pyra_board_columns').select('id, is_done_column').in('id', columnIds),
        'board_columns',
      )) as { id: string; is_done_column: boolean | null }[];
      for (const c of columnRows) if (c.is_done_column) doneColumnIds.add(c.id);
    }
    openTasks = taskRows
      .filter((t) => !(t.column_id && doneColumnIds.has(t.column_id)))
      .map((t) => ({ id: t.id, title: t.title }));
  }

  const waConvs = (await orThrow(
    serviceClient
      .from('pyra_whatsapp_conversations')
      .select('id, contact_name, status')
      .eq('assigned_to', username)
      .eq('status', 'open'),
    'whatsapp',
  )) as { id: string; contact_name: string | null }[];

  const leadTasks = (await orThrow(
    serviceClient
      .from('pyra_lead_tasks')
      .select('id, title, status')
      .eq('assigned_to', username)
      .neq('status', 'completed'),
    'lead_tasks',
  )) as { id: string; title: string | null }[];

  const reports = (await orThrow(
    serviceClient
      .from('pyra_users')
      .select('username, display_name')
      .eq('manager_username', username)
      .eq('status', 'active'),
    'direct_reports',
  )) as { username: string; display_name: string }[];

  const attachments = (await orThrow(
    serviceClient.from('pyra_task_attachments').select('file_url').eq('uploaded_by', username),
    'attachments',
  )) as { file_url: string | null }[];
  const hosts = [
    ...new Set(
      attachments.map((a) => {
        try {
          return new URL(a.file_url ?? '').hostname;
        } catch {
          return 'unknown';
        }
      }),
    ),
  ];

  const [bm, tm, was, fav] = (await Promise.all([
    orThrow(serviceClient.from('pyra_board_members').select('id').eq('username', username), 'board_members'),
    orThrow(serviceClient.from('pyra_team_members').select('id').eq('username', username), 'team_members'),
    orThrow(
      serviceClient.from('pyra_agent_whatsapp_settings').select('id').eq('agent_username', username),
      'wa_settings',
    ),
    orThrow(serviceClient.from('pyra_favorites').select('id').eq('username', username), 'favorites'),
  ])) as { id: string }[][];

  return {
    leads: leads.map((l) => ({ id: l.id, label: l.name ?? l.id })),
    follow_ups: followUps.map((f) => ({ id: f.id, label: f.title ?? f.id })),
    whatsapp: waConvs.map((c) => ({ id: c.id, label: c.contact_name ?? c.id })),
    lead_tasks: leadTasks.map((t) => ({ id: t.id, label: t.title ?? t.id })),
    direct_reports: reports.map((r) => ({ id: r.username, label: r.display_name })),
    tasks: openTasks.map((t) => ({ id: t.id, label: t.title ?? t.id })),
    external_files: { count: attachments.length, hosts },
    access: { board_members: bm.length, team_members: tm.length, wa_settings: was.length, favorites: fav.length },
  };
}

export interface HandoverDecisions {
  leads?: { action: 'reassign' | 'leave'; to?: string };
  follow_ups?: { action: 'reassign' | 'leave'; to?: string };
  tasks?: { action: 'reassign' | 'archive' | 'leave'; to?: string };
  whatsapp?: { action: 'reassign' | 'leave'; to?: string };
  lead_tasks?: { action: 'reassign' | 'leave'; to?: string };
  direct_reports?: { action: 'reparent' | 'leave'; to?: string };
  external_files_acknowledged?: boolean;
}
export interface HandoverResult {
  errors: string[];
  applied: Record<string, unknown>;
}

/**
 * Best-effort recompute of the leaver's OPEN board-task ids — the SAME
 * predicate buildHandover shows the admin (assigned to the leaver via
 * pyra_task_assignees, task not archived, task's column not a done column;
 * a NULL/unknown column counts as open). Any read error is pushed to
 * `errors` and the function returns [] (skip, don't throw — this is
 * executeHandover's best-effort path, not buildHandover's fail-closed reads).
 * "What you see is what you act on": reassign/archive must never touch a
 * done/archived task the admin never saw in the handover list.
 */
async function getOpenTaskIds(
  serviceClient: SupabaseClient,
  username: string,
  errors: string[],
): Promise<string[]> {
  const { data: assignRows, error: assignError } = await serviceClient
    .from('pyra_task_assignees')
    .select('task_id')
    .eq('username', username);
  if (assignError) {
    errors.push(`tasks: ${assignError.message}`);
    return [];
  }
  const assignedTaskIds = [
    ...new Set(((assignRows ?? []) as { task_id: string }[]).map((a) => a.task_id)),
  ];
  if (!assignedTaskIds.length) return [];

  const { data: taskRows, error: taskError } = await serviceClient
    .from('pyra_tasks')
    .select('id, column_id')
    .in('id', assignedTaskIds)
    .eq('is_archived', false);
  if (taskError) {
    errors.push(`tasks: ${taskError.message}`);
    return [];
  }
  const rows = (taskRows ?? []) as { id: string; column_id: string | null }[];
  const columnIds = [...new Set(rows.map((t) => t.column_id).filter((c): c is string => !!c))];
  const doneColumnIds = new Set<string>();
  if (columnIds.length) {
    const { data: columnRows, error: columnError } = await serviceClient
      .from('pyra_board_columns')
      .select('id, is_done_column')
      .in('id', columnIds);
    if (columnError) {
      errors.push(`tasks: ${columnError.message}`);
      return [];
    }
    for (const c of (columnRows ?? []) as { id: string; is_done_column: boolean | null }[]) {
      if (c.is_done_column) doneColumnIds.add(c.id);
    }
  }
  return rows.filter((t) => !(t.column_id && doneColumnIds.has(t.column_id))).map((t) => t.id);
}

/**
 * Execute the admin's decisions with service-role writes. Reassign targets are
 * validated via isAssignableUser (the writes bypass RLS, so we self-enforce).
 * ACCESS rows are always removed. AUDIT rows are never touched. Best-effort:
 * per-source errors are collected, not thrown — the exit continues and records
 * the outcome (no transaction, backup-rollback doctrine).
 */
export async function executeHandover(
  serviceClient: SupabaseClient,
  username: string,
  decisions: HandoverDecisions,
  actor: { username: string; display_name: string },
): Promise<HandoverResult> {
  const errors: string[] = [];
  const applied: Record<string, unknown> = {};

  async function validate(to: string | undefined, ctx: string): Promise<string | null> {
    if (!to) {
      errors.push(`${ctx}: no target`);
      return null;
    }
    if (!(await isAssignableUser(serviceClient, to))) {
      errors.push(`${ctx}: target not assignable`);
      return null;
    }
    return to;
  }

  // Leads
  if (decisions.leads?.action === 'reassign') {
    const to = await validate(decisions.leads.to, 'leads');
    if (to) {
      const { data: leadRows, error: leadReadError } = await serviceClient
        .from('pyra_sales_leads')
        .select('id, name')
        .eq('assigned_to', username)
        .is('archived_at', null);
      if (leadReadError) {
        errors.push(`leads: ${leadReadError.message}`);
      } else {
        const rows = (leadRows ?? []) as { id: string; name: string | null }[];
        const ids = rows.map((l) => l.id);
        if (ids.length) {
          const { error } = await serviceClient
            .from('pyra_sales_leads')
            .update({ assigned_to: to, updated_at: new Date().toISOString() })
            .in('id', ids);
          if (error) errors.push(`leads: ${error.message}`);
          else {
            applied.leads = { reassigned_to: to, count: ids.length };
            await notifyBatch(
              serviceClient,
              rows.map((l) => ({
                to,
                type: 'lead_transferred',
                title: 'تم تحويل Lead لك', // i18n-exempt: notification content (Phase 8)
                message: `${actor.display_name} حوّل Lead "${l.name ?? 'بدون اسم'}" إليك`, // i18n-exempt: notification content (Phase 8)
                link: `/dashboard/crm/leads/${l.id}`,
                entity: { type: 'lead', id: l.id },
                from: { username: actor.username, displayName: actor.display_name },
              })),
            );
          }
        }
      }
    }
  }

  // Follow-ups (no existing endpoint — direct write is the fix for the gap)
  if (decisions.follow_ups?.action === 'reassign') {
    const to = await validate(decisions.follow_ups.to, 'follow_ups');
    if (to) {
      const { data, error } = await serviceClient
        .from('pyra_sales_follow_ups')
        .update({ assigned_to: to, updated_at: new Date().toISOString() })
        .eq('assigned_to', username)
        .in('status', ['pending', 'overdue'])
        .select('id');
      if (error) errors.push(`follow_ups: ${error.message}`);
      else applied.follow_ups = { reassigned_to: to, count: (data ?? []).length };
    }
  }

  // WhatsApp
  if (decisions.whatsapp?.action === 'reassign') {
    const to = await validate(decisions.whatsapp.to, 'whatsapp');
    if (to) {
      const { data, error } = await serviceClient
        .from('pyra_whatsapp_conversations')
        .update({ assigned_to: to })
        .eq('assigned_to', username)
        .eq('status', 'open')
        .select('id');
      if (error) errors.push(`whatsapp: ${error.message}`);
      else applied.whatsapp = { reassigned_to: to, count: (data ?? []).length };
    }
  }

  // Lead tasks
  if (decisions.lead_tasks?.action === 'reassign') {
    const to = await validate(decisions.lead_tasks.to, 'lead_tasks');
    if (to) {
      const { data, error } = await serviceClient
        .from('pyra_lead_tasks')
        .update({ assigned_to: to })
        .eq('assigned_to', username)
        .neq('status', 'completed')
        .select('id');
      if (error) errors.push(`lead_tasks: ${error.message}`);
      else applied.lead_tasks = { reassigned_to: to, count: (data ?? []).length };
    }
  }

  // Board tasks: reassign = repoint the pyra_task_assignees row to the target;
  // archive = set pyra_tasks.is_archived. Scoped to the leaver's OPEN task ids
  // ONLY (same predicate buildHandover shows the admin — not archived, not a
  // done column) via getOpenTaskIds — "what you see is what you act on".
  if (decisions.tasks && decisions.tasks.action !== 'leave') {
    const taskIds = await getOpenTaskIds(serviceClient, username, errors);
    if (taskIds.length) {
      if (decisions.tasks.action === 'archive') {
        const { error } = await serviceClient
          .from('pyra_tasks')
          .update({ is_archived: true })
          .in('id', taskIds);
        if (error) errors.push(`tasks: ${error.message}`);
        else applied.tasks = { archived: true, count: taskIds.length };
      } else if (decisions.tasks.action === 'reassign') {
        const to = await validate(decisions.tasks.to, 'tasks');
        if (to) {
          // pyra_task_assignees has UNIQUE (task_id, username) — a single bulk
          // update would violate it for any task where `to` is ALREADY a
          // co-assignee, failing the ENTIRE reassign. Split: tasks where `to`
          // is not yet assigned get a safe bulk update; tasks where `to` is
          // already assigned just drop the leaver's row (target is already on
          // the task).
          const { data: existingRows, error: existingError } = await serviceClient
            .from('pyra_task_assignees')
            .select('task_id')
            .eq('username', to)
            .in('task_id', taskIds);
          if (existingError) {
            errors.push(`tasks: ${existingError.message}`);
          } else {
            const alreadyAssignedIds = new Set(
              ((existingRows ?? []) as { task_id: string }[]).map((r) => r.task_id),
            );
            const toUpdateIds = taskIds.filter((id) => !alreadyAssignedIds.has(id));
            const toDropIds = taskIds.filter((id) => alreadyAssignedIds.has(id));
            let hadError = false;
            if (toUpdateIds.length) {
              const { error } = await serviceClient
                .from('pyra_task_assignees')
                .update({ username: to })
                .eq('username', username)
                .in('task_id', toUpdateIds);
              if (error) {
                errors.push(`tasks: ${error.message}`);
                hadError = true;
              }
            }
            if (toDropIds.length) {
              const { error } = await serviceClient
                .from('pyra_task_assignees')
                .delete()
                .eq('username', username)
                .in('task_id', toDropIds);
              if (error) {
                errors.push(`tasks: ${error.message}`);
                hadError = true;
              }
            }
            if (!hadError) applied.tasks = { reassigned_to: to, count: taskIds.length };
          }
        }
      }
    }
  }

  // Direct reports re-parent
  if (decisions.direct_reports?.action === 'reparent') {
    const to = await validate(decisions.direct_reports.to, 'direct_reports');
    if (to) {
      const { data, error } = await serviceClient
        .from('pyra_users')
        .update({ manager_username: to })
        .eq('manager_username', username)
        .eq('status', 'active')
        .select('username');
      if (error) errors.push(`direct_reports: ${error.message}`);
      else applied.direct_reports = { reparented_to: to, count: (data ?? []).length };
    }
  }

  // ACCESS — always removed (best-effort; a failure is logged, not fatal)
  for (const [table, col] of [
    ['pyra_board_members', 'username'],
    ['pyra_team_members', 'username'],
    ['pyra_agent_whatsapp_settings', 'agent_username'],
    ['pyra_favorites', 'username'],
  ] as const) {
    const { error } = await serviceClient.from(table).delete().eq(col, username);
    if (error) errors.push(`${table}: ${error.message}`);
  }

  applied.external_files = { acknowledged: decisions.external_files_acknowledged === true };
  return { errors, applied };
}
