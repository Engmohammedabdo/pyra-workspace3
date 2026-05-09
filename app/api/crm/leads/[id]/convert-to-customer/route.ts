import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiError,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { notify } from '@/lib/notifications/notify';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/crm/leads/[id]/convert-to-customer
//
// Permission:  leads.manage  (admin override only — sales agents 403)
//
// State checks (in order):
//   1. Lead exists                              → 404
//   2. lead.stage_id = stg_closed_won
//      AND lead.is_converted = true             → 422 if either fails
//   3. Idempotency: if lead.client_id exists,
//      return that client (200, created: false) — no side effects
//   4. body.create_portal_access = true
//      AND no body.password                     → 422
//   5. Email already in pyra_clients?           → 409
//
// Side effects (sequential, with manual rollback on failure):
//   - Optional: create Supabase Auth user (only when create_portal_access)
//   - INSERT pyra_clients row mapped from lead + body
//   - UPDATE pyra_sales_leads.client_id
//   - logActivity → field_updated
//   - notify(lead.assigned_to, 'lead_converted_to_customer') — if not actor
//
// Response:
//   { ok: true, data: { client, lead_id, created: boolean } }
//
// PRD-DEVIATION: §03 line 368 calls for an automated portal welcome email
// "(use existing template)". No such template/sender infrastructure exists
// in the workspace today — only WelcomeBanner (UI) and a portal_welcome_message
// settings string. This v1 matches the existing /api/clients POST pattern:
// admin sets the password in the request body and shares credentials with
// the client out-of-band. Welcome email automation deferred to v1.1.
// ────────────────────────────────────────────────────────────────────────────

interface ConvertBody {
  email?: string;
  password?: string;
  create_portal_access?: boolean;
  primary_contact_name?: string;
}

