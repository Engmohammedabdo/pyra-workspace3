import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';
import { generateNextInvoiceNumber } from '@/lib/utils/invoice-number';
import { dubaiDayKey } from '@/lib/utils/format';
import { recalcContractBilled } from '@/lib/finance/contract-billing';
import { SUBSCRIPTION_STATUS, INVOICE_STATUS } from '@/lib/constants/statuses';

/**
 * Shared recurring-invoice generation engine.
 *
 * Extracted from /api/finance/recurring-invoices/generate (finance audit
 * 2026-07-02, Batch 3) so the manual dashboard button and the daily finance
 * cron run EXACTLY the same logic. Fixes folded in during extraction:
 * - F-REC-VAT: a contract-linked template uses the CONTRACT's vat_rate
 *   (honoring an explicit 0) — the manual retainer route already did; this
 *   path silently used the global setting.
 * - F11: items-insert failure now rolls the invoice back (no item-less
 *   invoices); a failed next_generation_date advance also rolls back so the
 *   next run cannot silently double-bill the same period.
 * - amount_billed refresh via recalcContractBilled (derive, don't drift).
 * - Dubai calendar day for issue/due dates.
 */

interface Actor {
  username: string;
  display_name: string;
}

export interface RecurringGenerationResult {
  generated: number;
  invoice_ids: string[];
  generated_details: { invoice_id: string; invoice_number: string; title: string; total: number; currency: string }[];
  failures: { template_id: string; reason: string }[];
}

function calculateNextDate(currentDate: string, billingCycle: string): string {
  const date = new Date(currentDate);
  const originalDay = date.getDate();
  let year = date.getFullYear();
  let month = date.getMonth(); // 0-based

  switch (billingCycle) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      return date.toISOString().split('T')[0];
    case 'monthly':
      month += 1;
      break;
    case 'quarterly':
      month += 3;
      break;
    case 'yearly':
      year += 1;
      break;
    default:
      month += 1;
  }

  // Handle month overflow (e.g., month 13 → next year month 1)
  year += Math.floor(month / 12);
  month = month % 12;

  // Clamp day to last day of target month (handles 31→30, 31→28, etc.)
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(originalDay, lastDayOfMonth);

  return new Date(year, month, clampedDay).toISOString().split('T')[0];
}

