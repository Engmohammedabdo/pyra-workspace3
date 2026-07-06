'use client';

/**
 * Invoices tab — v1 deep-link to existing /dashboard/finance/invoices?client_id=X.
 *
 * Per PRD §04 line 218: "Deferred — empty state, link to the invoices list
 * filtered by client_id". The contracts tab (Step D) already shows the
 * per-contract billing-history mini-grid; the standalone invoices view at
 * /dashboard/invoices is the right place to see ALL invoices for this client
 * across all sources (CRM-linked contracts + ad-hoc invoices + recurring etc).
 *
 * NOTE: the canonical invoices route is /dashboard/invoices (NOT
 * /dashboard/finance/invoices — that path does not exist and 404s). The
 * list reads ?client_id= to scope to this customer.
 */

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Receipt, ExternalLink } from 'lucide-react';
import type { DossierCustomer } from '@/hooks/useCustomerDossier';

interface Props {
  customer: DossierCustomer;
}

export function CustomerInvoicesTab({ customer }: Props) {
  const t = useTranslations('crm.customers.invoicesTab');

  if (!customer.client_id) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={Receipt}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <EmptyState
        icon={Receipt}
        title={t('manageTitle')}
        description={t('manageDescription')}
        actions={[
          {
            label: t('openInvoices'),
            variant: 'secondary',
            icon: ExternalLink,
            onClick: () => {
              window.location.href = `/dashboard/invoices?client_id=${customer.client_id}`;
            },
          },
        ]}
      />
    </Card>
  );
}
