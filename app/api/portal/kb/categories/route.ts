import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/kb/categories
 * List public KB categories for portal users.
 */
export async function GET() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_kb_categories')
      .select('id, name, slug, description, icon, sort_order')
      .eq('is_public', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('GET /api/portal/kb/categories error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch {
    return apiServerError();
  }
}
