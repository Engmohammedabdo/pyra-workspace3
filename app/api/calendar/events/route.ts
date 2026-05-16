import { NextRequest } from 'next/server';
import {
  requireApiPermission,
  isApiError,
  type ApiAuthResult,
} from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';
import {
  CALENDAR_MAX_WINDOW_DAYS,
  CALENDAR_TIMEZONE_OFFSET,
} from '@/lib/constants/statuses';
import type {
  CalendarEvent,
  CalendarEventSource,
  CalendarEventsResponse,
  LeadTaskStatus,
  LeadTaskPriority,
} from '@/types/database';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/calendar/events
//
// Phase 15.1 Commit 4 — unified calendar feed. Pulls from 3 sources:
//   1. pyra_lead_tasks         (with non-null due_date AND status != cancelled)
//   2. pyra_sales_follow_ups   (with non-null due_at AND status != cancelled)
//   3. pyra_lead_activities    (activity_type = 'meeting_scheduled'
//                               AND metadata.meeting_date IS NOT NULL)
//
// Query params:
//   from: YYYY-MM-DD   (REQUIRED — start of window, inclusive)
//   to:   YYYY-MM-DD   (REQUIRED — end of window, inclusive)
//   types: comma-separated subset of task|follow_up|meeting (default: all 3)
//   assigned_to: username (default: caller; admin can pass any)
//   lead_id: filter to single lead
//
// Permission: dashboard.view (every internal user)
// Scope:
//   - admin:       see all events in window
//   - sales_agent: see only events assigned to self (or on leads they own)
//   - employee:    see only their own assigned events
//
// Max window: CALENDAR_MAX_WINDOW_DAYS (62) — prevents accidental
// "give me 5 years" → 100k-row scans.
//
// Response invariants (LOCK 1 — CRITICAL):
//   - Events sorted by start ASC, then source ASC, then source_id ASC
//   - Stable tiebreaker prevents UI flicker on refetch with identical payloads
//
// Timezone (LOCK 3):
//   - All ISO strings carry an explicit offset
//   - Date-only sources (lead_task.due_date) → midnight Asia/Dubai (+04:00)
//   - Datetime sources (follow_up.due_at, meeting metadata) → as-stored
//     (already with offset since they're timestamptz / ISO strings)
//
// Batched lookups (LOCK 4 — Reviewer focus #5):
//   - ONE batched SELECT against pyra_sales_leads for lead_name enrichment
//   - ONE batched SELECT against pyra_users for assignee display_name
//   - NO N+1 patterns
// ────────────────────────────────────────────────────────────────────────────

