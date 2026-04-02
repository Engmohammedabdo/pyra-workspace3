'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface Approval {
  id: string;
  quote_id: string;
  status: string;
  approved_by?: string;
  responded_at?: string;
  comments?: string;
  pyra_quotes?: {
    id: string;
    quote_number: string;
  };
}

export function ApprovalHistoryItem({ approval }: { approval: Approval }) {
  return (
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
  );
}
