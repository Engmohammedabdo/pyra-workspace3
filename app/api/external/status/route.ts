import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError } from '@/lib/api/response';

/**
 * GET /api/external/status
 * Verify API key validity and return key info.
 * Auth: any valid API key
 */
export async function GET(req: NextRequest) {
  const ctx = await getExternalAuth(req);
  if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

  return apiSuccess({
    status: 'ok',
    key_name: ctx.apiKey.name,
    permissions: ctx.apiKey.permissions,
  });
}
