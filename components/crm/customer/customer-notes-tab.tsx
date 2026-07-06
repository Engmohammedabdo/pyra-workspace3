'use client';

/**
 * Notes tab — read-only render of `lead.notes` per Phase 9 Q-E2 (a).
 *
 * Inline-edit deferred to v1.1. For v1, the editing source-of-truth is
 * the lead-detail route at `/dashboard/crm/leads/[id]` (Phase 5/6 already
 * shipped a notes editor there). This tab provides a "view in lead"
 * link to send admin to the editor.
 *
 * Whitespace preserved via `whitespace-pre-wrap` so multi-paragraph
 * notes render naturally.
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StickyNote, ExternalLink } from 'lucide-react';
import type { DossierCustomer } from '@/hooks/useCustomerDossier';

interface Props {
  customer: DossierCustomer;
}

export function CustomerNotesTab({ customer }: Props) {
  const t = useTranslations('crm.customers.notesTab');
  const editLink = `/dashboard/crm/leads/${customer.id}`;

  if (!customer.notes || customer.notes.trim().length === 0) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={StickyNote}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          actions={[
            {
              label: t('openLead'),
              variant: 'secondary',
              icon: ExternalLink,
              onClick: () => {
                window.location.href = editLink;
              },
            },
          ]}
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <StickyNote className="size-4 text-muted-foreground" />
          {t('heading')}
        </h3>
        <Button asChild variant="outline" size="sm">
          <Link href={editLink}>
            <ExternalLink className="size-3.5 me-1.5" />
            {t('editInLead')}
          </Link>
        </Button>
      </header>
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
        {customer.notes}
      </pre>
    </Card>
  );
}
