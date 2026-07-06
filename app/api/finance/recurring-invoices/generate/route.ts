import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateDueRecurringInvoices } from '@/lib/finance/recurring-generation';
import { logError } from '@/lib/observability/log-error';

/**
 * POST /api/finance/recurring-invoices/generate
 * Batch generate invoices for all due recurring templates (manual button).
 * The same engine runs daily via /api/cron/finance-daily — logic lives in
 * lib/finance/recurring-generation.ts (single source of truth).
 */
export async function POST(req: NextRequest) {
  const t = await getTranslations('api');
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();

  try {
    const result = await generateDueRecurringInvoices(
      supabase,
      { username: auth.pyraUser.username, display_name: auth.pyraUser.display_name },
      req.headers.get('x-forwarded-for') || 'unknown'
    );

    return apiSuccess(
      { generated: result.generated, invoice_ids: result.invoice_ids, failures: result.failures },
      {
        message: result.generated > 0
          ? t('finance.recurringGenerateSuccess', { count: result.generated })
          : t('finance.recurringGenerateEmpty'),
      }
    );
  } catch (err) {
    logError({
      error: err,
      request: req,
      user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
      metadata: { source: 'recurring-invoices', action: 'manual_generate' },
    });
    console.error('POST /api/finance/recurring-invoices/generate error:', err);
    return apiServerError();
  }
}
