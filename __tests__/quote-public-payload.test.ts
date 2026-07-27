import { describe, it, expect } from 'vitest';
import { toPublicQuotePayload, PUBLIC_QUOTE_FIELDS } from '@/lib/quotes/public-payload';

const ROW = {
  id: 'qt_1',
  quote_number: 'QT-0031',
  status: 'sent',
  currency: 'AED',
  subtotal: 11997,
  tax_rate: 0,
  tax_amount: 0,
  discount_type: null,
  discount_value: null,
  discount_amount: null,
  total: 11997,
  estimate_date: '2026-07-25',
  expiry_date: '2026-08-25',
  notes: null,
  terms_conditions: [],
  company_name: 'Pyramedia X',
  company_logo: null,
  client_name: 'Majed Alsaleh',
  client_company: 'ELITE TRACK CARS',
  signed_at: null,
  signed_by: null,
  // Everything below MUST be dropped.
  client_email: 'ali@example.com',
  client_phone: '0527412990',
  client_address: 'Dubai Marina',
  client_id: 'cl_1',
  lead_id: 'sl_1',
  created_by: 'elharm',
  signed_ip: '1.2.3.4',
  license_no: 'LIC-123',
  entity_id: 'be_1',
  bank_details: { bank: 'Emirates NBD', iban: 'AE07...' },
};

const ITEMS = [{ description: 'Offer', quantity: 3, rate: 3999, amount: 11997 }];

describe('toPublicQuotePayload', () => {
  it('emits exactly the allowlisted keys', () => {
    const payload = toPublicQuotePayload(ROW, ITEMS);
    expect(Object.keys(payload).sort()).toEqual([...PUBLIC_QUOTE_FIELDS, 'items'].sort());
  });

  it.each([
    'client_email',
    'client_phone',
    'client_address',
    'client_id',
    'lead_id',
    'created_by',
    'signed_ip',
    'license_no',
    'entity_id',
    'bank_details',
  ])('never leaks %s', (key) => {
    expect(toPublicQuotePayload(ROW, ITEMS)).not.toHaveProperty(key);
  });

  it('passes items through unchanged', () => {
    expect(toPublicQuotePayload(ROW, ITEMS).items).toEqual(ITEMS);
  });

  it('produces the same keys even when the row is missing optional fields', () => {
    const sparse = { id: 'qt_2', quote_number: 'QT-1', status: 'sent', total: 0 };
    expect(Object.keys(toPublicQuotePayload(sparse, [])).sort()).toEqual(
      [...PUBLIC_QUOTE_FIELDS, 'items'].sort(),
    );
  });
});
