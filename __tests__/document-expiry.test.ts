import { describe, it, expect } from 'vitest';
import { classifyExpiry } from '@/lib/hr/document-expiry';

describe('classifyExpiry', () => {
  const today = '2026-06-29';
  it('none when no expiry date', () => expect(classifyExpiry(null, today)).toBe('none'));
  it('expired when past', () => expect(classifyExpiry('2026-06-28', today)).toBe('expired'));
  it('expiring_7 within 7 days', () => expect(classifyExpiry('2026-07-03', today)).toBe('expiring_7'));
  it('expiring_30 within 30 days', () => expect(classifyExpiry('2026-07-20', today)).toBe('expiring_30'));
  it('ok beyond 30 days', () => expect(classifyExpiry('2026-09-01', today)).toBe('ok'));
  it('today counts as expiring_7', () => expect(classifyExpiry('2026-06-29', today)).toBe('expiring_7'));
});
