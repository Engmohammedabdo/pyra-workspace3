import { describe, it, expect } from 'vitest';
import { buildLeadPhoneIndex, matchLeadByPhone } from '@/lib/calls/match';

describe('lead phone matching', () => {
  const index = buildLeadPhoneIndex([
    { id: 'sl_1', name: 'Ahmed', phone: '+971 50 123 4567' },
    { id: 'sl_2', name: 'Sara', phone: '0509998877' },
    { id: 'sl_3', name: 'NoPhone', phone: null },
  ]);

  it('matches international vs local formats via 9-digit key', () => {
    expect(matchLeadByPhone(index, '0501234567')?.id).toBe('sl_1');
    expect(matchLeadByPhone(index, '00971509998877')?.id).toBe('sl_2');
  });
  it('returns null for unknown numbers and empty input', () => {
    expect(matchLeadByPhone(index, '0561112233')).toBeNull();
    expect(matchLeadByPhone(index, '')).toBeNull();
  });
  it('first lead wins on duplicate phone keys', () => {
    const dup = buildLeadPhoneIndex([
      { id: 'sl_a', name: 'A', phone: '0501234567' },
      { id: 'sl_b', name: 'B', phone: '+971501234567' },
    ]);
    expect(matchLeadByPhone(dup, '0501234567')?.id).toBe('sl_a');
  });
});
