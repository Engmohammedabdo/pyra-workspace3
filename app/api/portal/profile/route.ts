import { NextRequest } from 'next/server';
import { getPortalSession, CLIENT_SAFE_FIELDS } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';

/**
 * GET /api/portal/profile
 *
 * Return the current authenticated client data (safe fields only).
 */
export async function GET() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();

    const { data: clientData, error } = await supabase
      .from('pyra_clients')
      .select(CLIENT_SAFE_FIELDS)
      .eq('id', client.id)
      .single();

    if (error || !clientData) {
      console.error('GET /api/portal/profile — query error:', error);
      return apiServerError();
    }

    return apiSuccess(clientData);
  } catch (err) {
    console.error('GET /api/portal/profile error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/portal/profile
 *
 * Update client profile fields.
 * Body: { name?: string, email?: string, phone?: string }
 *
 * NOTE: `company` is intentionally NOT editable by clients.
 * Allowing company changes would break data isolation (projects are scoped by company).
 *
 * If email changes, also updates the Supabase Auth user email.
 */
export async function PATCH(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();
    const body = await request.json();
    const { name, email, phone } = body;

    // ── Build update object ───────────────────────────
    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!name.trim()) {
        return apiValidationError('الاسم مطلوب');
      }
      updates.name = name.trim();
    }

    if (phone !== undefined) {
      updates.phone = phone?.trim() || null;
    }

    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();

      if (!normalizedEmail) {
        return apiValidationError('البريد الإلكتروني مطلوب');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return apiValidationError('صيغة البريد الإلكتروني غير صحيحة');
      }

      // Check uniqueness (only if changing)
      if (normalizedEmail !== client.email) {
        const { data: existing } = await supabase
          .from('pyra_clients')
          .select('id')
          .eq('email', normalizedEmail)
          .neq('id', client.id)
          .maybeSingle();

        if (existing) {
          return apiValidationError('البريد الإلكتروني مستخدم بالفعل');
        }

        updates.email = normalizedEmail;

        // Also update Supabase Auth user email
        const { data: fullClient } = await supabase
          .from('pyra_clients')
          .select('auth_user_id')
          .eq('id', client.id)
          .single();

        if (fullClient?.auth_user_id) {
          const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
            fullClient.auth_user_id,
            { email: normalizedEmail }
          );

          if (authUpdateError) {
            console.error('PATCH /api/portal/profile — auth email update error:', authUpdateError);
            return apiServerError('فشل تحديث البريد الإلكتروني');
          }
        }
      }
    }

    // Nothing to update
    if (Object.keys(updates).length === 0) {
      return apiValidationError('لا توجد بيانات للتحديث');
    }

    // ── Perform update ────────────────────────────────
    const { error: updateError } = await supabase
      .from('pyra_clients')
      .update(updates)
      .eq('id', client.id);

    if (updateError) {
      console.error('PATCH /api/portal/profile — update error:', updateError);
      return apiServerError();
    }

    // ── Return updated data ───────────────────────────
    const { data: updatedClient } = await supabase
      .from('pyra_clients')
      .select(CLIENT_SAFE_FIELDS)
      .eq('id', client.id)
      .single();

    return apiSuccess(updatedClient);
  } catch (err) {
    console.error('PATCH /api/portal/profile error:', err);
    return apiServerError();
  }
}
