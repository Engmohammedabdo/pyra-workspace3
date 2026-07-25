import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The dashboard payment-link button gated its clipboard write on
 * `json.data?.url`, but POST /api/stripe/create-checkout returns
 * `apiSuccess({ checkout_url, session_id })`. `data.url` was therefore always
 * undefined: every click minted a LIVE Stripe Checkout session and silently
 * threw the URL away — no success toast, and no error toast either (res.ok was
 * true and json.error was null).
 *
 * Confirmed in production 2026-07-25: five orphaned sessions, plus a duplicate
 * invoice created because the admin reasonably assumed the click had failed.
 *
 * These are source-level assertions rather than a render test because the bug
 * is a response-contract mismatch, which is exactly what a render test with a
 * mocked fetch would paper over.
 */
const PAGE = path.join(process.cwd(), 'app/dashboard/invoices/[id]/page.tsx');
const ROUTE = path.join(process.cwd(), 'app/api/stripe/create-checkout/route.ts');

describe('dashboard payment-link handler', () => {
  const src = readFileSync(PAGE, 'utf8');

  it('reads checkout_url, the key the API actually returns', () => {
    expect(src).toContain('json.data?.checkout_url');
  });

  it('no longer reads the non-existent json.data.url key', () => {
    expect(src).not.toMatch(/json\.data\?\.url\b/);
  });

  it('surfaces a failure toast when the link is missing', () => {
    expect(src).toContain('toasts.paymentLinkFailed');
  });

  it('still reports success when the link is copied', () => {
    expect(src).toContain('toasts.paymentLinkCopied');
  });
});

describe('create-checkout response contract', () => {
  const src = readFileSync(ROUTE, 'utf8');

  it('returns checkout_url — the key the page must read', () => {
    expect(src).toContain('checkout_url: session.url');
  });
});
