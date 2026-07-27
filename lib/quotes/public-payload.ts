/**
 * The explicit allowlist of quote fields that may cross onto an unauthenticated,
 * forwardable URL.
 *
 * This is an allowlist and not an omit-list on purpose: a future `select *` on
 * the public route adds columns to the row but cannot add them to the payload,
 * and the unit test pins the key set so the change fails CI instead of shipping.
 *
 * Deliberately absent (owner decision D-1): `bank_details`. Publishing the
 * company IBAN on a link anyone can forward is an invoice-fraud kit.
 */
export const PUBLIC_QUOTE_FIELDS = [
  'id',
  'quote_number',
  'status',
  'currency',
  'subtotal',
  'tax_rate',
  'tax_amount',
  'discount_type',
  'discount_value',
  'discount_amount',
  'total',
  'estimate_date',
  'expiry_date',
  'notes',
  'terms_conditions',
  'company_name',
  'company_logo',
  'client_name',
  'client_company',
  'signed_at',
  'signed_by',
] as const;

export type PublicQuoteField = (typeof PUBLIC_QUOTE_FIELDS)[number];

export interface PublicQuoteItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export type PublicQuotePayload = Record<PublicQuoteField, unknown> & {
  items: PublicQuoteItem[];
};

export function toPublicQuotePayload(
  row: Record<string, unknown>,
  items: PublicQuoteItem[],
): PublicQuotePayload {
  const out = {} as PublicQuotePayload;
  for (const key of PUBLIC_QUOTE_FIELDS) {
    (out as Record<string, unknown>)[key] = row[key] ?? null;
  }
  out.items = items;
  return out;
}
