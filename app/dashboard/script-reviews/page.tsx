'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ScrollText, CheckCircle, AlertTriangle, Clock, RefreshCw,
  Film, MessageSquare,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import type { PyraScriptReview } from '@/types/database';

const STATUS_CONFIG = {
  approved: {
    label: 'معتمد',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: CheckCircle,
  },
  revision_requested: {
    label: 'مطلوب تعديل',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: AlertTriangle,
  },
  pending: {
    label: 'بانتظار المراجعة',
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    icon: Clock,
  },
} as const;

export default function ScriptReviewsPage() {
  const [reviews, setReviews] = useState<PyraScriptReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/scripts/reviews?${params}`);
      const json = await res.json();
      setReviews(json.data || []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const approvedCount = reviews.filter((r) => r.status === 'approved').length;
  const revisionCount = reviews.filter((r) => r.status === 'revision_requested').length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#003866] flex items-center justify-center">
            <ScrollText className="h-5 w-5 text-[#b89a77]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">مراجعات السكريبتات</h1>
            <p className="text-sm text-muted-foreground">
              حالة اعتماد سكريبتات إتمام من العميل
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            {approvedCount} معتمد
          </Badge>
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            {revisionCount} تعديل
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchReviews}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="approved">معتمد</SelectItem>
            <SelectItem value="revision_requested">مطلوب تعديل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <ScrollText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold mb-2">لا توجد مراجعات</h2>
            <p className="text-sm text-muted-foreground">
              {statusFilter === 'all'
                ? 'لم يقم العميل بمراجعة أي سكريبت بعد'
                : 'لا توجد مراجعات بهذه الحالة'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => {
            const config = STATUS_CONFIG[review.status];
            const StatusIcon = config.icon;

            return (
              <Card key={review.id} className="hover:shadow-sm transition-shadow">
                <CardHeader className="py-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#003866]/10 flex items-center justify-center shrink-0">
                        <Film className="h-5 w-5 text-[#003866]" />
                      </div>
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <span className="text-[#b89a77] font-bold">
                            #{String(review.video_number).padStart(2, '0')}
                          </span>
                          {review.filename.replace(/\.md$/, '').replace(/^video-\d+-/, '')}
                          <Badge className="text-[10px]" variant="outline">
                            V{review.version}
                          </Badge>
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {review.client_name}
                          {review.reviewed_at &&
                            ` • ${formatRelativeDate(review.reviewed_at)}`}
                        </p>
                      </div>
                    </div>
                    <Badge className={`shrink-0 text-[10px] ${config.color}`}>
                      <StatusIcon className="h-3 w-3 me-1" />
                      {config.label}
                    </Badge>
                  </div>
                </CardHeader>
                {review.comment && (
                  <CardContent className="pt-0 px-5 pb-4">
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-foreground/80 text-xs leading-relaxed">
                        {review.comment}
                      </p>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
