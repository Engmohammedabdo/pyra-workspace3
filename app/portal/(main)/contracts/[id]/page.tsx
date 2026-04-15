'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowRight, FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import { ContractDetails } from '@/components/portal/contract-detail/contract-details';
import { MilestonesList } from '@/components/portal/contract-detail/milestones-list';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'نشط', variant: 'default' },
  in_progress: { label: 'قيد التنفيذ', variant: 'default' },
  completed: { label: 'مكتمل', variant: 'secondary' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

export default function PortalContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [contract, setContract] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/contracts/${id}`)
      .then(r => r.json())
      .then(j => { if (j.data) setContract(j.data); })
      .catch(() => toast.error('فشل في تحميل العقد'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>;
  if (!contract) return <EmptyState icon={FileSignature} title="العقد غير موجود" actionLabel="العودة للعقود" onAction={() => router.push('/portal/contracts')} />;

  const statusInfo = STATUS_MAP[contract.status] || { label: contract.status, variant: 'outline' as const };
  const isMilestone = contract.contract_type === 'milestone' || contract.contract_type === 'upfront_delivery';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/portal/contracts" aria-label="العودة إلى العقود"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
        <h1 className="text-2xl font-bold truncate">{contract.title || 'بدون عنوان'}</h1>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </div>

      <ContractDetails contract={contract} />

      {isMilestone && contract.milestones && contract.milestones.length > 0 && (
        <MilestonesList milestones={contract.milestones} contract={contract} />
      )}
    </div>
  );
}
