import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { DEFAULT_BRANDING } from '@/lib/portal/branding';

const BRANDING_FIELDS =
  'primary_color, secondary_color, logo_url, favicon_url, company_name_display, login_background_url';

/**
 * GET /api/portal/branding
 * Get branding for the authenticated portal client.
 */
export async function GET(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_client_branding')
      .select(BRANDING_FIELDS)
      .eq('client_id', client.id)
      .maybeSingle();

    if (error) {
      console.error('Portal branding fetch error:', error);
      return apiServerError();
    }

    return apiSuccess(data || DEFAULT_BRANDING);
  } catch (err) {
    console.error('GET /api/portal/branding error:', err);
    return apiServerError();
  }
}
