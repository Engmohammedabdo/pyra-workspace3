'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageSquare, Search, FileText } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';

interface Comment {
  id: string;
  author_type: 'client' | 'team';
  author_name: string;
  text: string;
  file_id: string | null;
  created_at: string;
}

interface ProjectFile {
  id: string;
  file_name: string;
}

interface ProjectCommentsProps {
  comments: Comment[];
  files: ProjectFile[];
  search: string;
  authorFilter: string;
  fileFilter: string;
  renderTextWithMentions: (text: string) => React.ReactNode;
}

export function ProjectComments({
  comments,
  files,
  search,
  authorFilter,
  fileFilter,
  renderTextWithMentions,
}: ProjectCommentsProps) {
  const fileMap = useMemo(() => {
    const m = new Map<string, string>();
    files.forEach(f => m.set(f.id, f.file_name));
    return m;
  }, [files]);

  const filtered = useMemo(() => {
    let list = comments;
    if (authorFilter !== 'all') list = list.filter(c => c.author_type === authorFilter);
    if (fileFilter === 'general') list = list.filter(c => !c.file_id);
    else if (fileFilter !== 'all') list = list.filter(c => c.file_id === fileFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c => c.text.toLowerCase().includes(q) || c.author_name.toLowerCase().includes(q));
    }
    return list;
  }, [comments, authorFilter, fileFilter, search]);

  if (comments.length === 0) return <EmptyState icon={MessageSquare} title="لا توجد تعليقات" description="كن أول من يعلق على هذا المشروع!" />;

  if (filtered.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Search className="h-6 w-6 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">لا توجد تعليقات تطابق معايير البحث</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{filtered.length} تعليق</p>
      {filtered.map((comment) => {
        const isTeam = comment.author_type === 'team';
        const fileName = comment.file_id ? fileMap.get(comment.file_id) : null;
        return (
          <Card key={comment.id} className={cn(isTeam && 'bg-blue-500/5 border-blue-500/15')}>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-sm font-medium">{comment.author_name}</span>
                <Badge className={cn('text-[10px] px-2 py-0', isTeam ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-portal/10 text-portal border-portal/20')}>
                  {isTeam ? 'فريق العمل' : 'العميل'}
                </Badge>
                {fileName && (
                  <Badge variant="outline" className="text-[10px] px-2 py-0 gap-1 text-muted-foreground">
                    <FileText className="h-2.5 w-2.5" />
                    {fileName}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ms-auto">{formatRelativeDate(comment.created_at)}</span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/80">{renderTextWithMentions(comment.text)}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
