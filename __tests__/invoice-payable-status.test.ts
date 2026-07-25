import { describe, it, expect } from 'vitest';
import { isPayableInvoiceStatus } from '@/lib/constants/statuses';

/**
 * The dashboard checkout route blocked only 'paid' while the portal route
 * blocked four statuses. A cancelled or draft invoice was therefore payable
 * from the dashboard, and the webhook would then flip it to 'paid' — a
 * cancelled -> paid transition the invoice PATCH state machine forbids.
 */
describe('isPayableInvoiceStatus', () => {
  it('allows the outstanding states', () => {
    expect(isPayableInvoiceStatus('sent')).toBe(true);
    expect(isPayableInvoiceStatus('overdue')).toBe(true);
    expect(isPayableInvoiceStatus('partially_paid')).toBe(true);
  });

  it('blocks draft, cancelled, paid and expired', () => {
    for (const s of ['draft', 'cancelled', 'paid', 'expired']) {
      expect(isPayableInvoiceStatus(s)).toBe(false);
    }
  });

  it('blocks an unknown status rather than defaulting open', () => {
    expect(isPayableInvoiceStatus('')).toBe(false);
    expect(isPayableInvoiceStatus('something_new')).toBe(false);
  });
});
