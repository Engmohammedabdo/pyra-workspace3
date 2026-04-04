import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from('pyra_announcement_reads')
      .upsert({
        announcement_id: id,
        username: auth.pyraUser.username,
        read_at: new Date().toISOString(),
      }, { onConflict: 'announcement_id,username' });

    if (error) return apiServerError(error.message);
    return apiSuccess({ marked: true });

  } catch (err) {
    console.error('[POST /api/announcements/[id]/read] error:', err);
    return apiServerError();
  }
}
