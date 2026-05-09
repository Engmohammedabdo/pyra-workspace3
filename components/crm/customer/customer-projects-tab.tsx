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

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Briefcase, ExternalLink } from 'lucide-react';
import type { DossierCustomer } from '@/hooks/useCustomerDossier';

interface Props {
  customer: DossierCustomer;
}

export function CustomerProjectsTab({ customer }: Props) {
  if (!customer.client_id) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={Briefcase}
          title="لا توجد مشاريع بعد"
          description="بعد تحويل العميل المحتمل لعميل دائم، يمكنك ربط المشاريع به وستظهر هنا."
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <EmptyState
        icon={Briefcase}
        title="إدارة المشاريع تتم في صفحة المشاريع"
        description="افتح صفحة المشاريع المفلترة لهذا العميل لرؤية كل المشاريع المرتبطة."
        actions={[
          {
            label: 'فتح صفحة المشاريع',
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
