import { describe, it, expect } from 'vitest';
import {
  INVOICE_STATUS, INVOICE_STATUS_LABELS, INVOICE_PAID_STATUSES, INVOICE_OUTSTANDING_STATUSES,
  QUOTE_STATUS, QUOTE_STATUS_LABELS, QUOTE_VALID_TRANSITIONS,
  PO_STATUS, PO_VALID_TRANSITIONS,
  PAYMENT_METHOD, PAYMENT_METHOD_LABELS,
  BILLING_CYCLE, BILLING_CYCLE_LABELS,
} from '@/lib/constants/statuses';

describe('Status Constants', () => {
  it('every invoice status has an Arabic label', () => {
    for (const status of Object.values(INVOICE_STATUS)) {
      expect(INVOICE_STATUS_LABELS[status]).toBeDefined();
      expect(INVOICE_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it('paid statuses are subset of all invoice statuses', () => {
    const all = Object.values(INVOICE_STATUS);
    for (const s of INVOICE_PAID_STATUSES) {
      expect(all).toContain(s);
    }
  });

  it('outstanding statuses are subset of all invoice statuses', () => {
    const all = Object.values(INVOICE_STATUS);
    for (const s of INVOICE_OUTSTANDING_STATUSES) {
      expect(all).toContain(s);
    }
  });

  it('every quote status has an Arabic label', () => {
    for (const status of Object.values(QUOTE_STATUS)) {
      expect(QUOTE_STATUS_LABELS[status]).toBeDefined();
    }
  });

  it('quote transitions reference valid statuses only', () => {
    const allStatuses = Object.values(QUOTE_STATUS) as string[];
    for (const [from, tos] of Object.entries(QUOTE_VALID_TRANSITIONS)) {
      expect(allStatuses).toContain(from);
      for (const to of tos) {
        expect(allStatuses).toContain(to);
      }
    }
  });

  it('PO transitions reference valid statuses only', () => {
    const allStatuses = Object.values(PO_STATUS) as string[];
    for (const [from, tos] of Object.entries(PO_VALID_TRANSITIONS)) {
      expect(allStatuses).toContain(from);
      for (const to of tos) {
        expect(allStatuses).toContain(to);
      }
    }
  });

  it('every payment method has a label', () => {
    for (const method of Object.values(PAYMENT_METHOD)) {
      expect(PAYMENT_METHOD_LABELS[method]).toBeDefined();
    }
  });

  it('every billing cycle has a label', () => {
    for (const cycle of Object.values(BILLING_CYCLE)) {
      expect(BILLING_CYCLE_LABELS[cycle]).toBeDefined();
    }
  });
});
