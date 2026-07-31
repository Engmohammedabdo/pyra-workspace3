import { describe, it, expect } from 'vitest';
import {
  matchClientByPhone,
  matchLeadRowByPhone,
  isMatchablePhone,
  MIN_MATCH_DIGITS,
  type LeadPhoneRow,
} from '@/lib/finance/quick-payment-match';
import { matchLeadByPhone, buildLeadPhoneIndex } from '@/lib/calls/match';

const lead = (over: Partial<LeadPhoneRow> & { id: string; phone: string | null }): LeadPhoneRow => ({
  name: 'Lead',
  company: null,
  stage_id: 'stg_new',
  assigned_to: null,
  client_id: null,
  created_at: '2026-06-01T00:00:00.000Z',
  is_converted: false,
  ...over,
});

/** The two shapes that actually appear in pyra_sales_leads (measured 2026-07-31). */
const LEADS: LeadPhoneRow[] = [
  lead({ id: 'sl_local', name: 'Ahmed', phone: '0501342400' }),
  lead({ id: 'sl_intl', name: 'Sara', phone: '+971559725410' }),
  lead({ id: 'sl_landline', name: 'Office', phone: '+97143529292' }),
  lead({ id: 'sl_nophone', name: 'No phone', phone: null }),
  lead({ id: 'sl_blank', name: 'Blank phone', phone: '' }),
];

describe('isMatchablePhone', () => {
  it('rejects a half-typed number', () => {
    expect(isMatchablePhone('05')).toBe(false);
    expect(isMatchablePhone('050123')).toBe(false);
  });

  it('accepts once there are enough digits', () => {
    expect(isMatchablePhone('0501234')).toBe(true);
    expect('0501234'.replace(/\D/g, '').length).toBe(MIN_MATCH_DIGITS);
  });

  it('rejects empty, null and punctuation-only input', () => {
    expect(isMatchablePhone('')).toBe(false);
    expect(isMatchablePhone(null)).toBe(false);
    expect(isMatchablePhone('+-- ()')).toBe(false);
  });

  /**
   * The guard counts ALL digits, not the 9-digit match key. Without that, a
   * 4-digit input padded by the key function could sneak past the floor.
   */
  it('counts every digit, not just the trailing nine', () => {
    expect(isMatchablePhone('971')).toBe(false);
  });
});

describe('matchLeadRowByPhone — the shapes that exist in prod', () => {
  it('matches a local mobile typed exactly as stored', () => {
    expect(matchLeadRowByPhone(LEADS, '0501342400')?.id).toBe('sl_local');
  });

  it('matches a local-stored mobile typed in international form', () => {
    expect(matchLeadRowByPhone(LEADS, '+971501342400')?.id).toBe('sl_local');
    expect(matchLeadRowByPhone(LEADS, '00971501342400')?.id).toBe('sl_local');
  });

  it('matches an internationally-stored mobile typed in local form', () => {
    expect(matchLeadRowByPhone(LEADS, '0559725410')?.id).toBe('sl_intl');
  });

  it('ignores spaces, dashes and brackets in what the operator types', () => {
    expect(matchLeadRowByPhone(LEADS, '+971 50 134 2400')?.id).toBe('sl_local');
    expect(matchLeadRowByPhone(LEADS, '050-134-2400')?.id).toBe('sl_local');
  });

  it('returns null for an unknown number', () => {
    expect(matchLeadRowByPhone(LEADS, '0509999999')).toBeNull();
  });

  it('never matches a lead that has no usable phone', () => {
    expect(matchLeadRowByPhone(LEADS, '')).toBeNull();
    expect(matchLeadRowByPhone(LEADS, '05')).toBeNull();
  });

  it('returns the FULL row, not just the id and name', () => {
    const hit = matchLeadRowByPhone(
      [lead({ id: 'sl_x', phone: '0501112222', client_id: 'cl_1', stage_id: 'stg_negotiation' })],
      '0501112222',
    );
    expect(hit).toMatchObject({ id: 'sl_x', client_id: 'cl_1', stage_id: 'stg_negotiation' });
  });

  /**
   * The whole point of delegating: if the calls system and the payment dialog
   * ever disagree about who a number belongs to, one of them is lying to the
   * operator. This pins them together.
   */
  it('agrees with the calls system on every lead it can match', () => {
    const index = buildLeadPhoneIndex(LEADS);
    for (const l of LEADS) {
      if (!l.phone) continue;
      const viaCalls = matchLeadByPhone(index, l.phone);
      const viaPayment = matchLeadRowByPhone(LEADS, l.phone);
      expect(viaPayment?.id ?? null).toBe(viaCalls?.id ?? null);
    }
  });

  it('inherits the first-wins tie-break on duplicate numbers', () => {
    const dupes = [
      lead({ id: 'sl_first', phone: '0501342400' }),
      lead({ id: 'sl_second', phone: '+971501342400' }),
    ];
    expect(matchLeadRowByPhone(dupes, '0501342400')?.id).toBe('sl_first');
  });

  /**
   * Documents a known limit rather than pretending it away: the shared key is
   * the last 9 digits, so a Dubai landline written +9714… and one written 04…
   * do NOT match. Accepted, because changing it would change call matching too.
   */
  it('does not match a landline across its two local/international forms', () => {
    expect(matchLeadRowByPhone(LEADS, '043529292')).toBeNull();
    expect(matchLeadRowByPhone(LEADS, '+97143529292')?.id).toBe('sl_landline');
  });
});

describe('matchClientByPhone', () => {
  const CLIENTS = [
    { id: 'cl_1', phone: '+971501342400' },
    { id: 'cl_2', phone: '0559725410' },
    { id: 'cl_3', phone: null },
    { id: 'cl_4', phone: '' },
    { id: 'cl_5', phone: '123' },
  ];

  it('matches across formats', () => {
    expect(matchClientByPhone(CLIENTS, '0501342400')?.id).toBe('cl_1');
    expect(matchClientByPhone(CLIENTS, '+971559725410')?.id).toBe('cl_2');
  });

  it('returns null for an unknown number', () => {
    expect(matchClientByPhone(CLIENTS, '0500000000')).toBeNull();
  });

  /**
   * The bug this prevents: phoneMatchKey('') is '', so a naive equality check
   * would make every client with a blank phone match every blank input — and
   * the very first walk-in with no number would be booked as an existing client.
   */
  it('never matches blank or null client phones against a blank input', () => {
    expect(matchClientByPhone(CLIENTS, '')).toBeNull();
    expect(matchClientByPhone(CLIENTS, '   ')).toBeNull();
  });

  it('never matches a too-short stored number', () => {
    expect(matchClientByPhone(CLIENTS, '123')).toBeNull();
  });
});
