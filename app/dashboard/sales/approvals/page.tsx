'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { CheckCircle, FileText, ShieldCheck } from 'lucide-react';
import { ApprovalCard } from '@/components/dashboard/approvals/approval-card';
import { ApprovalHistoryItem } from '@/components/dashboard/approvals/approval-history-item';
import { toast } from 'sonner';

interface Approval {
  id: string;
  quote_id: string;
  requested_by: string;
  approved_by?: string;
  status: string;
  comments?: string;
  requested_at: string;
  responded_at?: string;
  pyra_quotes?: {
    id: string;
    quote_number: string;
    project_name?: string;
    client_name?: string;
    client_company?: string;
    total: number;
    currency: string;
    status: string;
  };
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
  const queryClient = useQueryClient();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const { data: approvals = [], isLoading: loading } = useQuery<Approval[]>({
    queryKey: ['sales-approvals'],
    queryFn: () => fetchAPI('/api/dashboard/sales/approvals'),
  });

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
      queryClient.invalidateQueries({ queryKey: ['sales-approvals'] });
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
                  <ApprovalHistoryItem approval={approval} />
                </motion.div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}
