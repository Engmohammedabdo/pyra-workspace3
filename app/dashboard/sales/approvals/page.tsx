'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate, formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import Link from 'next/link';
import { CheckCircle, XCircle, FileText, Loader2, Clock, ExternalLink } from 'lucide-react';

interface QuoteInfo {
  id: string;
  quote_number: string;
  project_name?: string;
  client_name?: string;
  client_company?: string;
  total: number;
  currency: string;
  status: string;
}

interface Approval {
  id: string;
  quote_id: string;
  requested_by: string;
  approved_by?: string;
  status: string;
  comments?: string;
  requested_at: string;
  responded_at?: string;
  pyra_quotes?: QuoteInfo;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  async function fetchApprovals() {
    try {
      const res = await fetch('/api/dashboard/sales/approvals');
      const data = await res.json();
      setApprovals(data.data || []);
    } catch {
      console.error('Failed to fetch approvals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchApprovals();
  }, []);

  async function handleAction(approvalId: string, action: 'approve' | 'reject') {
    setProcessing(approvalId);
    try {
      const res = await fetch(`/api/dashboard/sales/approvals/${approvalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comments: comments[approvalId] || '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل العملية');

      toast.success(action === 'approve' ? 'تمت الموافقة على العرض' : 'تم رفض العرض');
      fetchApprovals();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setProcessing(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">موافقات العروض</h1>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }

  const pending = approvals.filter(a => a.status === 'pending');
  const responded = approvals.filter(a => a.status !== 'pending');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">موافقات العروض</h1>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            معلقة
            {pending.length > 0 && (
              <Badge className="bg-orange-500 text-white text-[10px] h-5">{pending.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">السجل</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-4">
          {pending.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="لا توجد طلبات معلقة"
              description="جميع طلبات الموافقة تمت معالجتها"
            />
          ) : (
            pending.map(approval => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                comments={comments[approval.id] || ''}
                onCommentsChange={v => setComments(c => ({ ...c, [approval.id]: v }))}
                onApprove={() => handleAction(approval.id, 'approve')}
                onReject={() => handleAction(approval.id, 'reject')}
                processing={processing === approval.id}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          {responded.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="لا يوجد سجل"
              description="ستظهر الموافقات والرفض هنا"
            />
          ) : (
            responded.map(approval => (
              <Card key={approval.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">
                          {approval.pyra_quotes?.quote_number || approval.quote_id}
                        </p>
                        <Badge
                          className={cn(
                            'text-[10px]',
                            approval.status === 'approved'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                          )}
                        >
                          {approval.status === 'approved' ? 'تمت الموافقة' : 'مرفوض'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        بواسطة: {approval.approved_by} • {approval.responded_at ? formatRelativeDate(approval.responded_at) : ''}
                      </p>
                      {approval.comments && (
                        <p className="text-xs text-muted-foreground mt-1">تعليق: {approval.comments}</p>
                      )}
                    </div>
                    <Link href={`/dashboard/quotes/${approval.pyra_quotes?.id || approval.quote_id}`}>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ApprovalCard({
  approval,
  comments,
  onCommentsChange,
  onApprove,
  onReject,
  processing,
}: {
  approval: Approval;
  comments: string;
  onCommentsChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  processing: boolean;
}) {
  const quote = approval.pyra_quotes;

  return (
    <Card className="border-orange-200 dark:border-orange-900">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              <p className="font-medium">{quote?.quote_number || approval.quote_id}</p>
              <Badge variant="outline" className="text-[10px]">بانتظار الموافقة</Badge>
            </div>
            {quote && (
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                {quote.project_name && <p>المشروع: {quote.project_name}</p>}
                {quote.client_name && <p>العميل: {quote.client_name} {quote.client_company ? `(${quote.client_company})` : ''}</p>}
                <p className="font-medium text-foreground">المبلغ: {formatCurrency(quote.total, quote.currency)}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              طلب بواسطة: {approval.requested_by} • {formatRelativeDate(approval.requested_at)}
            </p>
          </div>
          <Link href={`/dashboard/quotes/${quote?.id || approval.quote_id}`}>
            <Button variant="ghost" size="sm">
              <ExternalLink className="h-4 w-4 me-1" />
              عرض
            </Button>
          </Link>
        </div>

        <Textarea
          value={comments}
          onChange={e => onCommentsChange(e.target.value)}
          placeholder="تعليق (اختياري)..."
          rows={2}
        />

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onReject}
            disabled={processing}
            className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <XCircle className="h-4 w-4 me-1" />}
            رفض
          </Button>
          <Button
            onClick={onApprove}
            disabled={processing}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <CheckCircle className="h-4 w-4 me-1" />}
            موافقة
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
