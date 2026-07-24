'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DollarSign, Plus, MoreVertical, CheckCircle, Banknote, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import {
  useApproveEmployeePayment,
  usePayEmployeePayment,
  type EmployeePayment,
} from '@/hooks/useEmployeePayments';
import type { Locale } from '@/lib/i18n/config';
import {
  canApproveEmployeePaymentDirectly,
  canPayEmployeePaymentDirectly,
} from '@/lib/payroll/payment-policy';

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

interface Props {
  payments: EmployeePayment[];
  loading: boolean;
  onAdd: () => void;
}

export function EmployeePaymentsTab({ payments, loading, onAdd }: Props) {
  const t = useTranslations('hr.payroll.paymentsTab');
  const locale = useLocale() as Locale;
  const sourceTypeLabelFor = useStatusLabels('paymentSourceType');
  const statusLabelFor = useStatusLabels('employeePayment');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const approveMutation = useApproveEmployeePayment();
  const payMutation = usePayEmployeePayment();

  const handleApprove = (id: string) => {
    setActioningId(id);
    approveMutation.mutate(id, {
      onSuccess: () => toast.success(t('toasts.approveSuccess')),
      onError: () => toast.error(t('toasts.approveError')),
      onSettled: () => setActioningId(null),
    });
  };

  const handlePay = (id: string) => {
    setActioningId(id);
    payMutation.mutate(id, {
      onSuccess: () => toast.success(t('toasts.paySuccess')),
      onError: () => toast.error(t('toasts.payError')),
      onSettled: () => setActioningId(null),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={onAdd}>
          <Plus className="h-4 w-4 me-1" />
          {t('addButton')}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      ) : (
        <div className="overflow-x-auto">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th scope="col" className="text-start pb-3 pe-3 font-medium">{t('columns.employee')}</th>
                    <th scope="col" className="text-start pb-3 pe-3 font-medium">{t('columns.type')}</th>
                    <th scope="col" className="text-start pb-3 pe-3 font-medium">{t('columns.description')}</th>
                    <th scope="col" className="text-end pb-3 pe-3 font-medium">{t('columns.amount')}</th>
                    <th scope="col" className="text-start pb-3 pe-3 font-medium">{t('columns.status')}</th>
                    <th scope="col" className="text-start pb-3 pe-3 font-medium">{t('columns.date')}</th>
                    <th scope="col" className="pb-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-3 pe-3 font-medium text-foreground">
                        {p.display_name || p.username}
                      </td>
                      <td className="py-3 pe-3 text-muted-foreground">
                        {sourceTypeLabelFor(p.source_type)}
                      </td>
                      <td className="py-3 pe-3 text-muted-foreground text-xs max-w-[200px] truncate">
                        {p.description || '—'}
                      </td>
                      <td className="py-3 pe-3 text-end font-mono text-foreground">
                        {formatCurrency(p.amount, p.currency)}
                      </td>
                      <td className="py-3 pe-3">
                        <Badge
                          variant="outline"
                          className={`text-[11px] border-0 ${PAYMENT_STATUS_STYLES[p.status] || ''}`}
                        >
                          {statusLabelFor(p.status)}
                        </Badge>
                      </td>
                      <td className="py-3 pe-3 text-muted-foreground text-xs">
                        {new Date(p.created_at).toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB')}
                      </td>
                      <td className="py-3">
                        {((p.status === 'pending' && canApproveEmployeePaymentDirectly(p.source_type)) ||
                          (p.status === 'approved' && canPayEmployeePaymentDirectly(p.source_type))) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                disabled={actioningId === p.id}
                                aria-label={t('actionsAria')}
                              >
                                {actioningId === p.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreVertical className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {p.status === 'pending' && canApproveEmployeePaymentDirectly(p.source_type) && (
                                <DropdownMenuItem
                                  onClick={() => handleApprove(p.id)}
                                  className="gap-2 text-green-600 dark:text-green-400"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                  {t('approveAction')}
                                </DropdownMenuItem>
                              )}
                              {p.status === 'approved' && canPayEmployeePaymentDirectly(p.source_type) && (
                                <DropdownMenuItem
                                  onClick={() => handlePay(p.id)}
                                  className="gap-2 text-emerald-600 dark:text-emerald-400"
                                >
                                  <Banknote className="h-4 w-4" />
                                  {t('payAction')}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
