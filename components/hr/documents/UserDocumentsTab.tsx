'use client';

import { useState, useMemo } from 'react';
import { FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { useEmployeeDocumentsByUser } from '@/hooks/useEmployeeDocuments';
import { useUsers } from '@/hooks/useUsers';
import { classifyExpiry, EXPIRY_BADGE } from '@/lib/hr/document-expiry';
import { dubaiDayKey, formatDate } from '@/lib/utils/format';
import { DocumentRowActions } from '@/components/hr/documents/DocumentRowActions';
import { UploadDocumentDialog } from '@/components/hr/documents/UploadDocumentDialog';

interface Props { username: string }

export function UserDocumentsTab({ username }: Props) {
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
          {docs.length > 0 ? `${docs.length} وثيقة` : ''}
        </span>
        <Button
          size="sm"
          className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5"
          onClick={() => setUploadOpen(true)}
        >
          <Upload className="h-3.5 w-3.5" />
          رفع وثيقة
        </Button>
      </div>

      {/* Document list or empty state */}
      {docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="لا توجد وثائق"
          description="لم يتم رفع أي وثائق لهذا الموظف بعد"
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
                        {doc.type_name_ar ?? '—'}
                        {doc.label ? (
                          <span className="text-muted-foreground font-normal ms-2">
                            {doc.label}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {doc.expiry_date
                          ? `ينتهي ${formatDate(doc.expiry_date)}`
                          : 'بدون تاريخ انتهاء'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] border-0 ${badge.className}`}
                    >
                      {badge.labelAr}
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
