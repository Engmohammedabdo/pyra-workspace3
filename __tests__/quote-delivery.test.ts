import { describe, it, expect } from 'vitest';
import { deriveDelivery } from '@/lib/quotes/delivery';

describe('deriveDelivery', () => {
  it('marks a successful send as delivered and records the recipient', () => {
    expect(deriveDelivery({ sent: true, to: 'a@b.com' })).toEqual({
      delivery_status: 'delivered',
      delivery_detail: 'a@b.com',
    });
  });

  it('marks a missing address as no_email', () => {
    expect(deriveDelivery({ sent: false, reason: 'no_email' })).toEqual({
      delivery_status: 'no_email',
      delivery_detail: null,
    });
  });

  it('marks an SMTP failure as not_delivered', () => {
    expect(deriveDelivery({ sent: false, reason: 'not_delivered', to: 'a@b.com' })).toEqual({
      delivery_status: 'not_delivered',
      delivery_detail: 'a@b.com',
    });
  });

  it('defaults an unexplained failure to not_delivered rather than delivered', () => {
    expect(deriveDelivery({ sent: false })).toEqual({
      delivery_status: 'not_delivered',
      delivery_detail: null,
    });
  });

  it('does not claim delivery when sent is true but no recipient is known', () => {
    expect(deriveDelivery({ sent: true })).toEqual({
      delivery_status: 'delivered',
      delivery_detail: null,
    });
  });
});
