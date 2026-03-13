'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate, formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { CheckCircle, XCircle, FileText, Loader2, Clock, ExternalLink, ShieldCheck } from 'lucide-react';

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

const containerMotion = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemMotion = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

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
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-8 w-40" />
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)}
      </div>
    );
  }

  const pending = approvals.filter(a => a.status === 'pending');
  const responded = approvals.filter(a => a.status !== 'pending');

  return (
    <motion.div
      variants={containerMotion}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemMotion} className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">موافقات العروض</h1>
          <p className="text-sm text-muted-foreground">
            {pending.length > 0 ? (
              <span className="text-orange-500 font-medium">{pending.length} طلب بانتظار الموافقة</span>
            ) : (
              'جميع الطلبات تمت معالجتها'
            )}
          </p>
        </div>
      </motion.div>

      <motion.div variants={itemMotion}>
        <Tabs defaultValue="pending">
          <TabsList className="bg-muted/50 rounded-xl p-1">
            <TabsTrigger value="pending" className="rounded-lg gap-2 data-[state=active]:shadow-sm">
              معلقة
              {pending.length > 0 && (
                <div className="min-w-[22px] h-[22px] rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pending.length}
                </div>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-lg data-[state=active]:shadow-sm">
              السجل
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-6 space-y-4">
            {pending.length === 0 ? (
              <EmptyState
                icon={CheckCircle}
                title="لا توجد طلبات معلقة"
                description="جميع طلبات الموافقة تمت معالجتها"
              />
            ) : (
              pending.map((approval, idx) => (
                <motion.div
                  key={approval.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06 }}
                >
                  <ApprovalCard
                    approval={approval}
                    comments={comments[approval.id] || ''}
                    onCommentsChange={v => setComments(c => ({ ...c, [approval.id]: v }))}
                    onApprove={() => handleAction(approval.id, 'approve')}
                    onReject={() => handleAction(approval.id, 'reject')}
                    processing={processing === approval.id}
                  />
                </motion.div>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-6 space-y-3">
            {responded.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="لا يوجد سجل"
                description="ستظهر الموافقات والرفض هنا"
              />
            ) : (
              responded.map((approval, idx) => (
                <motion.div
                  key={approval.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                >
                  <Card className="border-0 shadow-md shadow-black/5 dark:shadow-black/15 bg-card/80 backdrop-blur">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <p className="font-semibold text-sm">
                              {approval.pyra_quotes?.quote_number || approval.quote_id}
                            </p>
                            <Badge
                              className={cn(
                                'text-[10px] border-0',
                                approval.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                              )}
                            >
                              {approval.status === 'approved' ? 'تمت الموافقة' : 'مرفوض'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            بواسطة: {approval.approved_by} • {approval.responded_at ? formatRelativeDate(approval.responded_at) : ''}
                          </p>
                          {approval.comments && (
                            <p className="text-xs text-muted-foreground/70 mt-1 italic">تعليق: {approval.comments}</p>
                          )}
                        </div>
                        <Link href={`/dashboard/quotes/${approval.pyra_quotes?.id || approval.quote_id}`}>
                          <Button variant="ghost" size="sm" className="rounded-xl hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:text-orange-600">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
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
    <Card className="border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-card/80 backdrop-blur overflow-hidden border-s-[3px] border-s-orange-500">
      <CardContent className="py-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center">
                <Clock className="h-4 w-4 text-white" />
              </div>
              <p className="font-bold text-base">{quote?.quote_number || approval.quote_id}</p>
              <Badge variant="secondary" className="text-[10px] bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 border-0">
                بانتظار الموافقة
              </Badge>
            </div>
            {quote && (
              <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {quote.project_name && <p>المشروع: <span className="text-foreground font-medium">{quote.project_name}</span></p>}
                {quote.client_name && (
                  <p>العميل: <span className="text-foreground font-medium">{quote.client_name}</span> {quote.client_company ? `(${quote.client_company})` : ''}</p>
                )}
                <p className="text-foreground font-bold text-base mt-2">{formatCurrency(quote.total, quote.currency)}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground/60 mt-3">
              طلب بواسطة: {approval.requested_by} • {formatRelativeDate(approval.requested_at)}
            </p>
          </div>
          <Link href={`/dashboard/quotes/${quote?.id || approval.quote_id}`}>
            <Button variant="ghost" size="sm" className="rounded-xl hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:text-orange-600">
              <ExternalLink className="h-4 w-4 me-1.5" />
              عرض
            </Button>
          </Link>
        </div>

        <Textarea
          value={comments}
          onChange={e => onCommentsChange(e.target.value)}
          placeholder="تعليق (اختياري)..."
          rows={2}
          className="rounded-xl border-border/60 bg-muted/20 focus:ring-orange-500/30"
        />

        <div className="flex justify-end gap-2.5">
          <Button
            variant="outline"
            onClick={onReject}
            disabled={processing}
            className="rounded-xl text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin me-1.5" /> : <XCircle className="h-4 w-4 me-1.5" />}
            رفض
          </Button>
          <Button
            onClick={onApprove}
            disabled={processing}
            className="rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-lg shadow-emerald-500/20"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin me-1.5" /> : <CheckCircle className="h-4 w-4 me-1.5" />}
            موافقة
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
