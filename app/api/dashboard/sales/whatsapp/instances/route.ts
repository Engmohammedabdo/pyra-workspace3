import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { WA_INSTANCE_FIELDS } from '@/lib/supabase/fields';
import { generateId } from '@/lib/utils/id';
import { evolutionClient } from '@/lib/evolution/client';

export async function GET() {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pyra_whatsapp_instances')
    .select(WA_INSTANCE_FIELDS)
    .order('created_at', { ascending: false });

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission('sales_pipeline.manage');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { instance_name, agent_username, phone_number } = body;

  if (!instance_name) return apiError('اسم الـ Instance مطلوب');

  try {
    // Create on Evolution API
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/dashboard/sales/whatsapp/webhook`;
    await evolutionClient.createInstance(instance_name, webhookUrl);
  } catch (err) {
    return apiServerError(`فشل إنشاء Instance على Evolution API: ${err instanceof Error ? err.message : ''}`);
  }

  // Save to database
  const { data, error } = await supabase
    .from('pyra_whatsapp_instances')
    .insert({
      id: generateId('wa'),
      instance_name,
      agent_username: agent_username || null,
      phone_number: phone_number || null,
      status: 'disconnected',
      created_by: auth.pyraUser.username,
    })
    .select(WA_INSTANCE_FIELDS)
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data, undefined, 201);
}
