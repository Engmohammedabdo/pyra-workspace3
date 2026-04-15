import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

interface Props {
  waStats: {
    total_conversations: number;
    messages_today: number;
    messages_received_today: number;
  };
}

export function WhatsAppQuickStats({ waStats }: Props) {
  return (
    <Card className="overflow-hidden border-0 shadow-xl shadow-black/5 dark:shadow-black/20 bg-gradient-to-bl from-emerald-50/80 to-teal-50/40 dark:from-emerald-950/20 dark:to-teal-950/10">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-sm">واتساب</span>
          </div>
          <Link href="/dashboard/sales/chat" className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
            فتح الشات <ChevronLeft className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="text-center"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{waStats.total_conversations}</p><p className="text-[11px] text-muted-foreground">محادثة</p></div>
          <div className="text-center"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{waStats.messages_received_today}</p><p className="text-[11px] text-muted-foreground">نشطة اليوم</p></div>
          <div className="text-center"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{waStats.messages_today}</p><p className="text-[11px] text-muted-foreground">غير مقروءة</p></div>
        </div>
      </CardContent>
    </Card>
  );
}