export async function generateDueRecurringInvoices(
  supabase: SupabaseClient,
  actor: Actor,
  ip: string = 'system'
): Promise<RecurringGenerationResult> {
  const result: RecurringGenerationResult = {
    generated: 0,
    invoice_ids: [],
    generated_details: [],
    failures: [],
  };

  const today = dubaiDayKey();

  // Find all active templates where next_generation_date <= today
  const { data: dueTemplates, error: fetchError } = await supabase
    .from('pyra_recurring_invoices')
    .select('*')
    .eq('status', SUBSCRIPTION_STATUS.ACTIVE)
    .lte('next_generation_date', today);

  if (fetchError) throw fetchError;
  if (!dueTemplates || dueTemplates.length === 0) return result;

  // Fetch settings once
  const { data: settings } = await supabase
    .from('pyra_settings')
    .select('key, value')
    .in('key', [
      'vat_rate',
      'bank_name',
      'bank_account_name',
      'bank_account_no',
      'bank_iban',
      'company_name',
      'company_logo',
      'payment_terms_days',
      'default_currency',
    ]);

  const settingsMap: Record<string, string> = {};
  for (const s of settings || []) settingsMap[s.key] = s.value;

  const globalTaxRate = parseFloat(settingsMap.vat_rate || '5');
  const paymentTermsDays = parseInt(settingsMap.payment_terms_days || '30');

  const bankDetails = {
    bank: settingsMap.bank_name || '',
    account_name: settingsMap.bank_account_name || '',
    account_no: settingsMap.bank_account_no || '',
    iban: settingsMap.bank_iban || '',
  };

  for (const template of dueTemplates) {
    try {
      // 1. Fetch client data
      let clientData: Record<string, string | null> = {
        client_name: null,
        client_email: null,
        client_company: null,
        client_phone: null,
      };

      if (template.client_id) {
        const { data: client } = await supabase
          .from('pyra_clients')
          .select('name, email, phone, company')
          .eq('id', template.client_id)
          .maybeSingle();

        if (client) {
          clientData = {
            client_name: client.name,
            client_email: client.email,
            client_company: client.company,
            client_phone: client.phone,
          };
        }
      }

      // 1b. Contract context — vat_rate priority (explicit 0 honored) +
      // scope-of-work notes from contract items
      let taxRate = globalTaxRate;
      let scopeNotes = `فاتورة متكررة — ${template.title}`;
      if (template.contract_id) {
        const { data: contract } = await supabase
          .from('pyra_contracts')
          .select('vat_rate')
          .eq('id', template.contract_id)
          .maybeSingle();
        if (contract && contract.vat_rate != null) {
          taxRate = Number(contract.vat_rate);
        }

        const { data: contractItems } = await supabase
          .from('pyra_contract_items')
          .select('id, parent_id, title, sort_order')
          .eq('contract_id', template.contract_id)
          .order('sort_order', { ascending: true });

        if (contractItems && contractItems.length > 0) {
          const parents = contractItems.filter((i: { parent_id: string | null }) => !i.parent_id);
          const lines: string[] = ['نطاق العمل:'];
          parents.forEach((parent: { id: string; title: string }, idx: number) => {
            lines.push(`${idx + 1}. ${parent.title}`);
            const children = contractItems
              .filter((i: { parent_id: string | null }) => i.parent_id === parent.id)
              .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
            const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
            children.forEach((child: { title: string }, cIdx: number) => {
              lines.push(`   ${letters[cIdx] || String(cIdx + 1)}. ${child.title}`);
            });
          });
          scopeNotes = lines.join('\n');
        }
      }

      // 2. Generate invoice number
      const invoiceNumber = await generateNextInvoiceNumber(supabase);

      // 3. Calculate totals from items
      const items = Array.isArray(template.items) ? template.items : [];
      const processedItems = items.map(
        (item: { description: string; quantity: number; rate: number }, idx: number) => ({
          id: generateId('ii'),
          sort_order: idx + 1,
          description: item.description?.trim() || '',
          quantity: item.quantity || 1,
          rate: item.rate || 0,
          amount: (item.quantity || 1) * (item.rate || 0),
        })
      );

      const subtotal = processedItems.reduce(
        (sum: number, i: { amount: number }) => sum + i.amount,
        0
      );
      if (subtotal <= 0) {
        result.failures.push({ template_id: template.id, reason: 'empty_or_zero_items' });
        continue;
      }
      const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;

      // 4. Dates (Dubai calendar day)
      const issueDate = today;
      const dueDateStr = dubaiDayKey(new Date(Date.now() + paymentTermsDays * 86400000));

      // 5. Create invoice
      const invoiceId = generateId('inv');
      const invoiceStatus = template.auto_send ? INVOICE_STATUS.SENT : INVOICE_STATUS.DRAFT;

      const { error: insertError } = await supabase
        .from('pyra_invoices')
        .insert({
          id: invoiceId,
          invoice_number: invoiceNumber,
          client_id: template.client_id || null,
          project_name: template.title,
          status: invoiceStatus,
          issue_date: issueDate,
          due_date: dueDateStr,
          currency: template.currency || settingsMap.default_currency || 'AED',
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total,
          amount_paid: 0,
          amount_due: total,
          notes: scopeNotes,
          bank_details: bankDetails,
          company_name: settingsMap.company_name || null,
          company_logo: settingsMap.company_logo || null,
          contract_id: template.contract_id || null,
          created_by: actor.username,
          ...clientData,
        });

      if (insertError) {
        console.error(`[recurring-generation] invoice insert failed for template ${template.id}:`, insertError);
        result.failures.push({ template_id: template.id, reason: `invoice_insert: ${insertError.message}` });
        continue;
      }

      // 6. Create invoice items — rollback the invoice if this fails (an
      // invoice with money totals and zero line items must never exist)
      const itemRows = processedItems.map(
        (item: { id: string; sort_order: number; description: string; quantity: number; rate: number; amount: number }) => ({
          ...item,
          invoice_id: invoiceId,
        })
      );

      const { error: itemsError } = await supabase.from('pyra_invoice_items').insert(itemRows);
      if (itemsError) {
        console.error(`[recurring-generation] items insert failed for template ${template.id}:`, itemsError);
        await supabase.from('pyra_invoices').delete().eq('id', invoiceId);
        result.failures.push({ template_id: template.id, reason: `items_insert: ${itemsError.message}` });
        continue;
      }

      // 7. Advance the template BEFORE counting success — if this fails the
      // next run would silently regenerate the same period, so roll the
      // whole generation back and report the failure instead.
      const nextDate = calculateNextDate(template.next_generation_date, template.billing_cycle);
      const { error: advanceError } = await supabase
        .from('pyra_recurring_invoices')
        .update({
          last_generated_at: new Date().toISOString(),
          next_generation_date: nextDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', template.id);

      if (advanceError) {
        console.error(`[recurring-generation] template advance failed for ${template.id}:`, advanceError);
        await supabase.from('pyra_invoice_items').delete().eq('invoice_id', invoiceId);
        await supabase.from('pyra_invoices').delete().eq('id', invoiceId);
        result.failures.push({ template_id: template.id, reason: `advance_failed: ${advanceError.message}` });
        continue;
      }

      // 8. Contract billed counter is derived from actual invoices
      if (template.contract_id) {
        await recalcContractBilled(supabase, template.contract_id);
      }

      // 9. If auto_send and client exists, create client notification.
      // auto_send is a per-template EXPLICIT admin opt-in (default false) —
      // the no-client-facing-sends decision is honored by keeping every
      // template's auto_send off.
      if (template.auto_send && template.client_id) {
        const { error: cnErr } = await supabase.from('pyra_client_notifications').insert({
          id: generateId('cn'),
          client_id: template.client_id,
          type: 'invoice_sent',
          title: 'فاتورة جديدة',
          message: `تم إصدار فاتورة جديدة رقم ${invoiceNumber} بقيمة ${total.toFixed(2)} ${template.currency || 'AED'}`,
          target_project_id: null,
          target_file_id: null,
        });
        if (cnErr) console.error('[recurring-generation] client notification error:', cnErr.message);
      }

      // 10. Log activity
      const { error: logErr } = await supabase.from('pyra_activity_log').insert({
        id: generateId('al'),
        action_type: 'generate_recurring_invoice',
        username: actor.username,
        display_name: actor.display_name,
        target_path: `/dashboard/invoices/${invoiceId}`,
        details: {
          template_id: template.id,
          template_title: template.title,
          invoice_number: invoiceNumber,
          total,
          auto_send: template.auto_send,
        },
        ip_address: ip,
      });
      if (logErr) console.error('[recurring-generation] activity log error:', logErr.message);

      result.generated++;
      result.invoice_ids.push(invoiceId);
      result.generated_details.push({
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        title: template.title || '',
        total,
        currency: template.currency || 'AED',
      });
    } catch (err) {
      console.error(`[recurring-generation] template ${template.id} threw:`, err);
      result.failures.push({ template_id: template.id, reason: err instanceof Error ? err.message : 'unknown' });
      continue;
    }
  }

  return result;
}