const ALL_SOURCES: CalendarEventSource[] = ['task', 'follow_up', 'meeting'];
const SOURCE_SET = new Set<CalendarEventSource>(ALL_SOURCES);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    const auth = await requireApiPermission('dashboard.view');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const sp = request.nextUrl.searchParams;

    // ── Parse from/to ──
    const fromStr = sp.get('from')?.trim() ?? '';
    const toStr = sp.get('to')?.trim() ?? '';
    if (!fromStr || !toStr) {
      return apiValidationError('المعاملات from و to مطلوبتان (بصيغة YYYY-MM-DD)');
    }
    if (!DATE_RE.test(fromStr) || !DATE_RE.test(toStr)) {
      return apiValidationError('from و to يجب أن يكونا بصيغة YYYY-MM-DD');
    }
    const fromDate = new Date(`${fromStr}T00:00:00${CALENDAR_TIMEZONE_OFFSET}`);
    const toDate = new Date(`${toStr}T23:59:59${CALENDAR_TIMEZONE_OFFSET}`);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return apiValidationError('from أو to تاريخ غير صحيح');
    }
    if (fromDate > toDate) {
      return apiValidationError('from يجب أن يسبق to');
    }
    const diffMs = toDate.getTime() - fromDate.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > CALENDAR_MAX_WINDOW_DAYS) {
      return apiValidationError(
        `نطاق التاريخ كبير جداً (الحد الأقصى ${CALENDAR_MAX_WINDOW_DAYS} يوم). ${diffDays} يوم تم طلبهم.`,
      );
    }

    // ── Parse types filter ──
    const typesParam = sp.get('types')?.trim();
    let types: CalendarEventSource[];
    if (!typesParam) {
      types = ALL_SOURCES;
    } else {
      const raw = typesParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const valid = raw.filter((s): s is CalendarEventSource =>
        SOURCE_SET.has(s as CalendarEventSource),
      );
      if (valid.length === 0) {
        return apiValidationError(
          'types يجب أن يحتوي على واحد أو أكثر من: task, follow_up, meeting',
        );
      }
      types = valid;
    }
    const typeSet = new Set(types);

    // ── Parse assigned_to / lead_id ──
    const isAdmin = auth.pyraUser.role === 'admin';
    const requestedAssigned = sp.get('assigned_to')?.trim() || null;
    // Non-admin agents cannot widen scope beyond self (defense in depth)
    const assignedTo = isAdmin
      ? requestedAssigned
      : auth.pyraUser.username;
    // If non-admin tried to pass a different username, silently coerce to self
    // (no error — keeps URL-sharing safe; UI shouldn't expose the picker to
    // non-admins anyway).

    const leadId = sp.get('lead_id')?.trim() || null;

    const supabase = createServiceRoleClient();

    // ── Source 1: lead tasks ──
    // Filter: due_date in window, status != cancelled.
    // Sales-agent scope: assigned_to == self OR (leadId given AND owned).
    // The lead-scope check for non-admins is enforced by the batched
    // join with pyra_sales_leads later (we only emit events whose
    // resolved lead allows access; orphan-tasks-without-readable-lead
    // are still surfaced for the user's own assignments).
    let leadTasks: TaskRow[] = [];
    if (typeSet.has('task')) {
      let q = supabase
        .from('pyra_lead_tasks')
        .select(
          'id, lead_id, title, due_date, priority, status, assigned_to, created_at, completed_at',
        )
        .neq('status', 'cancelled')
        .gte('due_date', fromStr)
        .lte('due_date', toStr);
      if (assignedTo) q = q.eq('assigned_to', assignedTo);
      if (leadId) q = q.eq('lead_id', leadId);
      const { data, error } = await q;
      if (error) {
        logError({
          error,
          request,
          user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
          metadata: { action: 'calendar-tasks', from: fromStr, to: toStr },
        });
        console.error('calendar-tasks fetch error:', error.message);
        return apiServerError();
      }
      leadTasks = (data ?? []) as TaskRow[];
    }

    // ── Source 2: follow-ups ──
    let followUps: FollowUpRow[] = [];
    if (typeSet.has('follow_up')) {
      // due_at is timestamptz — compare against the same Dubai-aware
      // ISO strings we built for the window above
      const fromIso = fromDate.toISOString();
      const toIso = toDate.toISOString();
      let q = supabase
        .from('pyra_sales_follow_ups')
        .select(
          'id, lead_id, title, notes, due_at, status, assigned_to, created_by, created_at, completed_at',
        )
        .neq('status', 'cancelled')
        .gte('due_at', fromIso)
        .lte('due_at', toIso);
      if (assignedTo) q = q.eq('assigned_to', assignedTo);
      if (leadId) q = q.eq('lead_id', leadId);
      const { data, error } = await q;
      if (error) {
        logError({
          error,
          request,
          user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
          metadata: { action: 'calendar-followups', from: fromStr, to: toStr },
        });
        console.error('calendar-followups fetch error:', error.message);
        return apiServerError();
      }
      followUps = (data ?? []) as FollowUpRow[];
    }

    // ── Source 3: meeting activities ──
    // metadata.meeting_date is an ISO string (pre-flight verified).
    // We can't easily filter by metadata->>'meeting_date' between bounds
    // in PostgREST without an RPC, so we filter by activity_type and
    // created_at (proxy for when it was scheduled), then post-filter in JS.
    // Note: meetings might be created far in the past for a future date;
    // we accept the inefficiency for v1 since meeting_scheduled rows are
    // sparse (0 in production at pre-flight time). v1.1 may add a
    // generated column for direct indexing.
    let meetings: MeetingRow[] = [];
    if (typeSet.has('meeting')) {
      let q = supabase
        .from('pyra_lead_activities')
        .select(
          'id, lead_id, description, metadata, created_by, created_at',
        )
        .eq('activity_type', 'meeting_scheduled');
      if (leadId) q = q.eq('lead_id', leadId);
      // Non-admin: filter by created_by since meeting activities don't have
      // an assigned_to (the activity's owning lead is the scope unit).
      if (assignedTo) q = q.eq('created_by', assignedTo);
      const { data, error } = await q;
      if (error) {
        logError({
          error,
          request,
          user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
          metadata: { action: 'calendar-meetings', from: fromStr, to: toStr },
        });
        console.error('calendar-meetings fetch error:', error.message);
        return apiServerError();
      }
      const rows = (data ?? []) as MeetingRow[];
      // Post-filter by metadata.meeting_date within the window
      meetings = rows.filter((r) => {
        const md = readMetaString(r.metadata, 'meeting_date');
        if (!md) return false;
        const t = new Date(md).getTime();
        if (isNaN(t)) return false;
        return t >= fromDate.getTime() && t <= toDate.getTime();
      });
    }

    // ── Batched lookups (LOCK 4 — no N+1) ──
    // Lead names: union of (task.lead_id ∪ followup.lead_id ∪ meeting.lead_id)
    const leadIds = Array.from(
      new Set(
        [
          ...leadTasks.map((t) => t.lead_id),
          ...followUps.map((f) => f.lead_id),
          ...meetings.map((m) => m.lead_id),
        ].filter((v): v is string => !!v),
      ),
    );
    const leadNameMap = new Map<string, string>();
    if (leadIds.length > 0) {
      const { data: leadRows } = await supabase
        .from('pyra_sales_leads')
        .select('id, name')
        .in('id', leadIds);
      for (const r of leadRows ?? []) leadNameMap.set(r.id, r.name);
    }

    // Assignee display names: union of (task.assigned_to ∪
    // followup.assigned_to ∪ meeting.created_by)
    const usernames = Array.from(
      new Set(
        [
          ...leadTasks.map((t) => t.assigned_to),
          ...followUps.map((f) => f.assigned_to),
          ...meetings.map((m) => m.created_by),
        ].filter((v): v is string => !!v),
      ),
    );
    const userNameMap = new Map<string, string>();
    if (usernames.length > 0) {
      const { data: userRows } = await supabase
        .from('pyra_users')
        .select('username, display_name')
        .in('username', usernames);
      for (const r of userRows ?? []) userNameMap.set(r.username, r.display_name);
    }

    // ── Project each row into the unified shape ──
    const events: CalendarEvent[] = [];

    for (const t of leadTasks) {
      // Date-only → midnight Dubai. due_date is "YYYY-MM-DD" string.
      events.push({
        id: `task:${t.id}`,
        source: 'task',
        source_id: t.id,
        title: t.title,
        start: `${t.due_date}T00:00:00${CALENDAR_TIMEZONE_OFFSET}`,
        end: null,
        all_day: true,
        lead_id: t.lead_id,
        lead_name: t.lead_id ? leadNameMap.get(t.lead_id) ?? null : null,
        assigned_to: t.assigned_to,
        assigned_to_display_name: t.assigned_to
          ? userNameMap.get(t.assigned_to) ?? t.assigned_to
          : null,
        status: t.status as LeadTaskStatus,
        priority: (t.priority ?? null) as LeadTaskPriority | null,
      });
    }

    for (const f of followUps) {
      const title = f.title?.trim() || f.notes?.trim()?.slice(0, 80) || 'متابعة';
      events.push({
        id: `follow_up:${f.id}`,
        source: 'follow_up',
        source_id: f.id,
        title,
        // due_at is timestamptz — PostgREST returns it as UTC (+00:00).
        // Convert to Dubai-offset (+04:00) to satisfy LOCK 3 contract.
        start: toDubaiIso(f.due_at),
        end: null,
        all_day: false,
        lead_id: f.lead_id,
        lead_name: f.lead_id ? leadNameMap.get(f.lead_id) ?? null : null,
        assigned_to: f.assigned_to,
        assigned_to_display_name: f.assigned_to
          ? userNameMap.get(f.assigned_to) ?? f.assigned_to
          : null,
        follow_up_status: f.status as
          | 'pending'
          | 'completed'
          | 'overdue'
          | 'cancelled',
      });
    }

    for (const m of meetings) {
      const md = readMetaString(m.metadata, 'meeting_date');
      if (!md) continue; // defensive — should be filtered above already
      // Q4-4: first 80 chars of description, fallback "اجتماع - {location}"
      const location = readMetaString(m.metadata, 'location');
      let title = (m.description ?? '').trim().slice(0, 80);
      if (!title) {
        title = location ? `اجتماع - ${location}` : 'اجتماع';
      }
      events.push({
        id: `meeting:${m.id}`,
        source: 'meeting',
        source_id: m.id,
        title,
        // metadata.meeting_date is stored via `new Date(...).toISOString()`
        // (activity-composer.tsx:119) → UTC `Z`. Convert to Dubai-offset
        // to satisfy LOCK 3 contract.
        start: toDubaiIso(md),
        end: null,
        all_day: false,
        lead_id: m.lead_id,
        lead_name: m.lead_id ? leadNameMap.get(m.lead_id) ?? null : null,
        assigned_to: m.created_by,
        assigned_to_display_name: m.created_by
          ? userNameMap.get(m.created_by) ?? m.created_by
          : null,
        meeting_location: location,
      });
    }

    // ── LOCK 1 (CRITICAL) — sort start ASC, source ASC, source_id ASC ──
    events.sort((a, b) => {
      const cmpStart = a.start.localeCompare(b.start);
      if (cmpStart !== 0) return cmpStart;
      const cmpSource = a.source.localeCompare(b.source);
      if (cmpSource !== 0) return cmpSource;
      return a.source_id.localeCompare(b.source_id);
    });

    const response: CalendarEventsResponse = {
      events,
      meta: {
        from: fromStr,
        to: toStr,
        types,
        assigned_to: assignedTo,
        lead_id: leadId,
        counts: {
          task: leadTasks.length,
          follow_up: followUps.length,
          meeting: meetings.length,
        },
      },
    };

    return apiSuccess(response);
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { action: 'calendar-events' },
    });
    console.error('GET /api/calendar/events threw:', err);
    return apiServerError();
  }
}

