import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

/**
 * GET /api/dashboard/sales/whatsapp/csat
 * List CSAT surveys with filters (agent, date range, rating).
 * Returns average rating, count, distribution.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const { searchParams } = req.nextUrl;
    const agent = searchParams.get('agent');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const rating = searchParams.get('rating');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createServiceRoleClient();

    let query = supabase
      .from('pyra_csat_surveys')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (agent) query = query.eq('agent_username', agent);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    if (rating) query = query.eq('rating', parseInt(rating));

    query = query.range(offset, offset + limit - 1);

    const { data: surveys, count, error } = await query;
    if (error) {
      console.error('[GET /csat] error:', error.message);
      return apiServerError();
    }

    // Calculate aggregate stats from all matching surveys (not just paginated)
    let statsQuery = supabase
      .from('pyra_csat_surveys')
      .select('rating');

    if (agent) statsQuery = statsQuery.eq('agent_username', agent);
    if (from) statsQuery = statsQuery.gte('created_at', from);
    if (to) statsQuery = statsQuery.lte('created_at', to);

    const { data: allRatings } = await statsQuery;
    const ratings = allRatings?.map(r => r.rating).filter(Boolean) || [];
    const average = ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : 0;

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of ratings) {
      if (r >= 1 && r <= 5) distribution[r]++;
    }

    return apiSuccess(surveys, {
      total: count || 0,
      average,
      distribution,
    });
  } catch (err) {
    console.error('[GET /csat] error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/dashboard/sales/whatsapp/csat
 * Create a CSAT survey record (called when agent resolves conversation).
 * Body: { conversation_id, rating, comment? }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    const { conversation_id, rating, comment } = body;

    if (!conversation_id) return apiValidationError('conversation_id مطلوب');
    if (!rating || rating < 1 || rating > 5) return apiValidationError('التقييم يجب أن يكون بين 1 و 5');

    const supabase = createServiceRoleClient();

    // Get conversation details
    const { data: conv, error: convErr } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, contact_phone, contact_name, assigned_to')
      .eq('id', conversation_id)
      .maybeSingle();

    if (convErr || !conv) return apiValidationError('المحادثة غير موجودة');

    // Check if a CSAT already exists for this conversation
    const { data: existing } = await supabase
      .from('pyra_csat_surveys')
      .select('id')
      .eq('conversation_id', conversation_id)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { data: updated, error: updateErr } = await supabase
        .from('pyra_csat_surveys')
        .update({
          rating,
          comment: comment || null,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateErr) {
        console.error('[POST /csat] update error:', updateErr.message);
        return apiServerError();
      }

      // Update conversation csat_rating
      await supabase
        .from('pyra_whatsapp_conversations')
        .update({ csat_rating: rating })
        .eq('id', conversation_id);

      return apiSuccess(updated);
    }

    // Create new CSAT survey
    const csatId = generateId('csat');
    const { data: survey, error } = await supabase
      .from('pyra_csat_surveys')
      .insert({
        id: csatId,
        conversation_id,
        rating,
        comment: comment || null,
        contact_phone: conv.contact_phone || null,
        contact_name: conv.contact_name || null,
        agent_username: conv.assigned_to || null,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /csat] insert error:', error.message);
      return apiServerError();
    }

    // Update conversation csat_rating
    await supabase
      .from('pyra_whatsapp_conversations')
      .update({ csat_rating: rating })
      .eq('id', conversation_id);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'csat_submitted',
      `/dashboard/sales/whatsapp/csat/${csatId}`,
      { conversation_id, rating, agent: conv.assigned_to }
    );

    return apiSuccess(survey);
  } catch (err) {
    console.error('[POST /csat] error:', err);
    return apiServerError();
  }
}
