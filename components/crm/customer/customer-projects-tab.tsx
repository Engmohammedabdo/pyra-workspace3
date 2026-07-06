'use client';

/**
 * Projects tab — v1 deep-link to existing /dashboard/projects?client_id=X.
 *
 * Per PRD §04 line 217: "Deferred — empty state in v1, links to
 * /dashboard/projects?client_id=...". The projects module already
 * ships a full CRUD admin page; rebuilding it here would be redundant.
 *
 * Two empty-state variants:
 *   - customer.client_id present → action button links to projects page
 *   - customer.client_id null    → "convert to customer first" message
 *
 * v1.1 may inline a list of project summaries here once the projects
 * module exposes a `?client_id=` filter API alongside its UI.
 */

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Briefcase, ExternalLink } from 'lucide-react';
import type { DossierCustomer } from '@/hooks/useCustomerDossier';

interface Props {
  customer: DossierCustomer;
}

export function CustomerProjectsTab({ customer }: Props) {
  const t = useTranslations('crm.customers.projectsTab');

  if (!customer.client_id) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={Briefcase}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <EmptyState
        icon={Briefcase}
        title={t('manageTitle')}
        description={t('manageDescription')}
        actions={[
          {
            label: t('openProjects'),
            variant: 'secondary',
            icon: ExternalLink,
            onClick: () => {
              window.location.href = `/dashboard/projects?client_id=${customer.client_id}`;
            },
          },
        ]}
      />
    </Card>
  );
}