const PORTAL_PASSWORD_MIN_LENGTH = 6;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Permission gate — admin override only.
    const auth = await requireApiPermission('leads.manage');
    if (isApiError(auth)) return auth;

    const { id: leadId } = await params;
    const supabase = createServiceRoleClient();

    // ── State: load the lead ──
    const { data: lead, error: leadError } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, email, phone, company, stage_id, is_converted, client_id, assigned_to, deal_type')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) {
      console.error('convert-to-customer: lead lookup error:', leadError);
      return apiServerError();
    }
    if (!lead) return apiNotFound('العميل المحتمل غير موجود');

    // ── State: must be approved closed_won ──
    if (
      lead.stage_id !== PIPELINE_STAGE_IDS.CLOSED_WON ||
      lead.is_converted !== true
    ) {
      return apiValidationError(
        'العميل المحتمل يجب أن يكون فائز ومُعتمد قبل التحويل لعميل',
      );
    }

    // ── Idempotent: already has a client_id, return that client ──
    if (lead.client_id) {
      const { data: existingClient } = await supabase
        .from('pyra_clients')
        .select('id, name, email, phone, company, portal_active, auth_user_id, created_at')
        .eq('id', lead.client_id)
        .maybeSingle();
      if (existingClient) {
        return apiSuccess({
          client: existingClient,
          lead_id: leadId,
          created: false,
        });
      }
      // Fall through if client_id is set but row missing — treat as create.
    }

    // ── Body validation ──
    const body = (await request.json().catch(() => null)) as ConvertBody | null;
    if (!body) return apiValidationError('JSON body مطلوب');

    const email = body.email?.trim().toLowerCase() || '';
    if (!email) return apiValidationError('البريد الإلكتروني مطلوب');

    const createPortalAccess = body.create_portal_access === true;
    const password = body.password?.trim() || '';
    if (createPortalAccess && password.length < PORTAL_PASSWORD_MIN_LENGTH) {
      return apiValidationError(
        `كلمة المرور مطلوبة (${PORTAL_PASSWORD_MIN_LENGTH} أحرف على الأقل) لإنشاء حساب البورتال`,
      );
    }

    const contactName = body.primary_contact_name?.trim() || lead.name;

    // ── Duplicate email check ──
    const { data: dup } = await supabase
      .from('pyra_clients')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (dup) return apiError('البريد الإلكتروني مسجل مسبقاً', 409);

    // ── Optionally create Supabase Auth user ──
    let authUserId: string | null = null;
    if (createPortalAccess) {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'client',
          company: lead.company,
          display_name: contactName,
        },
      });
      if (authError) {
        console.error('convert-to-customer: auth.admin.createUser error:', authError.message);
        if (authError.message.includes('already') && authError.message.includes('register')) {
          return apiError('البريد الإلكتروني مسجل مسبقاً في نظام المصادقة', 409);
        }
        return apiError(`فشل إنشاء الحساب: ${authError.message}`, 422);
      }
      authUserId = authUser.user?.id ?? null;
    }

    // ── INSERT pyra_clients row ──
    const newClientId = generateId('cl');
    const { data: newClient, error: insertError } = await supabase
      .from('pyra_clients')
      .insert({
        id: newClientId,
        name: contactName,
        email,
        phone: lead.phone || null,
        company: lead.company,
        // Lead has no `address` column — leave as null. Future v1.1 may
        // accept address in convert-to-customer body or sync from a
        // first invoice's billing address.
        address: null,
        source: 'crm_conversion',
        role: 'client',
        is_active: true,
        portal_active: createPortalAccess,
        auth_user_id: authUserId,
        password_hash: '', // Supabase Auth owns auth; column is legacy.
        created_by: auth.pyraUser.username,
      })
      .select('id, name, email, phone, company, portal_active, auth_user_id, created_at')
      .maybeSingle();

    if (insertError || !newClient) {
      console.error('convert-to-customer: pyra_clients insert error:', insertError?.message);
      // Rollback Auth user if it was created — orphaned auth user is worse
      // than a failed conversion that the admin can retry.
      if (authUserId) {
        await supabase.auth.admin.deleteUser(authUserId).catch((e) =>
          console.error('convert-to-customer: rollback auth.admin.deleteUser error:', e),
        );
      }
      return apiError('فشل إنشاء سجل العميل', 500);
    }

    // ── UPDATE lead.client_id ──
    const { error: linkError } = await supabase
      .from('pyra_sales_leads')
      .update({ client_id: newClientId, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (linkError) {
      console.error('convert-to-customer: lead.client_id update error:', linkError.message);
      // Soft-warn — client was created but lead link failed. Not fatal;
      // admin can re-trigger and idempotency will return the existing client.
    }

    // ── Lead timeline activity (visible in activity tab) ──
    // Direct insert into pyra_lead_activities (matches move-stage pattern).
    // The .then() is required — Supabase query builder is lazy thenable;
    // without it the insert silently no-ops (per CLAUDE.md / MEMORY.md note).
    supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'field_updated',
        description: createPortalAccess
          ? 'تم تحويل العميل المحتمل إلى عميل دائم مع حساب بورتال'
          : 'تم تحويل العميل المحتمل إلى عميل دائم',
        metadata: {
          client_id_set: true,
          client_id: newClientId,
          portal_active: createPortalAccess,
        },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[convert-to-customer activity] insert failed:', e.message);
      });

    // ── System audit log (fire-and-forget) ──
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `lead_${ACTIVITY_ACTIONS.UPDATE}_convert`,
      `/dashboard/crm/customers/${leadId}`,
      {
        lead_id: leadId,
        client_id: newClientId,
        portal_active: createPortalAccess,
      },
      request.headers.get('x-forwarded-for') || undefined,
    );

    // ── Notification: tell the lead's assigned_to (if not the actor) ──
    if (lead.assigned_to) {
      void notify(supabase, {
        to: lead.assigned_to,
        type: 'lead_converted_to_customer',
        title: 'تم تحويل العميل إلى عميل دائم',
        message: `${lead.name} أصبح عميلاً مع${createPortalAccess ? ' حساب بورتال' : 'ون حساب بورتال'}`,
        link: `/dashboard/crm/customers/${leadId}`,
        entity: { type: 'lead', id: leadId },
        from: { username: auth.pyraUser.username },
      });
    }

    return apiSuccess({
      client: newClient,
      lead_id: leadId,
      created: true,
    });
  } catch (err) {
    console.error('POST /api/crm/leads/[id]/convert-to-customer threw:', err);
    return apiServerError();
  }
}
