import { NextRequest } from 'next/server';
import { getPortalSession, destroyPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';

/**
 * POST /api/portal/auth/logout
 *
 * Destroy the portal session cookie and remove the session record.
 */
export async function POST(request: NextRequest) {
  try {
    // Capture client info BEFORE destroying session
    const client = await getPortalSession();

    await destroyPortalSession();

    // ── Log logout activity (non-critical) ──────────
    if (client) {
      const supabase = createServiceRoleClient();
      void supabase.from('pyra_activity_log').insert({
        id: generateId('al'),
        action_type: 'portal_logout',
        username: client.email || client.name,
        display_name: client.name || client.company,
        target_path: `/portal`,
        details: {
          client_id: client.id,
          client_company: client.company,
          portal_client: true,
        },
        ip_address: request.headers.get('x-forwarded-for') || 'unknown',
      }).then(({ error: logErr }) => {
        if (logErr) console.error('[activity-log] insert error:', logErr.message);
      });
    }

    return apiSuccess({
      authenticated: false,
      message: 'تم تسجيل الخروج بنجاح',
    });
  } catch (err) {
    console.error('POST /api/portal/auth/logout error:', err);
    return apiServerError();
  }
}
