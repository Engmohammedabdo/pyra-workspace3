/**
 * Turns the send route's honest email result into the value we persist.
 *
 * The send route has always computed this and thrown it away, so the quotes
 * list showed "sent" for mail that never left. Keeping the derivation in one
 * tested function keeps the stored badge and the three existing toasts in
 * provable agreement.
 */
export type DeliveryStatus = 'delivered' | 'no_email' | 'not_delivered';

export interface EmailOutcome {
  sent: boolean;
  reason?: 'no_email' | 'not_delivered';
  to?: string;
}

export function deriveDelivery(email: EmailOutcome): {
  delivery_status: DeliveryStatus;
  delivery_detail: string | null;
} {
  const detail = email.to ?? null;
  if (email.sent) return { delivery_status: 'delivered', delivery_detail: detail };
  if (email.reason === 'no_email') return { delivery_status: 'no_email', delivery_detail: null };
  // Fail pessimistic: an unexplained failure must never read as delivered.
  return { delivery_status: 'not_delivered', delivery_detail: detail };
}
