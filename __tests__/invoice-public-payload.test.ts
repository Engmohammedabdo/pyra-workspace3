import { describe, it, expect } from 'vitest';
import { toPublicInvoicePayload, PUBLIC_INVOICE_FIELDS } from '@/lib/invoices/public-payload';

const ROW = {
  id: 'inv_1',
  invoice_number: 'INV-0042',
  status: 'sent',
  currency: 'AED',
  subtotal: 700,
  tax_rate: 0,
  tax_amount: 0,
  discount_type: null,
  discount_value: 0,
  discount_amount: 0,
  total: 700,
  amount_paid: 0,
  amount_due: 700,
  issue_date: '2026-07-31',
  due_date: '2026-07-31',
  notes: 'DJ booking',
  terms_conditions: null,
  company_name: 'Pyramedia X',
  company_logo: null,
  client_name: 'Walk-in customer',
  client_company: 'Walk-in customer',
  // Everything below MUST be dropped.
  bank_details: { bank: 'Emirates NBD', iban: 'AE07...' },
  client_email: 'someone@example.com',
  client_phone: '0527412990',
  client_address: 'Dubai Marina',
  client_id: 'cl_1',
  project_id: 'pr_1',
  project_name: 'Internal project name',
  contract_id: 'ct_1',
  entity_id: 'be_1',
  license_no: 'LIC-123',
  created_by: 'elharm',
  display_client_name: 'internal alias',
  quote_id: 'qt_1',
  parent_invoice_id: 'inv_0',
  milestone_type: 'deposit',
};

const ITEMS = [{ description: 'DJ booking', quantity: 1, rate: 700, amount: 700 }];

describe('toPublicInvoicePayload', () => {
  it('emits exactly the allowlisted keys', () => {
    const payload = toPublicInvoicePayload(ROW, ITEMS);
    expect(Object.keys(payload).sort()).toEqual([...PUBLIC_INVOICE_FIELDS, 'items'].sort());
  });

  /**
   * `bank_details` heads this list deliberately. An IBAN printed on a URL that
   * can be forwarded to anyone is the exact raw material for payment-redirection
   * fraud — the reason for owner decision D-1 on the quote path, and the reason
   * quick-payment-link never writes the column in the first place.
   */
  it.each([
    'bank_details',
    'client_email',
    'client_phone',
    'client_address',
    'client_id',
    'project_id',
    'project_name',
    'contract_id',
    'entity_id',
    'license_no',
    'created_by',
    'display_client_name',
    'quote_id',
    'parent_invoice_id',
    'milestone_type',
  ])('never leaks %s', (key) => {
    expect(toPublicInvoicePayload(ROW, ITEMS)).not.toHaveProperty(key);
  });

  it('passes items through unchanged', () => {
    expect(toPublicInvoicePayload(ROW, ITEMS).items).toEqual(ITEMS);
  });

  it('produces the same keys even when the row is missing optional fields', () => {
    const sparse = { id: 'inv_2', invoice_number: 'INV-1', status: 'sent', total: 0 };
    expect(Object.keys(toPublicInvoicePayload(sparse, [])).sort()).toEqual(
      [...PUBLIC_INVOICE_FIELDS, 'items'].sort(),
    );
  });

  it('shares no field name with anything the quote allowlist keeps private', () => {
    // Guards against a copy-paste that reintroduces a quote-only signature
    // column onto the invoice payload, where it would be meaningless.
    const payload = toPublicInvoicePayload(ROW, ITEMS);
    for (const key of ['signed_at', 'signed_by', 'signature_data', 'signed_ip']) {
      expect(payload).not.toHaveProperty(key);
    }
  });
});
