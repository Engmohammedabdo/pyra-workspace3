import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
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
import { PASSWORD_MIN_LENGTH } from '@/lib/constants/auth';
import { logError } from '@/lib/observability/log-error';

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

// Phase 14.3 P1 fix #3 — removed local shadow constant (=6) in favor
// of the canonical PASSWORD_MIN_LENGTH (currently 8). Reviewer
// caught this site outside the audit's listed 7 surfaces. The CRM
// convert-to-customer flow was accepting 6-char passwords while
// every other portal-account-creation path now requires 8.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Phase 14.1 Commit 2 — hoisted for catch-block logError. `leadId` is
  // populated after params resolves; null until then. `authForLogging`
  // captures the admin who initiated the conversion.
  const t = await getTranslations('api');
  let authForLogging: ApiAuthResult | null = null;
  let leadIdForLogging: string | null = null;
  try {
    // Permission gate — admin override only.
    const auth = await requireApiPermission('leads.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id: leadId } = await params;
    leadIdForLogging = leadId;
    const supabase = createServiceRoleClient();

    // ── State: load the lead ──
    const { data: lead, error: leadError } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, email, phone, company, stage_id, is_converted, client_id, assigned_to, deal_type')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) {
      logError({
        error: leadError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, action: 'convert-to-customer', stage: 'lead_lookup' },
      });
      console.error('convert-to-customer: lead lookup error:', leadError);
      return apiServerError();
    }
    if (!lead) return apiNotFound(t('crm.prospectNotFound'));

    // Scope (defense-in-depth on top of leads.manage): a non-admin holder of
    // leads.manage may only convert leads assigned to them — mirrors
    // canAccessLead so this cross-entity mutation can't act on another agent's
    // lead that the actor can't even view in the scoped list/detail endpoints.
    if (auth.pyraUser.role !== 'admin' && lead.assigned_to !== auth.pyraUser.username) {
      return apiError(t('crm.prospectOwnOnly'), 403);
    }

    // ── State: must be approved closed_won ──
    if (
      lead.stage_id !== PIPELINE_STAGE_IDS.CLOSED_WON ||
      lead.is_converted !== true
    ) {
      return apiValidationError(t('crm.mustBeWonAndApproved'));
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
    if (!body) return apiValidationError(t('common.jsonBodyRequired'));

    const email = body.email?.trim().toLowerCase() || '';
    if (!email) return apiValidationError(t('crm.emailRequired'));

    const createPortalAccess = body.create_portal_access === true;
    const password = body.password?.trim() || '';
    if (createPortalAccess && password.length < PASSWORD_MIN_LENGTH) {
      return apiValidationError(t('crm.passwordMinRequired', { min: PASSWORD_MIN_LENGTH }));
    }

    const contactName = body.primary_contact_name?.trim() || lead.name;

    // ── Duplicate email check ──
    const { data: dup } = await supabase
      .from('pyra_clients')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (dup) return apiError(t('crm.emailAlreadyRegistered'), 409);

    // ── Optionally create Supabase Auth user ──
    let authUserId: string | null = null;
    if (createPortalAccess) {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'client',
          company: lead.company || contactName,
          display_name: contactName,
        },
      });
      if (authError) {
        console.error('convert-to-customer: auth.admin.createUser error:', authError.message);
        if (authError.message.includes('already') && authError.message.includes('register')) {
          return apiError(t('crm.emailAlreadyRegisteredAuth'), 409);
        }
        return apiError(t('crm.accountCreateFailed', { reason: authError.message }), 422);
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
        // pyra_clients.company is NOT NULL, but a B2C lead can have a null
        // company — coalesce to the contact/lead name so company-less leads
        // still convert instead of hitting a NOT NULL violation → 500.
        company: lead.company || contactName,
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
      return apiError(t('crm.clientRecordCreateFailed'), 500);
    }

    // ── UPDATE lead.client_id ──
    const { error: linkError } = await supabase
      .from('pyra_sales_leads')
      .update({ client_id: newClientId, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (linkError) {
      console.error('convert-to-customer: lead.client_id update error:', linkError.message);
      logError({
        error: linkError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, client_id: newClientId, action: 'convert-to-customer', stage: 'lead_link' },
      });
      // Fatal — roll back the just-created client row (+ Auth user) so the lead
      // is NOT left in a stuck state. If we left the client while the lead
      // stayed unlinked, the idempotency short-circuit (needs lead.client_id)
      // would be skipped on retry and the duplicate-email check would 409 on
      // the client we just made — conversion would be permanently impossible
      // via the UI. Rolling back lets a retry succeed cleanly.
      const { error: rbErr } = await supabase
        .from('pyra_clients')
        .delete()
        .eq('id', newClientId);
      if (rbErr) {
        console.error('convert-to-customer: rollback pyra_clients delete error:', rbErr.message);
      }
      if (authUserId) {
        await supabase.auth.admin.deleteUser(authUserId).catch((e) =>
          console.error('convert-to-customer: rollback auth.admin.deleteUser error:', e),
        );
      }
      return apiError(t('crm.clientLinkFailed'), 500);
    }

    // ── Back-fill client_id onto the lead's lead-phase quotes ──
    // Lead-phase quotes are created with client_id=null + lead_id set. The portal
    // reads quotes strictly by client_id, so without this back-fill a signed quote
    // stays invisible in the new customer's portal. Best-effort — a failure here
    // must not undo an otherwise-successful conversion.
    supabase
      .from('pyra_quotes')
      .update({ client_id: newClientId })
      .eq('lead_id', leadId)
      .is('client_id', null)
      .then(({ error: e }) => {
        if (e) console.error('[convert: quote client_id back-fill] failed:', e.message);
      });

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
          ? 'تم تحويل العميل المحتمل إلى عميل دائم مع حساب بورتال' // i18n-exempt: DB data
          : 'تم تحويل العميل المحتمل إلى عميل دائم', // i18n-exempt: DB data
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
        title: 'تم تحويل العميل إلى عميل دائم', // i18n-exempt: notification content (Phase 8)
        // i18n hazard fix (census): the original was an Arabic word-stem
        // splice (`مع${... ? ' حساب بورتال' : 'ون حساب بورتال'}`) that // i18n-exempt: doc comment
        // concatenated onto «مع» to build a mangled «معون…» (pre-existing // i18n-exempt: doc comment
        // typo, likely intended «بدون»). Replaced with two complete, // i18n-exempt: doc comment
        // grammatically-correct Arabic strings via a proper ternary —
        // untranslatable string-splicing no longer needed once each
        // branch is whole. Still exempt as notification content (Phase 8).
        message: createPortalAccess
          ? `${lead.name} أصبح عميلاً مع حساب بورتال` // i18n-exempt: notification content (Phase 8)
          : `${lead.name} أصبح عميلاً بدون حساب بورتال`, // i18n-exempt: notification content (Phase 8)
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
    // Phase 14.1 Commit 2 — state-change failure with multi-row writes is
    // hard to recover. Capture full context for triage.
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { lead_id: leadIdForLogging, action: 'convert-to-customer' },
    });
    console.error('POST /api/crm/leads/[id]/convert-to-customer threw:', err);
    return apiServerError();
  }
}
