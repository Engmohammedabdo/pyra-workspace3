'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileSignature } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ProjectHeaderProps {
  name: string;
  description: string | null;
  status: 'active' | 'in_progress' | 'review' | 'completed' | 'archived';
  statusConfig: Record<string, { label: string; className: string }>;
  linkedContract?: {
    id: string;
    title: string | null;
    contract_type: string | null;
    total_value: number;
    currency: string;
    status: string;
  } | null;
}

export function ProjectHeader({
  name,
  description,
  status,
  statusConfig,
  linkedContract,
}: ProjectHeaderProps) {
  const router = useRouter();
  const statusInfo = statusConfig[status] ?? statusConfig.active;

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/portal/projects')}
        className="gap-2"
      >
        <ArrowRight className="h-4 w-4" />
        العودة للمشاريع
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{name}</h1>
          <Badge className={cn(statusInfo.className)}>{statusInfo.label}</Badge>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {linkedContract && (
        <Link href={`/portal/contracts/${linkedContract.id}`}>
          <Card className="hover:shadow-md hover:border-portal/30 transition-all duration-200 cursor-pointer">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-portal/10 flex items-center justify-center shrink-0">
                <FileSignature className="h-5 w-5 text-portal" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {linkedContract.title || 'عقد المشروع'}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>
                    {linkedContract.contract_type === 'retainer'
                      ? 'ثابت شهري'
                      : linkedContract.contract_type === 'milestone'
                      ? 'مراحل'
                      : linkedContract.contract_type === 'fixed'
                      ? 'سعر ثابت'
                      : linkedContract.contract_type || ''}
                  </span>
                  <span className="font-mono">
                    {formatCurrency(linkedContract.total_value, linkedContract.currency)}
                  </span>
                </div>
              </div>
              <Badge
                variant={linkedContract.status === 'active' ? 'default' : 'secondary'}
              >
                {linkedContract.status === 'active'
                  ? 'نشط'
                  : linkedContract.status === 'completed'
                  ? 'مكتمل'
                  : linkedContract.status}
              </Badge>
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  );
}
