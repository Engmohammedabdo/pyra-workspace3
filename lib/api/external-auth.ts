import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export interface ExternalApiContext {
  apiKey: {
    id: string;
    name: string;
    permissions: string[];
    created_by: string | null;
  };
}

export async function getExternalAuth(req: NextRequest): Promise<ExternalApiContext | null> {
  const key = req.headers.get('x-api-key');
  if (!key) return null;

  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('pyra_api_keys')
    .select('id, name, permissions, is_active, expires_at, created_by')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

  // Update last_used_at (fire-and-forget)
  supabase
    .from('pyra_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {});

  return {
    apiKey: {
      id: data.id,
      name: data.name,
      permissions: data.permissions as string[],
      created_by: data.created_by,
    },
  };
}

export function hasPermission(ctx: ExternalApiContext, permission: string): boolean {
  return ctx.apiKey.permissions.includes(permission) || ctx.apiKey.permissions.includes('*');
}
