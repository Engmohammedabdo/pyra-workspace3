import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiValidationError,
  apiError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/settings/agent-whatsapp-settings
//
// Permission: settings.view
// Returns:    list of agent routing rows, enriched with the agent's
//             display_name + the configured sender instance's current
//             status (so the UI can show "pyraai ✅ connected").
//
// Joins (separate queries, mapped client-side — no FK between
// pyra_agent_whatsapp_settings.sender_instance_name and
// pyra_whatsapp_instances by design, per Q-R-2):
//   pyra_users               → agent_display_name
//   pyra_whatsapp_instances  → sender_instance_status,
//                               sender_instance_last_connected_at
// ────────────────────────────────────────────────────────────────────────────

interface SettingRow {
  id: string;
  agent_username: string;
  sender_instance_name: string;
  recipient_phone: string;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    const auth = await requireApiPermission('settings.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_agent_whatsapp_settings')
      .select('id, agent_username, sender_instance_name, recipient_phone, is_active, notes, created_by, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/settings/agent-whatsapp-settings] error:', error.message);
      return apiServerError();
    }

    const rows = (data ?? []) as unknown as SettingRow[];
    if (rows.length === 0) return apiSuccess([]);

    const usernames = Array.from(new Set(rows.map((r) => r.agent_username)));
    const instanceNames = Array.from(new Set(rows.map((r) => r.sender_instance_name)));

    const [usersRes, instancesRes] = await Promise.all([
      supabase.from('pyra_users').select('username, display_name').in('username', usernames),
      supabase
        .from('pyra_whatsapp_instances')
        .select('instance_name, status, last_connected_at')
        .in('instance_name', instanceNames),
    ]);

    const userMap = new Map(
      ((usersRes.data ?? []) as Array<{ username: string; display_name: string }>).map(
        (u) => [u.username, u.display_name],
      ),
    );
    const instanceMap = new Map(
      ((instancesRes.data ?? []) as Array<{ instance_name: string; status: string | null; last_connected_at: string | null }>).map(
        (i) => [i.instance_name, i],
      ),
    );

    const enriched = rows.map((r) => {
      const inst = instanceMap.get(r.sender_instance_name);
      return {
        ...r,
        agent_display_name: userMap.get(r.agent_username) ?? r.agent_username,
        sender_instance_status: inst?.status ?? null,
        sender_instance_last_connected_at: inst?.last_connected_at ?? null,
      };
    });

    return apiSuccess(enriched);
  } catch (err) {
    console.error('GET /api/settings/agent-whatsapp-settings threw:', err);
    return apiServerError();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/settings/agent-whatsapp-settings
//
// Permission: settings.manage
// Body:
//   agent_username        (required, string)
//   sender_instance_name  (required, string — soft-validated; cron
//                           hard-validates at fire time per Q-R-2)
//   recipient_phone       (required, string non-empty — relaxed v1
//                           per Q-R-4)
//   is_active?            (default false per Q-R-3)
//   notes?                (string)
//
// Errors:
//   422 — missing required field(s)
//   422 — unknown agent_username (clean Arabic message instead of
//         letting the FK violation surface as 500)
//   409 — UNIQUE conflict (agent already has a row — Q-R-1 protects)
//
// Race: 2 admins POST for same agent concurrently → UNIQUE constraint
//       ensures only one wins; the loser sees 409 with a hint to use
//       PATCH instead.
//
// Activity log: 'agent_wa_settings_created'
//               details = { id, agent_username, sender_instance_name,
//                           is_active }
// ────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('settings.manage');
    if (isApiError(auth)) return auth;

    const t = await getTranslations('api');
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return apiValidationError(t('common.jsonBodyRequired'));

    const agentUsername =
      typeof body.agent_username === 'string' ? body.agent_username.trim() : '';
    const senderInstanceName =
      typeof body.sender_instance_name === 'string' ? body.sender_instance_name.trim() : '';
    const recipientPhone =
      typeof body.recipient_phone === 'string' ? body.recipient_phone.trim() : '';

    if (!agentUsername || !senderInstanceName || !recipientPhone) {
      return apiValidationError(t('settings.agentUsernameInstancePhoneRequired'));
    }

    const isActive =
      typeof body.is_active === 'boolean' ? body.is_active : false;
    const notes =
      typeof body.notes === 'string' ? body.notes.trim() || null : null;

    const supabase = createServiceRoleClient();

    // Pre-check the agent exists (FK would catch this too, but a clean
    // 422 with the username quoted is friendlier than a 500 from a
    // bubbled-up FK violation message).
    const { data: userRow } = await supabase
      .from('pyra_users')
      .select('username')
      .eq('username', agentUsername)
      .maybeSingle();
    if (!userRow) {
      return apiValidationError(t('settings.agentNotFound', { username: agentUsername }));
    }

    const insertId = generateId('aws');
    const { data, error } = await supabase
      .from('pyra_agent_whatsapp_settings')
      .insert({
        id: insertId,
        agent_username: agentUsername,
        sender_instance_name: senderInstanceName,
        recipient_phone: recipientPhone,
        is_active: isActive,
        notes,
        created_by: auth.pyraUser.username,
      })
      .select('*')
      .single();

    if (error) {
      // Postgres UNIQUE-violation code (23505) → 409 with helpful hint.
      if ((error as { code?: string }).code === '23505') {
        return apiError(t('settings.agentSettingAlreadyExists'), 409);
      }
      console.error('[POST /api/settings/agent-whatsapp-settings] insert error:', error.message);
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'agent_wa_settings_created',
      '/dashboard/settings',
      {
        id: insertId,
        agent_username: agentUsername,
        sender_instance_name: senderInstanceName,
        is_active: isActive,
      },
      req.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess(data, undefined, 201);
  } catch (err) {
    console.error('POST /api/settings/agent-whatsapp-settings threw:', err);
    return apiServerError();
  }
}
