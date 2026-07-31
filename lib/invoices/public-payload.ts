/**
 * The explicit allowlist of invoice fields that may cross onto an
 * unauthenticated, forwardable URL.
 *
 * An allowlist, not an omit-list, and for the same reason as
 * lib/quotes/public-payload.ts: a future `select *` on the public route adds
 * columns to the row but cannot add them to the payload, and the unit test
 * pins the key set so the change fails CI instead of shipping.
 *
 * Deliberately absent:
 *  - `bank_details` (owner decision D-1). Publishing the company IBAN on a
 *    link anyone can forward is an invoice-fraud kit. This matters MORE here
 *    than on quotes: an invoice with a real IBAN on it is exactly the document
 *    payment-redirection fraud imitates.
 *  - `client_email` / `client_phone` / `client_address` — the recipient
 *    already knows their own contact details, and a forwarded link must not
 *    hand them to whoever it was forwarded to.
 *  - `project_name`, `contract_id`, `entity_id`, `license_no`, `created_by`,
 *    `display_client_name`, `quote_id`, `parent_invoice_id`, `milestone_type`
 *    — internal linkage and internal naming, none of it the payer's business.
 */
export const PUBLIC_INVOICE_FIELDS = [
  'id',
  'invoice_number',
  'status',
  'currency',
  'subtotal',
  'tax_rate',
  'tax_amount',
  'discount_type',
  'discount_value',
  'discount_amount',
  'total',
  'amount_paid',
  'amount_due',
  'issue_date',
  'due_date',
  'notes',
  'terms_conditions',
  'company_name',
  'company_logo',
  'client_name',
  'client_company',
] as const;

export type PublicInvoiceField = (typeof PUBLIC_INVOICE_FIELDS)[number];

export interface PublicInvoiceItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export type PublicInvoicePayload = Record<PublicInvoiceField, unknown> & {
  items: PublicInvoiceItem[];
};

export function toPublicInvoicePayload(
  row: Record<string, unknown>,
  items: PublicInvoiceItem[],
): PublicInvoicePayload {
  const out = {} as PublicInvoicePayload;
  for (const key of PUBLIC_INVOICE_FIELDS) {
    (out as Record<string, unknown>)[key] = row[key] ?? null;
  }
  out.items = items;
  return out;
}
