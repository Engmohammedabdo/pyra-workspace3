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
  Film, MessageSquare, Send, Loader2, ChevronDown, ChevronUp,
  User, Shield,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import type { PyraScriptReview, PyraScriptReviewReply } from '@/types/database';

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

function ReviewCard({
  review,
  onReplySubmitted,
}: {
  review: PyraScriptReview;
  onReplySubmitted: () => void;
}) {
  const config = STATUS_CONFIG[review.status];
  const StatusIcon = config.icon;

  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<PyraScriptReviewReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchReplies = useCallback(async () => {
    setRepliesLoading(true);
    try {
      const res = await fetch(`/api/scripts/reviews/replies?review_id=${review.id}`);
      const json = await res.json();
      setReplies(json.data || []);
    } catch {
      setReplies([]);
    } finally {
      setRepliesLoading(false);
    }
  }, [review.id]);

  const handleToggleReplies = useCallback(() => {
    const next = !showReplies;
    setShowReplies(next);
    if (next && replies.length === 0) {
      fetchReplies();
    }
  }, [showReplies, replies.length, fetchReplies]);

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/scripts/reviews/replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: review.id, message: replyText.trim() }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed');
      }
      toast.success('تم إرسال الرد');
      setReplyText('');
      fetchReplies();
      onReplySubmitted();
    } catch {
      toast.error('فشل في إرسال الرد');
    } finally {
      setSending(false);
    }
  }, [replyText, review.id, fetchReplies, onReplySubmitted]);

  return (
    <Card className="hover:shadow-sm transition-shadow">
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

      {/* Client comment */}
      {review.comment && (
        <CardContent className="pt-0 px-5 pb-3">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">
                تعليق العميل:
              </p>
              <p className="text-foreground/80 text-xs leading-relaxed">
                {review.comment}
              </p>
            </div>
          </div>
        </CardContent>
      )}

      {/* Replies toggle + thread */}
      <CardContent className="pt-0 px-5 pb-4">
        <button
          onClick={handleToggleReplies}
          className="flex items-center gap-1.5 text-xs text-[#003866] hover:text-[#003866]/70 transition-colors"
        >
          {showReplies ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {showReplies ? 'إخفاء المحادثة' : 'عرض المحادثة والرد'}
        </button>

        {showReplies && (
          <div className="mt-3 space-y-3">
            {/* Reply thread */}
            {repliesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : replies.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {replies.map((reply) => (
                  <div
                    key={reply.id}
                    className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
                      reply.sender_type === 'admin'
                        ? 'bg-blue-50 border border-blue-100'
                        : 'bg-gray-50 border border-gray-100'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      reply.sender_type === 'admin'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {reply.sender_type === 'admin' ? (
                        <Shield className="h-3 w-3" />
                      ) : (
                        <User className="h-3 w-3" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {reply.sender_name}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {reply.sender_type === 'admin' ? 'الإدارة' : 'العميل'}
                        </span>
                        <span className="text-muted-foreground/60 text-[10px]">
                          {formatRelativeDate(reply.created_at)}
                        </span>
                      </div>
                      <p className="text-foreground/80 leading-relaxed mt-0.5">
                        {reply.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">
                لا توجد ردود بعد
              </p>
            )}

            {/* Reply input */}
            <div className="flex items-start gap-2">
              <textarea
                value={replyText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReplyText(e.target.value)}
                placeholder="اكتب ردك هنا..."
                className="flex-1 min-h-[60px] text-xs resize-none rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#003866]/30 focus:border-transparent"
                dir="rtl"
                maxLength={5000}
              />
              <Button
                size="sm"
                onClick={handleSendReply}
                disabled={sending || !replyText.trim()}
                className="gap-1.5 bg-[#003866] hover:bg-[#003866]/90 text-white shrink-0"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                رد
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onReplySubmitted={fetchReviews}
            />
          ))}
        </div>
      )}
    </div>
  );
}
