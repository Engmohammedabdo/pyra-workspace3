'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatRelativeDate } from '@/lib/utils/format';
import { EmptyState } from '@/components/ui/empty-state';
import { History } from 'lucide-react';

interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  icon: string;
  color: string;
}

export function ActivityTimeline({ project }: { project: any }) {
  const events = useMemo(() => {
    const list: ActivityEvent[] = [];
    project.files.forEach((f: any) => {
      list.push({ id: `file-${f.id}`, type: 'file_added', title: 'تم إضافة ملف', description: f.file_name, date: f.added_at, icon: '📄', color: 'border-blue-500' });
      if (f.approval) {
        list.push({
          id: `approval-${f.id}`,
          type: 'approval',
          title: f.approval.status === 'approved' ? 'تمت الموافقة على ملف' : 'تم طلب تعديل',
          description: f.file_name + (f.approval.comment ? ` — ${f.approval.comment}` : ''),
          date: f.approval.reviewed_at || f.added_at,
          icon: f.approval.status === 'approved' ? '✅' : '🔄',
          color: f.approval.status === 'approved' ? 'border-green-500' : 'border-amber-500',
        });
      }
    });
    project.comments.forEach((c: any) => {
      list.push({
        id: `comment-${c.id}`,
        type: 'comment',
        title: c.author_type === 'team' ? `تعليق من ${c.author_name}` : `تعليق العميل`,
        description: c.text.length > 80 ? c.text.slice(0, 80) + '...' : c.text,
        date: c.created_at,
        icon: c.author_type === 'team' ? '💬' : '🗨️',
        color: c.author_type === 'team' ? 'border-blue-400' : 'border-portal',
      });
    });
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [project]);

  if (events.length === 0) return <EmptyState icon={History} title="لا توجد أنشطة" description="لا توجد أنشطة مسجلة حتى الآن" />;

  const grouped = events.reduce<Record<string, ActivityEvent[]>>((acc, event) => {
    const dateKey = formatDate(event.date);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, dayEvents]) => (
        <div key={date}>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground px-2">{date}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-0 relative">
            <div className="absolute start-[15px] top-2 bottom-2 w-px bg-border" />
            {dayEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-3 py-2 relative">
                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 bg-background border-2 z-10', event.color)}>
                  {event.icon}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.description}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{formatRelativeDate(event.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
