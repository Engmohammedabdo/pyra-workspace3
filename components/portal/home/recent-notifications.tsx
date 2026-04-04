'use client';

import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Bell, ChevronLeft, Share2, Eye, CheckCircle, FileText, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { useRouter } from 'next/navigation';

interface Notification {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

function getIcon(type: string) {
  switch (type) {
    case 'file_shared': return Share2;
    case 'review_request': return Eye;
    case 'review_response': return CheckCircle;
    case 'new_quote': return FileText;
    case 'file_approved': return FileCheck;
    default: return Bell;
  }
}

export function RecentNotifications({ notifications, onMarkRead }: { notifications: Notification[], onMarkRead: (id: string) => void }) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-portal" />
          آخر الإشعارات
        </CardTitle>
        <button onClick={() => router.push('/portal/notifications')} className="text-xs text-portal hover:text-portal-secondary flex items-center gap-1 transition-colors">
          عرض الكل
          <ChevronLeft className="h-3 w-3" />
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {notifications.length === 0 ? (
          <EmptyState icon={Bell} title="لا توجد إشعارات" className="py-6" />
        ) : (
          notifications.map((notif) => {
            const Icon = getIcon(notif.type);
            return (
              <button key={notif.id} onClick={() => !notif.is_read && onMarkRead(notif.id)} className={cn('w-full flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-all duration-200 text-start', !notif.is_read && 'bg-portal/5 border-portal/20 hover:bg-portal/10')}>
                <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5', notif.is_read ? 'bg-muted' : 'bg-portal/10')}>
                  <Icon className={cn('h-4 w-4', notif.is_read ? 'text-muted-foreground' : 'text-portal')} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed">{notif.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatRelativeDate(notif.created_at)}</p>
                </div>
                {!notif.is_read && <div className="w-2 h-2 rounded-full bg-portal shrink-0 mt-2 animate-pulse" />}
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
