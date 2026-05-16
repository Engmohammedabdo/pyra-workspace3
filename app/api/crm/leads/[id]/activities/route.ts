import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { notifyMany } from '@/lib/notifications/notify';
import { extractMentions } from '@/lib/utils/mentions';

/**
 * GET /api/crm/leads/[id]/activities
 *
 * Permission: lead_activities.view
 * Scope: canAccessLead.
 *
 * Cursor pagination per Q-UI-002:
 *   - limit: default 50, max 200
 *   - before: ISO timestamp — return only rows with created_at < before
 *
 * Optional filter:
 *   - type: a single LeadActivityType value
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('lead_activities.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, id);
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    const sp = request.nextUrl.searchParams;
    const limitParam = parseInt(sp.get('limit') || '50', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200);
    const before = sp.get('before')?.trim() || null;
    const typeFilter = sp.get('type')?.trim() || null;

    let q = supabase
      .from('pyra_lead_activities')
      .select('id, lead_id, activity_type, description, metadata, created_by, created_at')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (typeFilter) q = q.eq('activity_type', typeFilter);
    if (before) q = q.lt('created_at', before);

    const { data, error } = await q;
    if (error) {
      console.error('GET /api/crm/leads/[id]/activities error:', error.message);
      return apiServerError();
    }

    const rows = data ?? [];

    // Enrich with creator display name (one batched lookup).
    let enriched: typeof rows | (typeof rows[number] & { created_by_display_name?: string })[] = rows;
    const creatorUsernames = Array.from(new Set(rows.map((r) => r.created_by).filter((u): u is string => !!u)));
    if (creatorUsernames.length > 0) {
      const { data: users } = await supabase
        .from('pyra_users')
        .select('username, display_name')
        .in('username', creatorUsernames);
      const nameMap = new Map<string, string>();
      for (const u of users ?? []) nameMap.set(u.username, u.display_name);
      enriched = rows.map((r) => ({
        ...r,
        created_by_display_name: r.created_by ? nameMap.get(r.created_by) ?? r.created_by : null,
      }));
    }

    return apiSuccess({
      activities: enriched,
      has_more: rows.length === limit,
    });
  } catch (err) {
    console.error('GET /api/crm/leads/[id]/activities threw:', err);
    return apiServerError();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/crm/leads/[id]/activities
//
// Permission: lead_activities.create + canAccessLead.
//
// Body:
//   activity_type — one of MANUAL_TYPES below
//   content       — string (becomes pyra_lead_activities.description)
//   metadata?     — free-form jsonb (e.g. { duration_minutes, direction,
//                    meeting_date, location, subject, to, pinned })
//
// System types (whatsapp_inbound, stage_change, lead_created, etc.) are
// produced server-side ONLY — clients can't post them. We allow ONLY:
//   note, call_logged, meeting_scheduled, email_sent.
//
// Side effects: also bumps lead.last_contact_at to now() so subsequent
// idle-warning checks (Phase 11 cron) reflect the human touch.
// ────────────────────────────────────────────────────────────────────────────

const MANUAL_TYPES = new Set(['note', 'call_logged', 'meeting_scheduled', 'email_sent']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('lead_activities.create');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, id);
    if (!allowed) return apiForbidden('لا تملك صلاحية إضافة نشاط لهذا الـ Lead');

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiValidationError('JSON body مطلوب');

    const activityType = typeof body.activity_type === 'string' ? body.activity_type : '';
    if (!MANUAL_TYPES.has(activityType)) {
      return apiValidationError('نوع النشاط غير مسموح — اختر: ملاحظة / مكالمة / اجتماع / إيميل');
    }

    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) return apiValidationError('المحتوى مطلوب');

    const incomingMetadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};
    const metadata: Record<string, unknown> = { ...incomingMetadata };
    if (body.pinned === true) metadata.pinned = true;

    const insertId = generateId('la');
    const { data: activity, error } = await supabase
      .from('pyra_lead_activities')
      .insert({
        id: insertId,
        lead_id: id,
        activity_type: activityType,
        description: content,
        metadata,
        created_by: auth.pyraUser.username,
      })
      .select('*')
      .single();

    if (error || !activity) {
      console.error('POST /api/crm/leads/[id]/activities insert error:', error?.message);
      return apiServerError(`فشل تسجيل النشاط${error?.message ? ': ' + error.message : ''}`);
    }

    // Bump last_contact_at — every manual activity is a touchpoint.
    // .then() required: Supabase query builder is lazy; bare `void <builder>`
    // never triggers execution.
    void supabase
      .from('pyra_sales_leads')
      .update({ last_contact_at: new Date().toISOString() })
      .eq('id', id)
      .then(({ error: e }) => {
        if (e) console.error('[lead last_contact_at update] failed:', e.message);
      });

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `lead_activity_${ACTIVITY_ACTIONS.CREATE}`,
      `/dashboard/crm/leads/${id}`,
      { lead_id: id, activity_id: insertId, activity_type: activityType },
      request.headers.get('x-forwarded-for') || undefined,
    );

    // Phase 15.1 Commit 1 — @-mention fan-out. Fire-and-forget so the
    // activity insert response is never blocked by notification work.
    // Uses the central notifyMany() helper (NOT raw INSERT — Phase 11
    // v1.1 violation explicitly not replicated). Self-exclusion +
    // dedup are handled inside notifyMany.
    //
    // Resolution flow:
    //   1. Extract raw @-tokens from `content` via the Arabic-aware
    //      MENTION_REGEX in lib/utils/mentions.tsx
    //   2. Build a lowercase `display_name | username → username` map
    //      from the admin + sales_agent pool (matches the membership
    //      semantic of /api/dashboard/leads/[id]/members)
    //   3. Resolve each raw token, exclude the actor, dedup via Set
    //   4. Single notifyMany() call writes all rows at once
    //
    // Link includes `?tab=activity&highlight=<id>` so the recipient
    // lands on the activity tab + the matched row scrolls into view
    // with a flash. See lead-detail-client.tsx + lead-activity-tab.tsx
    // for the receiving handler.
    void (async () => {
      try {
        const rawMentions = extractMentions(content);
        if (rawMentions.length === 0) return;

        const { data: pool } = await supabase
          .from('pyra_users')
          .select('username, display_name')
          .in('role', ['admin', 'sales_agent']);

        const nameMap = new Map<string, string>();
        for (const u of pool ?? []) {
          if (u.username) nameMap.set(u.username.toLowerCase(), u.username);
          if (u.display_name) nameMap.set(u.display_name.toLowerCase(), u.username);
        }

        const mentioned = new Set<string>();
        for (const raw of rawMentions) {
          const uname = nameMap.get(raw.toLowerCase());
          if (uname && uname !== auth.pyraUser.username) mentioned.add(uname);
        }

        if (mentioned.size === 0) return;

        await notifyMany(supabase, Array.from(mentioned), {
          type: 'mention',
          title: 'تم ذكرك في نشاط Lead',
          message: `${auth.pyraUser.display_name} ذكرك في نشاط على عميل محتمل`,
          link: `/dashboard/crm/leads/${id}?tab=activity&highlight=${insertId}`,
          entity: { type: 'lead_activity', id: insertId },
          from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
        });
      } catch (mentionErr) {
        console.error('[lead activity mention fan-out] failed:', mentionErr);
      }
    })();

    return apiSuccess({ activity }, undefined, 201);
  } catch (err) {
    console.error('POST /api/crm/leads/[id]/activities threw:', err);
    return apiServerError();
  }
}
