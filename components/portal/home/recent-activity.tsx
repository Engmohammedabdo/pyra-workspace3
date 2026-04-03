'use client';

import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Activity, LogIn, Eye, Download, FileSearch, PenLine, CheckCircle, ArrowLeftRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';

interface Entry {
  id: string;
  action_type: string;
  display_name: string | null;
  created_at: string;
}

const actionTypeLabels: Record<string, string> = {
  portal_login: 'تسجيل دخول',
  file_preview: 'معاينة ملف',
  file_download: 'تحميل ملف',
  quote_viewed: 'عرض سعر',
  quote_signed: 'توقيع عرض سعر',
  file_approved: 'موافقة على ملف',
  file_rejected: 'رفض ملف',
  comment_added: 'إضافة تعليق',
};

function getActionLabel(type: string) { return actionTypeLabels[type] || type; }

function getActionIcon(type: string) {
  switch (type) {
    case 'portal_login': return LogIn;
    case 'file_preview': return Eye;
    case 'file_download': return Download;
    case 'quote_viewed': return FileSearch;
    case 'quote_signed': return PenLine;
    case 'file_approved': return CheckCircle;
    case 'file_rejected': return ArrowLeftRight;
    case 'comment_added': return FileText;
    default: return Activity;
  }
}

function getActionColor(type: string) {
  switch (type) {
    case 'portal_login': return 'bg-blue-500';
    case 'file_preview': return 'bg-purple-500';
    case 'file_download': return 'bg-green-500';
    case 'quote_viewed': return 'bg-amber-500';
    case 'quote_signed': return 'bg-portal';
    case 'file_approved': return 'bg-emerald-500';
    case 'file_rejected': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
}

export function RecentActivity({ activity }: { activity: Entry[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-portal" />
          آخر النشاطات
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activity.length > 0 ? (
          <div className="relative space-y-0">
            <div className="absolute top-2 bottom-2 end-[11px] w-px bg-border" />
            {activity.map((entry, index) => {
              const ActionIcon = getActionIcon(entry.action_type);
              const dotColor = getActionColor(entry.action_type);
              return (
                <motion.div key={entry.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className="relative flex items-start gap-3 py-3">
                  <div className={cn('relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0', dotColor)}>
                    <ActionIcon className="h-3 w-3 text-white" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-medium">{getActionLabel(entry.action_type)}</p>
                    {entry.display_name && <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.display_name}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{formatRelativeDate(entry.created_at)}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">لا توجد نشاطات حديثة</p>
        )}
      </CardContent>
    </Card>
  );
}
