'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { useEmployeeDocumentsByUser } from '@/hooks/useEmployeeDocuments';
import { useUsers } from '@/hooks/useUsers';
import { classifyExpiry, EXPIRY_BADGE } from '@/lib/hr/document-expiry';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { dubaiDayKey, formatDate } from '@/lib/utils/format';
import { DocumentRowActions } from '@/components/hr/documents/DocumentRowActions';
import { UploadDocumentDialog } from '@/components/hr/documents/UploadDocumentDialog';
import type { Locale } from '@/lib/i18n/config';

interface Props { username: string }

export function UserDocumentsTab({ username }: Props) {
  const t = useTranslations('hr.documents');
  const locale = useLocale() as Locale;
  const expiryStatusLabel = useStatusLabels('documentExpiry');
  const todayKey = dubaiDayKey();
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: docsResponse, isLoading } = useEmployeeDocumentsByUser(username);
  const { data: allUsers = [] } = useUsers();

  const employees = useMemo(
    () => allUsers.filter((u) => u.role !== 'client' && u.status === 'active'),
    [allUsers],
  );

  const docs = docsResponse?.documents ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {docs.length > 0 ? t('userTab.documentCount', { count: docs.length }) : ''}
        </span>
        <Button
          size="sm"
          className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5"
          onClick={() => setUploadOpen(true)}
        >
          <Upload className="h-3.5 w-3.5" />
          {t('uploadButton')}
        </Button>
      </div>

      {/* Document list or empty state */}
      {docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t('userTab.empty.title')}
          description={t('userTab.empty.description')}
        />
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => {
            const tier = classifyExpiry(doc.expiry_date, todayKey);
            const badge = EXPIRY_BADGE[tier];
            return (
              <Card key={doc.id} className="border-0 shadow-sm">
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-orange-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {(locale === 'ar' ? doc.type_name_ar : (doc.type_name || doc.type_name_ar)) ?? t('typeFallback')}
                        {doc.label ? (
                          <span className="text-muted-foreground font-normal ms-2">
                            {doc.label}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {doc.expiry_date
                          ? t('userTab.expiresOn', { date: formatDate(doc.expiry_date, undefined, locale) })
                          : t('userTab.noExpiry')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] border-0 ${badge.className}`}
                    >
                      {expiryStatusLabel(tier)}
                    </Badge>
                    <DocumentRowActions doc={doc} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload dialog — employee pre-filled and locked */}
      <UploadDocumentDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        employees={employees}
        defaultEmployeeUsername={username}
      />
    </div>
  );
}
