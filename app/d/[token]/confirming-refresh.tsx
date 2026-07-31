'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Poll the server a few times while a payment is being confirmed.
 *
 * Stripe redirects the payer back in well under a second — routinely before
 * the webhook has settled — so the page they land on says "confirming". Without
 * this, they sit on that message until they think to reload, which reads as a
 * failed payment. `router.refresh()` re-runs the Server Component, which
 * re-reads the ledger; the moment settleInvoicePayment lands, the banner flips
 * to paid on its own.
 *
 * Bounded on purpose. An unbounded poll on the one page a customer might leave
 * open on their phone would keep hitting a service-role-backed route forever;
 * ~40s covers the webhook's normal latency, and the reconcile cron is the
 * safety net for anything slower.
 */
const INTERVAL_MS = 4_000;
const MAX_ATTEMPTS = 10;

export function ConfirmingRefresh() {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (attempts >= MAX_ATTEMPTS) return;
    const timer = setTimeout(() => {
      setAttempts((n) => n + 1);
      router.refresh();
    }, INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [attempts, router]);

  return null;
}
