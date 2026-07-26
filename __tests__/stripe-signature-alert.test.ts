import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The Stripe webhook has now gone dark twice, both times invisibly:
 *   - 2026-02 to 2026-07: the endpoint was DISABLED. Zero events ever settled.
 *     A real 5,175 AED payment went unrecorded and was only found by hand.
 *   - 2026-07-26: the endpoint's signing secret was rotated without updating
 *     pyra_settings, so Stripe delivered and we answered 401 on every retry.
 *
 * Both times the observability layer recorded the failure and nothing told a
 * human. This guards the alert that closes that loop.
 */
const ROUTE = path.join(process.cwd(), 'app/api/stripe/webhook/route.ts');
const src = readFileSync(ROUTE, 'utf8');

describe('sustained signature-failure alert', () => {
  it('is invoked from the signature-failure branch', () => {
    expect(src).toContain('await alertOnSustainedSignatureFailure(req)');
  });

  it('fires only for requests that really came from Stripe', () => {
    // A random internet scanner hitting the public URL must not page anyone.
    expect(src).toContain("ua.startsWith('Stripe/')");
  });

  it('requires sustained failure, not a single one', () => {
    expect(src).toContain('SIGNATURE_ALERT_THRESHOLD = 3');
    expect(src).toContain('total < SIGNATURE_ALERT_THRESHOLD');
  });

  it('counts the current request rather than racing the fire-and-forget log write', () => {
    expect(src).toContain('(count ?? 0) + 1');
  });

  it('uses the jsonb reason filter validated against the live table', () => {
    expect(src).toContain("eq('metadata->>reason', 'signature_verification')");
  });

  it('dedups per Dubai day, since notify() does not dedup on entity', () => {
    expect(src).toContain('stripe_sig_${dubaiDayKey()}');
    expect(src).toContain("eq('entity_type', 'stripe_webhook')");
  });

  it('fails closed — a dedup read error must not suppress the alert', () => {
    expect(src).toContain('if (!dedupErr && already && already.length > 0) return;');
  });

  it('is wrapped so it can never break the 401 response path', () => {
    const fn = src.slice(
      src.indexOf('async function alertOnSustainedSignatureFailure'),
      src.indexOf('export const runtime'),
    );
    expect(fn).toContain('try {');
    expect(fn).toContain('} catch {');
    // The 401 must still be returned after the alert runs.
    expect(src).toMatch(/alertOnSustainedSignatureFailure\(req\);\s*\n\s*return NextResponse\.json\(\s*\{ error: 'Invalid webhook signature' \}/);
  });

  it('points the admin at where the secret is actually fixed', () => {
    expect(src).toContain("link: '/dashboard/settings'");
  });
});
