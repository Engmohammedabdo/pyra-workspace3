'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, CheckCircle2, X, Pencil, AlertTriangle, Calendar } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { FollowUp } from './types';

interface FollowUpCardProps {
  followUp: FollowUp;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onEdit: (fu: FollowUp) => void;
  isOverdue?: boolean;
}

export function FollowUpCard({ followUp, onComplete, onCancel, onEdit, isOverdue }: FollowUpCardProps) {
  const dueDate = new Date(followUp.due_at);
  const isToday = dueDate.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className={cn('border-0 shadow-md shadow-black/5 dark:shadow-black/15 bg-card/80 backdrop-blur overflow-hidden transition-all hover:shadow-lg', isOverdue && 'border-s-[3px] border-s-red-500', isToday && !isOverdue && 'border-s-[3px] border-s-orange-500')}>
        <CardContent className="py-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <p className="font-semibold text-sm truncate">{followUp.title || 'متابعة'}</p>
              {isOverdue && <Badge className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-0">متأخرة</Badge>}
              {isToday && !isOverdue && <Badge className="text-[10px] bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 border-0">اليوم</Badge>}
              {followUp.quote_id && <Badge variant="outline" className="text-[10px] border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400">عرض سعر</Badge>}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className={cn('flex items-center gap-1.5', isOverdue && 'text-red-500')}>
                <Clock className="h-3 w-3" />
                {formatRelativeDate(followUp.due_at)}
              </span>
              {followUp.assigned_to && (
                <span className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white text-[8px] font-bold">{followUp.assigned_to.charAt(0).toUpperCase()}</div>
                  {followUp.assigned_to}
                </span>
              )}
            </div>
            {followUp.notes && <p className="text-xs text-muted-foreground/70 mt-1.5 truncate">{followUp.notes}</p>}
            <div className="flex items-center gap-3 mt-1.5">
              <Link href={`/dashboard/sales/leads/${followUp.lead_id}`} className="text-[11px] text-orange-500 hover:text-orange-600 hover:underline font-medium">عرض العميل المحتمل ←</Link>
              {followUp.quote_id && <Link href={`/dashboard/quotes?id=${followUp.quote_id}`} className="text-[11px] text-violet-500 hover:text-violet-600 hover:underline font-medium">عرض السعر ←</Link>}
            </div>
          </div>

          {followUp.status === 'pending' && (
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => onEdit(followUp)} className="text-muted-foreground hover:text-foreground rounded-xl h-8 w-8 p-0" title="تعديل"><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => onComplete(followUp.id)} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl h-8 w-8 p-0" title="إكمال"><CheckCircle2 className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => onCancel(followUp.id)} className="text-muted-foreground hover:text-destructive rounded-xl h-8 w-8 p-0" title="إلغاء"><X className="h-3.5 w-3.5" /></Button>
            </div>
          )}
          {followUp.status === 'completed' && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 shrink-0">مكتملة</Badge>}
          {followUp.status === 'cancelled' && <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400 border-0 shrink-0">ملغاة</Badge>}
        </CardContent>
      </Card>
    </motion.div>
  );
}
