'use client';

import { useMyDocuments } from '@/hooks/useMyDocuments';
import { classifyExpiry, EXPIRY_BADGE } from '@/lib/hr/document-expiry';
import { dubaiDayKey, formatDate } from '@/lib/utils/format';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import {
  FileText,
  Download,
  AlertTriangle,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────

function DocSkeleton() {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── main component ────────────────────────────────────────────────────────

export default function MyDocumentsClient() {
  const { data, isLoading } = useMyDocuments();
  const documents = data?.documents ?? [];
  const today = dubaiDayKey();

  // Filter docs that need attention
  const alertDocs = documents.filter((doc) => {
    const tier = classifyExpiry(doc.expiry_date ?? null, today);
    return tier === 'expired' || tier === 'expiring_7' || tier === 'expiring_30';
  });

  function handleDownload(signedUrl: string | undefined, label: string | null) {
    if (!signedUrl) {
      toast.error('رابط التنزيل غير متاح، تواصل مع الموارد البشرية');
      return;
    }
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">وثائقي</h1>
        <p className="text-sm text-muted-foreground mt-1">
          وثائقك الرسمية المرفوعة من قِبل الموارد البشرية (للقراءة فقط)
        </p>
      </div>

      {/* Expiry notice */}
      {!isLoading && alertDocs.length > 0 && (
        <Card className="border-0 shadow-sm bg-orange-500/5 dark:bg-orange-950/30">
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle className="size-5 text-orange-500 shrink-0" aria-hidden />
            <p className="text-sm text-orange-700 dark:text-orange-300">
              لديك{' '}
              <span className="font-bold">{alertDocs.length}</span>{' '}
              {alertDocs.length === 1 ? 'وثيقة تحتاج' : 'وثائق تحتاج'} إلى تجديد أو تنتهي قريباً — تواصل مع الموارد البشرية
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <DocSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && documents.length === 0 && (
        <EmptyState
          icon={FileText}
          title="لا توجد وثائق"
          description="لم يتم رفع أي وثائق لحسابك بعد، تواصل مع الموارد البشرية"
        />
      )}

      {/* Document cards */}
      {!isLoading && documents.length > 0 && (
        <div className="space-y-3">
          {documents.map((doc) => {
            const tier = classifyExpiry(doc.expiry_date ?? null, today);
            const badge = EXPIRY_BADGE[tier];

            return (
              <Card key={doc.id} className="border-0 shadow-sm">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-3">
                    {/* Icon + info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                        <FileText className="size-5 text-orange-500" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">
                          {doc.type_name_ar ?? 'وثيقة'}
                        </p>
                        {doc.label && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {doc.label}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[11px] border-0 ${badge.className}`}
                          >
                            {badge.labelAr}
                          </Badge>
                          {doc.expiry_date && (
                            <span className="text-[11px] text-muted-foreground">
                              تنتهي: {formatDate(doc.expiry_date)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Download button */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 shrink-0"
                      onClick={() => handleDownload(doc.signed_url, doc.label)}
                    >
                      <Download className="size-4" aria-hidden />
                      <span className="hidden sm:inline">تحميل</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
