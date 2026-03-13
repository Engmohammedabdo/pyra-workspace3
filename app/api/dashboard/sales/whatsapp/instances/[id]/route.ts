import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { WA_INSTANCE_FIELDS } from '@/lib/supabase/fields';
import { evolutionClient } from '@/lib/evolution/client';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_whatsapp_instances')
    .select(WA_INSTANCE_FIELDS)
    .eq('id', id)
    .single();

  if (error || !data) return apiError('Instance غير موجود', 404);

  // Get connection state from Evolution API
  let connectionState = 'unknown';
  let qrCode: string | null = null;
  try {
    const state = await evolutionClient.getConnectionState(data.instance_name);
    connectionState = state.state;

    if (state.state !== 'open') {
      try {
        const qr = await evolutionClient.getQRCode(data.instance_name);
        qrCode = qr.code || null;
      } catch {
        // QR might not be available
      }
    }
  } catch {
    // Instance might not exist on Evolution API
  }

  // Update local status if different
  if (connectionState !== data.status && connectionState !== 'unknown') {
    const statusMap: Record<string, string> = {
      open: 'connected',
      close: 'disconnected',
      connecting: 'pending',
    };
    const newStatus = statusMap[connectionState] || 'disconnected';
    if (newStatus !== data.status) {
      await supabase
        .from('pyra_whatsapp_instances')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);
      data.status = newStatus;
    }
  }

  return apiSuccess({ ...data, qr_code: qrCode, connection_state: connectionState });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireApiPermission('sales_pipeline.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.agent_username !== undefined) updates.agent_username = body.agent_username;
  if (body.phone_number !== undefined) updates.phone_number = body.phone_number;
  if (body.status !== undefined) updates.status = body.status;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('pyra_whatsapp_instances')
    .update(updates)
    .eq('id', id)
    .select(WA_INSTANCE_FIELDS)
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireApiPermission('sales_pipeline.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  // Get instance name first
  const { data: instance } = await supabase
    .from('pyra_whatsapp_instances')
    .select('instance_name')
    .eq('id', id)
    .single();

  if (instance) {
    try {
      await evolutionClient.deleteInstance(instance.instance_name);
    } catch {
      // Ignore if instance doesn't exist on Evolution API
    }
  }

  const { error } = await supabase
    .from('pyra_whatsapp_instances')
    .delete()
    .eq('id', id);

  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: true });
}
