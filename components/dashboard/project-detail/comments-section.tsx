'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageSquare, Loader2, Send } from 'lucide-react';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { renderTextWithMentions } from '@/lib/utils/mentions';

export function CommentsSection({ 
  comments, projectId, onAdd, loading, newComment, setNewComment, commentLoading 
}: { comments: any[], projectId: string, onAdd: () => void, loading: boolean, newComment: string, setNewComment: (v: string) => void, commentLoading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> التعليقات
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 w-full animate-pulse bg-muted" />)}
          </div>
        ) : comments.length === 0 ? (
          <EmptyState icon={MessageSquare} title="لا توجد تعليقات بعد" description="أضف تعليقاً للتواصل مع الفريق أو العميل" />
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="divide-y">
              {comments.map((comment: any) => {
                const isTeam = comment.author_type === 'team';
                return (
                  <div key={comment.id} className={cn('p-3', !comment.is_read_by_team && !isTeam && 'bg-orange-500/5')}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold">{comment.author_name}</span>
                      <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', isTeam ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-orange-500/10 text-orange-600 border-orange-500/20')}>
                        {isTeam ? 'فريق العمل' : 'العميل'}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground ms-auto">{formatRelativeDate(comment.created_at)}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/80">{renderTextWithMentions(comment.text, 'dashboard')}</p>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
        <div className="border-t p-3">
          <form onSubmit={(e) => { e.preventDefault(); onAdd(); }} className="space-y-2">
            <MentionTextarea value={newComment} onChange={setNewComment} projectId={projectId} variant="dashboard" placeholder="اكتب ردك هنا... (استخدم @ للإشارة)" rows={2} className="w-full" />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={commentLoading || !newComment.trim()} className="gap-1.5">
                {commentLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                إرسال
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
