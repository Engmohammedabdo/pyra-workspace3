import { describe, it, expect } from 'vitest';
import { generateDocumentLinkToken } from '@/lib/documents/token';

describe('generateDocumentLinkToken', () => {
  it('fits the varchar(64) column', () => {
    expect(generateDocumentLinkToken().length).toBeLessThanOrEqual(64);
  });

  it('uses only URL-safe characters', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateDocumentLinkToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('carries at least 256 bits of entropy (43 base64url chars)', () => {
    expect(generateDocumentLinkToken().length).toBeGreaterThanOrEqual(43);
  });

  it('does not collide across 10k samples', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(generateDocumentLinkToken());
    expect(seen.size).toBe(10_000);
  });
});
