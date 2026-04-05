import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError, apiValidationError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { evolutionClient } from '@/lib/evolution/client';
import { logActivity } from '@/lib/api/activity';
import { QUOTE_FIELDS, INVOICE_FIELDS } from '@/lib/supabase/fields';

/**
 * POST /api/dashboard/sales/whatsapp/send-pdf
 * Generate a quote/invoice PDF on the server and send it via WhatsApp.
 *
 * Body: { conversation_id, type: 'quote'|'invoice', document_id }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const { conversation_id, type, document_id } = body;

    if (!conversation_id) return apiValidationError('معرف المحادثة مطلوب');
    if (!type || !['quote', 'invoice'].includes(type)) return apiValidationError('النوع يجب أن يكون quote أو invoice');
    if (!document_id) return apiValidationError('معرف المستند مطلوب');

    const supabase = createServiceRoleClient();

    // Fetch the conversation to get phone number
    const { data: conv, error: convErr } = await supabase
      .from('pyra_whatsapp_conversations')
      .select('id, remote_jid, contact_phone, instance_name')
      .eq('id', conversation_id)
      .maybeSingle();

    if (convErr || !conv) return apiError('المحادثة غير موجودة', 404);

    const phone = conv.contact_phone || conv.remote_jid
      .replace('@s.whatsapp.net', '')
      .replace('@c.us', '')
      .replace('@lid', '');

    let pdfBuffer: Buffer;
    let fileName: string;

    if (type === 'quote') {
      // Fetch quote data
      const { data: quote, error: quoteErr } = await supabase
        .from('pyra_quotes')
        .select(QUOTE_FIELDS)
        .eq('id', document_id)
        .maybeSingle();

      if (quoteErr || !quote) return apiError('عرض السعر غير موجود', 404);

      // Fetch items
      const { data: items } = await supabase
        .from('pyra_quote_items')
        .select('description, quantity, rate, amount')
        .eq('quote_id', document_id)
        .order('sort_order', { ascending: true });

      // Build quote data for the generator
      const quoteData = {
        ...quote,
        items: items || [],
        terms_conditions: quote.terms_conditions || [],
        bank_details: quote.bank_details || { bank: '', account_name: '', account_no: '', iban: '' },
      };

      // Generate PDF using the existing generator with returnBlob
      const { generateQuotePDF } = await import('@/lib/pdf/quote-pdf');
      const blob = await generateQuotePDF(quoteData, { returnBlob: true });
      if (!blob) return apiServerError('فشل إنشاء ملف PDF');

      const arrayBuffer = await (blob as Blob).arrayBuffer();
      pdfBuffer = Buffer.from(arrayBuffer);
      fileName = `Quote_${quote.quote_number}.pdf`;
    } else {
      // Fetch invoice data
      const { data: invoice, error: invErr } = await supabase
        .from('pyra_invoices')
        .select(INVOICE_FIELDS)
        .eq('id', document_id)
        .maybeSingle();

      if (invErr || !invoice) return apiError('الفاتورة غير موجودة', 404);

      // Fetch items
      const { data: items } = await supabase
        .from('pyra_invoice_items')
        .select('description, quantity, rate, amount')
        .eq('invoice_id', document_id)
        .order('sort_order', { ascending: true });

      // Fetch payments
      const { data: payments } = await supabase
        .from('pyra_payments')
        .select('amount, payment_date, method, reference')
        .eq('invoice_id', document_id)
        .order('payment_date', { ascending: true });

      // Build invoice data
      const invoiceData = {
        ...invoice,
        items: items || [],
        payments: payments || [],
        terms_conditions: invoice.terms_conditions || [],
        bank_details: invoice.bank_details || null,
      };

      // Generate PDF using the existing invoice generator with returnBlob
      const { generateInvoicePDF } = await import('@/lib/pdf/invoice-pdf');
      const invBlob = await generateInvoicePDF(invoiceData, { returnBlob: true });
      if (!invBlob) return apiServerError('فشل إنشاء ملف PDF');

      pdfBuffer = Buffer.from(await (invBlob as Blob).arrayBuffer());
      fileName = `Invoice_${invoice.invoice_number}.pdf`;
    }

    // Upload to Supabase Storage (temp folder)
    const storageKey = `whatsapp-temp/${generateId('pdf')}-${fileName}`;
    const { error: uploadErr } = await supabase.storage
      .from('files')
      .upload(storageKey, pdfBuffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
      });

    if (uploadErr) {
      console.error('PDF upload error:', uploadErr);
      return apiServerError('فشل رفع ملف PDF');
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('files')
      .getPublicUrl(storageKey);

    // Send via Evolution API
    const instanceName = conv.instance_name || 'pyraai';
    const evoResult = await evolutionClient.sendMedia(instanceName, {
      number: phone,
      mediatype: 'document',
      mimetype: 'application/pdf',
      media: publicUrl,
      fileName,
    });

    // Save the sent message to DB
    const msgId = generateId('wm');
    await supabase.from('pyra_whatsapp_messages').insert({
      id: msgId,
      instance_name: instanceName,
      remote_jid: conv.remote_jid,
      conversation_id: conv.id,
      message_id: evoResult?.key?.id || null,
      direction: 'outgoing',
      message_type: 'document',
      content: type === 'quote' ? `عرض سعر - ${fileName}` : `فاتورة - ${fileName}`,
      media_url: publicUrl,
      file_name: fileName,
      status: 'sent',
      timestamp: new Date().toISOString(),
    });

    // Update conversation
    await supabase.from('pyra_whatsapp_conversations').update({
      last_message: `[${type === 'quote' ? 'عرض سعر' : 'فاتورة'}] ${fileName}`,
      last_message_at: new Date().toISOString(),
      last_agent_message_at: new Date().toISOString(),
    }).eq('id', conv.id);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'whatsapp_pdf_sent',
      '/dashboard/sales/chat',
      { type, document_id, file_name: fileName }
    );

    return apiSuccess({ message_id: msgId, file_name: fileName });
  } catch (err) {
    console.error('POST /api/dashboard/sales/whatsapp/send-pdf error:', err);
    return apiServerError();
  }
}
