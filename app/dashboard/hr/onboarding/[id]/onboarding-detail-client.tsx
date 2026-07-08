'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowRight,
  UserCheck,
  XCircle,
  ClipboardList,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useOnboarding, useUpdateOnboarding } from '@/hooks/useOnboarding';
import {
  ONBOARDING_STATUS,
  ONBOARDING_STATUS_LABELS,
  type OnboardingStatus,
} from '@/lib/constants/onboarding';
import { OnboardingChecklist } from '@/components/hr/onboarding/OnboardingChecklist';
import { OnboardingDocuments } from '@/components/hr/onboarding/OnboardingDocuments';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { OfferData } from '@/types/database';

// ──────────────────────────────────────────────────────────────────────────────
// Status badge colours (matching list page)
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_CLASS: Record<string, string> = {
  in_progress: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  cancelled: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

// ──────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ──────────────────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-5 w-40" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

export default function OnboardingDetailClient({ id }: { id: string }) {
  const { data: onboarding, isLoading, error } = useOnboarding(id);
  const updateOnboarding = useUpdateOnboarding();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);

  // 404 / error
  if (!isLoading && (error || !onboarding)) {
    return (
      <div className="p-6">
        <EmptyState
          icon={ClipboardList}
          title="سجل التعيين غير موجود"
          description="ربما تم حذف هذا السجل أو الرابط غير صحيح"
          actionLabel="العودة لقائمة التعيينات"
          onAction={() => window.history.back()}
        />
      </div>
    );
  }

  if (isLoading || !onboarding) {
    return <DetailSkeleton />;
  }

  const isInProgress = onboarding.status === ONBOARDING_STATUS.IN_PROGRESS;
  const offerData = onboarding.offer_data as OfferData | null | undefined;
  // Salary figures are denominated in the offer's currency (multi-currency
  // payroll doctrine) — AED is only a fallback for pre-currency records.
  const offerCurrency = offerData?.currency || 'AED';
  const employeeName =
    offerData?.nameAr ||
    offerData?.nameEn ||
    onboarding.employee_username;

  async function handleCancel() {
    try {
      await updateOnboarding.mutateAsync({
        id: onboarding!.id,
        action: 'cancel',
      });
      toast.success('تم إلغاء التعيين');
      setCancelDialogOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'فشل الإلغاء';
      toast.error(msg);
    }
  }

  async function handleComplete() {
    try {
      await updateOnboarding.mutateAsync({
        id: onboarding!.id,
        action: 'complete',
      });
      toast.success('تم إنهاء التعيين بنجاح');
      setCompleteDialogOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'فشل إنهاء التعيين';
      toast.error(msg);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/hr/onboarding"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        قائمة التعيينات
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{employeeName}</h1>
            <Link
              href={`/dashboard/users/${onboarding.employee_username}`}
              className="inline-flex items-center gap-1.5 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
            >
              <User className="h-4 w-4" />
              عرض ملف الموظف
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              className={`text-xs ${STATUS_CLASS[onboarding.status] ?? ''}`}
              variant="outline"
            >
              {ONBOARDING_STATUS_LABELS[onboarding.status as OnboardingStatus] ??
                onboarding.status}
            </Badge>
            {onboarding.started_at && (
              <span className="text-sm text-muted-foreground">
                بدأ {formatDate(onboarding.started_at)}
              </span>
            )}
            {onboarding.completed_at && (
              <span className="text-sm text-muted-foreground">
                · اكتمل {formatDate(onboarding.completed_at)}
              </span>
            )}
          </div>
          {onboarding.notes && (
            <p className="text-sm text-muted-foreground mt-1">
              {onboarding.notes}
            </p>
          )}
        </div>

        {/* Actions */}
        {isInProgress && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5 h-10"
              onClick={() => setCancelDialogOpen(true)}
              disabled={updateOnboarding.isPending}
            >
              <XCircle className="h-4 w-4" />
              إلغاء التعيين
            </Button>
            <Button
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-10"
              onClick={() => setCompleteDialogOpen(true)}
              disabled={updateOnboarding.isPending}
            >
              <UserCheck className="h-4 w-4" />
              إنهاء التعيين
            </Button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-2">
        <OnboardingChecklist
          onboarding={onboarding}
          onRequestComplete={() => setCompleteDialogOpen(true)}
        />
        <OnboardingDocuments onboarding={onboarding} />
      </div>

      {/* Offer data summary */}
      {offerData && Object.keys(offerData).length > 0 && (
        <div className="rounded-xl border bg-muted/30 dark:bg-muted/10 p-5 space-y-3">
          <h2 className="font-semibold">تفاصيل العرض</h2>
          <div className="grid gap-y-2 gap-x-8 grid-cols-2 sm:grid-cols-3 text-sm">
            {[
              ['القسم', offerData.deptAr || offerData.deptEn],
              ['المسمى', offerData.titleAr || offerData.titleEn],
              ['تاريخ الالتحاق', offerData.startDate],
              [
                'الراتب الأساسي',
                offerData.basic
                  ? formatCurrency(Number(offerData.basic), offerCurrency)
                  : undefined,
              ],
              [
                'الإجمالي الشهري',
                (() => {
                  const total =
                    Number(offerData.basic || 0) +
                    Number(offerData.housing || 0) +
                    Number(offerData.transport || 0) +
                    Number(offerData.communication || 0) +
                    Number(offerData.other || 0);
                  return total > 0
                    ? formatCurrency(total, offerCurrency)
                    : undefined;
                })(),
              ],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-medium">{value}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Cancel dialog */}
      <AlertDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إلغاء التعيين</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إلغاء تعيين <strong>{employeeName}</strong>؟ لا يمكن
              التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateOnboarding.isPending}>
              تراجع
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleCancel}
              disabled={updateOnboarding.isPending}
            >
              {updateOnboarding.isPending ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete dialog */}
      <AlertDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إنهاء التعيين</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد تعليم تعيين <strong>{employeeName}</strong> كمكتمل؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateOnboarding.isPending}>
              تراجع
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleComplete}
              disabled={updateOnboarding.isPending}
            >
              {updateOnboarding.isPending ? 'جاري الإنهاء...' : 'تأكيد الإنهاء'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