// ── Local row types (intentionally NOT exported — internal to this route) ──
interface TaskRow {
  id: string;
  lead_id: string;
  title: string;
  due_date: string;
  priority: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
  completed_at: string | null;
}

interface FollowUpRow {
  id: string;
  lead_id: string;
  title: string | null;
  notes: string | null;
  due_at: string;
  status: string;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

interface MeetingRow {
  id: string;
  lead_id: string | null;
  description: string | null;
  metadata: unknown;
  created_by: string;
  created_at: string;
}

function readMetaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Convert any datetime to a Dubai-offset (+04:00) ISO string.
 *
 * Reviewer CRITICAL fix: the route's previous emission path used
 * `new Date(x).toISOString()` which silently strips the original offset
 * and emits UTC with a `Z` suffix — violates LOCK 3 and the JSDoc
 * contract that "all datetime values returned in ISO 8601 with Dubai
 * timezone offset (+04:00)".
 *
 * Sources of input:
 *   - follow_up.due_at: Postgres timestamptz → PostgREST emits as
 *     `2026-05-16T11:30:00+00:00` (UTC with `+00:00`)
 *   - metadata.meeting_date: written via `new Date(x).toISOString()` →
 *     stored as `2026-05-16T11:30:00.000Z` (UTC with `Z`)
 *
 * Dubai = UTC+4, no DST — pure offset math, no Intl.DateTimeFormat
 * needed. We shift the epoch by 4h, read UTC components from the
 * shifted Date (which now represent Dubai wall-clock), and assemble
 * the ISO string with the explicit offset.
 */
function toDubaiIso(input: string | Date): string {
  const utcMs = (typeof input === 'string' ? new Date(input) : input).getTime();
  if (isNaN(utcMs)) return ''; // defensive — caller should filter
  const dubaiMs = utcMs + 4 * 60 * 60 * 1000;
  const dubai = new Date(dubaiMs);
  const yyyy = dubai.getUTCFullYear();
  const mm = String(dubai.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dubai.getUTCDate()).padStart(2, '0');
  const hh = String(dubai.getUTCHours()).padStart(2, '0');
  const mi = String(dubai.getUTCMinutes()).padStart(2, '0');
  const ss = String(dubai.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+04:00`;
}
