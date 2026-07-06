import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { resolveUserScope } from '@/lib/auth/scope';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { sendQuoteSentEmail } from '@/lib/email/notify';
import { loadServerPdfFonts, loadServerDefaultLogo } from '@/lib/pdf/pdf-assets-server';
import { QUOTE_FIELDS } from '@/lib/supabase/fields';
import { QUOTE_STATUS } from '@/lib/constants/statuses';
import { logError } from '@/lib/observability/log-error';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/quotes/[id]/send
 * Mark quote as sent, create client notification.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('quotes.edit');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Full field set — needed to render the attached PDF (company/bank/terms/
    // discount/client fields), not just the status-flip subset.
    const { data: quote } = await supabase
      .from('pyra_quotes')
      .select(QUOTE_FIELDS)
      .eq('id', id)
      .maybeSingle();

    if (!quote) return apiNotFound(t('quotes.notFound'));

    // Q3: Scope check — non-admins can only send quotes for their own clients
    if (!scope.isAdmin && !scope.clientIds.includes(quote.client_id)) {
      return apiForbidden(t('quotes.sendWrongOwner'));
    }

    // Only draft quotes can be sent
    if (quote.status !== QUOTE_STATUS.DRAFT) {
      return apiValidationError(
        t('quotes.sendWrongStatus', { status: quote.status })
      );
    }

    const now = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('pyra_quotes')
      .update({ status: QUOTE_STATUS.SENT, sent_at: now, updated_at: now })
      .eq('id', id)
      .select('id, quote_number, status, sent_at')
      .single();

    if (error) {
      console.error('Quote send error:', error);
      return apiServerError();
    }

    // Create client notification if client exists
    if (quote.client_id) {
      await supabase.from('pyra_client_notifications').insert({
        id: generateId('cn'),
        client_id: quote.client_id,
        type: 'quote_sent',
        title: 'عرض سعر جديد', // i18n-exempt: client-notification content (Phase 8)
        message: `تم إرسال عرض سعر جديد: ${quote.quote_number}`, // i18n-exempt: client-notification content (Phase 8)
        is_read: false,
      });
    }

    // Send email to client + capture the honest result (Group 3 — flip-and-warn).
    // The quote is ALREADY marked 'sent' above regardless of email outcome; we
    // report whether the email actually fired so the UI tells the truth instead
    // of always claiming "تم الإرسال". // i18n-exempt: doc comment, illustrative quoted phrase, not a string literal
    //   - no_email      → client row/quote has no email address
    //   - not_delivered → SMTP send failed OR SMTP not configured
    let email: { sent: boolean; reason?: 'no_email' | 'not_delivered'; to?: string };
    if (!quote.client_email) {
      email = { sent: false, reason: 'no_email' };
    } else {
      // Generate the quote PDF server-side to ATTACH it — lead recipients have no
      // portal login, so the attachment (not the portal link) is the deliverable.
      // Mirrors app/api/dashboard/sales/whatsapp/send-pdf: dynamic-import the
      // generator + inject fs-loaded fonts/logo (relative fetch throws in Node).
      let pdf: { filename: string; content: Buffer } | undefined;
      try {
        const { data: items } = await supabase
          .from('pyra_quote_items')
          .select('description, quantity, rate, amount')
          .eq('quote_id', id)
          .order('sort_order', { ascending: true });
        const [fonts, defaultLogo] = await Promise.all([
          loadServerPdfFonts(),
          loadServerDefaultLogo(),
        ]);
        const { generateQuotePDF } = await import('@/lib/pdf/quote-pdf');
        const blob = await generateQuotePDF(
          {
            ...quote,
            items: items || [],
            terms_conditions: quote.terms_conditions || [],
            bank_details: quote.bank_details || { bank: '', account_name: '', account_no: '', iban: '' },
          } as Parameters<typeof generateQuotePDF>[0],
          { returnBlob: true, fonts, defaultLogo },
        );
        if (blob) {
          pdf = {
            filename: `Quote_${quote.quote_number}.pdf`,
            content: Buffer.from(await (blob as Blob).arrayBuffer()),
          };
        }
      } catch (pdfErr) {
        // PDF generation must NOT block the email — fall back to a link-only send.
        logError({ error: pdfErr, request: _request, metadata: { action: 'quote_send_pdf', quote_id: id } });
        console.error('[quote/send] PDF generation failed:', (pdfErr as Error)?.message);
      }

      const ok = await sendQuoteSentEmail({
        clientEmail: quote.client_email,
        clientName: quote.client_name || '',
        quoteNumber: quote.quote_number,
        total: quote.total,
        currency: quote.currency || 'AED',
        pdf,
      });
      email = ok
        ? { sent: true, to: quote.client_email }
        : { sent: false, reason: 'not_delivered' };
    }

    // Log activity (audit)
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'quote_sent',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/quotes/${id}`,
      details: { quote_number: quote.quote_number },
      ip_address: 'server',
    });

    // Lead timeline: surface "quote sent" in the lead's activity tab (not just
    // the audit log) so the owner/admin can track the touch. .then() required —
    // a bare `void <builder>` never dispatches.
    if (quote.lead_id) {
      void supabase
        .from('pyra_lead_activities')
        .insert({
          id: generateId('la'),
          lead_id: quote.lead_id,
          activity_type: 'note',
          description: `تم إرسال عرض السعر ${quote.quote_number} للعميل`, // i18n-exempt: stored data (lead_activities.description)
          metadata: { quote_id: id, quote_number: quote.quote_number, sent: true },
          created_by: auth.pyraUser.username,
        })
        .then(({ error: e }) => {
          if (e) console.error('[quote sent activity] insert failed:', e.message);
        });
    }

    return apiSuccess({ ...updated, email });
  } catch (err) {
    console.error('POST /api/quotes/[id]/send error:', err);
    return apiServerError();
  }
}
