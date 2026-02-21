import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { DEFAULT_BRANDING } from '@/lib/portal/branding';

const BRANDING_FIELDS =
  'primary_color, secondary_color, logo_url, favicon_url, company_name_display, login_background_url';

/**
 * GET /api/clients/[id]/branding
 * Get branding for a specific client (returns defaults if none set).
 * Admin only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_client_branding')
      .select(BRANDING_FIELDS)
      .eq('client_id', id)
      .maybeSingle();

    if (error) {
      console.error('Client branding fetch error:', error);
      return apiServerError();
    }

    return apiSuccess(data || DEFAULT_BRANDING);
  } catch (err) {
    console.error('GET /api/clients/[id]/branding error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/clients/[id]/branding
 * Upsert branding for a specific client.
 * Admin only.
 *
 * Body: { primary_color?, secondary_color?, logo_url?, favicon_url?, company_name_display?, login_background_url? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const body = await request.json();
    const supabase = createServiceRoleClient();

    const fields = {
      primary_color: body.primary_color,
      secondary_color: body.secondary_color,
      logo_url: body.logo_url || null,
      favicon_url: body.favicon_url || null,
      company_name_display: body.company_name_display || null,
      login_background_url: body.login_background_url || null,
      updated_at: new Date().toISOString(),
    };

    // Check if branding record already exists for this client
    const { data: existing } = await supabase
      .from('pyra_client_branding')
      .select('id')
      .eq('client_id', id)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from('pyra_client_branding')
        .update(fields)
        .eq('client_id', id);

      if (updateError) {
        console.error('Client branding update error:', updateError);
        return apiServerError();
      }
    } else {
      const { error: insertError } = await supabase
        .from('pyra_client_branding')
        .insert({
          id: generateId('cb'),
          client_id: id,
          ...fields,
        });

      if (insertError) {
        console.error('Client branding insert error:', insertError);
        return apiServerError();
      }
    }

    // Fetch the updated record to return
    const { data: updated } = await supabase
      .from('pyra_client_branding')
      .select(BRANDING_FIELDS)
      .eq('client_id', id)
      .maybeSingle();

    return apiSuccess(updated || DEFAULT_BRANDING);
  } catch (err) {
    console.error('PATCH /api/clients/[id]/branding error:', err);
    return apiServerError();
  }
}
