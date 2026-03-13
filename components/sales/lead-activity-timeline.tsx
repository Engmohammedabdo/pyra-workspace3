'use client';

import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import {
  MessageSquare, ArrowRightLeft, Tag, GitBranch,
  Phone, StickyNote, CheckCircle2, UserCheck
} from 'lucide-react';

interface Activity {
  id: string;
  activity_type: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
}

interface LeadActivityTimelineProps {
  activities: Activity[];
}

const ACTIVITY_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  note: { icon: StickyNote, color: 'text-blue-500 bg-blue-100 dark:bg-blue-900' },
  call: { icon: Phone, color: 'text-green-500 bg-green-100 dark:bg-green-900' },
  stage_change: { icon: GitBranch, color: 'text-purple-500 bg-purple-100 dark:bg-purple-900' },
  label_change: { icon: Tag, color: 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900' },
  transfer: { icon: ArrowRightLeft, color: 'text-orange-500 bg-orange-100 dark:bg-orange-900' },
  message: { icon: MessageSquare, color: 'text-indigo-500 bg-indigo-100 dark:bg-indigo-900' },
  conversion: { icon: UserCheck, color: 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900' },
};

const ACTIVITY_LABELS: Record<string, string> = {
  note: 'ملاحظة',
  call: 'مكالمة',
  stage_change: 'تغيير مرحلة',
  label_change: 'تغيير تصنيف',
  transfer: 'تحويل',
  message: 'رسالة',
  conversion: 'تحويل لعميل',
};

export function LeadActivityTimeline({ activities }: LeadActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">لا توجد نشاطات بعد</p>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity, i) => {
        const config = ACTIVITY_ICONS[activity.activity_type] || {
          icon: CheckCircle2,
          color: 'text-gray-500 bg-gray-100 dark:bg-gray-800',
        };
        const Icon = config.icon;
        const isLast = i === activities.length - 1;

        return (
          <div key={activity.id} className="flex gap-3">
            {/* Icon + line */}
            <div className="flex flex-col items-center">
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', config.color)}>
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
            </div>

            {/* Content */}
            <div className="pb-4 flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {ACTIVITY_LABELS[activity.activity_type] || activity.activity_type}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatRelativeDate(activity.created_at)}
                </span>
              </div>
              {activity.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{activity.description}</p>
              )}
              {activity.created_by && (
                <p className="text-xs text-muted-foreground mt-1">بواسطة: {activity.created_by}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
