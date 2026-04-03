'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Clock, ExternalLink, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { formatRelativeDate, formatCurrency } from '@/lib/utils/format';

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

interface ApprovalCardProps {
  approval: Approval;
  comments: string;
  onCommentsChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  processing: boolean;
}

export function ApprovalCard({
  approval,
  comments,
  onCommentsChange,
  onApprove,
  onReject,
  processing,
}: ApprovalCardProps) {
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
