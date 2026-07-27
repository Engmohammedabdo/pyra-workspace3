import { describe, it, expect } from 'vitest';
import { classifyLinkState } from '@/lib/documents/link-state';

const NOW = '2026-07-27T12:00:00.000Z';

describe('classifyLinkState', () => {
  it('treats a null expiry as valid forever', () => {
    expect(classifyLinkState({ expires_at: null, revoked_at: null }, NOW)).toBe('valid');
  });

  it('is valid while expires_at is in the future', () => {
    expect(
      classifyLinkState({ expires_at: '2026-07-28T00:00:00.000Z', revoked_at: null }, NOW),
    ).toBe('valid');
  });

  it('is expired once expires_at has passed', () => {
    expect(
      classifyLinkState({ expires_at: '2026-07-27T11:59:59.000Z', revoked_at: null }, NOW),
    ).toBe('expired');
  });

  it('treats an exact-boundary expiry as expired', () => {
    expect(classifyLinkState({ expires_at: NOW, revoked_at: null }, NOW)).toBe('expired');
  });

  it('lets revoked win over expired', () => {
    expect(
      classifyLinkState(
        { expires_at: '2020-01-01T00:00:00.000Z', revoked_at: '2026-07-01T00:00:00.000Z' },
        NOW,
      ),
    ).toBe('revoked');
  });

  it('is revoked even when not expired', () => {
    expect(
      classifyLinkState({ expires_at: null, revoked_at: '2026-07-26T00:00:00.000Z' }, NOW),
    ).toBe('revoked');
  });
});
