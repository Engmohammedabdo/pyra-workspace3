'use client';

import { toast } from 'sonner';
import { CheckCircle2, Circle, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useToggleOnboardingTask,
  useUpdateOnboarding,
  type OnboardingDetail,
} from '@/hooks/useOnboarding';
import { ONBOARDING_STATUS } from '@/lib/constants/onboarding';

interface Props {
  onboarding: OnboardingDetail;
}

export function OnboardingChecklist({ onboarding }: Props) {
  const toggleTask = useToggleOnboardingTask();
  const updateOnboarding = useUpdateOnboarding();

  const tasks = onboarding.tasks ?? [];
  const done = tasks.filter((t) => t.is_done).length;
  const total = tasks.length;
  const allDone = total > 0 && done === total;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const isInProgress = onboarding.status === ONBOARDING_STATUS.IN_PROGRESS;

  async function handleToggle(taskId: string, currentDone: boolean) {
    try {
      await toggleTask.mutateAsync({
        onboardingId: onboarding.id,
        taskId,
        is_done: !currentDone,
      });
    } catch {
      toast.error('فشل تحديث المهمة');
    }
  }

  async function handleComplete() {
    try {
      await updateOnboarding.mutateAsync({
        id: onboarding.id,
        action: 'complete',
      });
      toast.success('تم إنهاء التعيين بنجاح');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'فشل إنهاء التعيين';
      toast.error(msg);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-base">قائمة مهام الإيبورد</CardTitle>
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {done}/{total} مكتملة
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden mt-2">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              pct === 100 ? 'bg-emerald-500' : 'bg-orange-500',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-1">
        {tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            disabled={!isInProgress || toggleTask.isPending}
            onClick={() => handleToggle(task.id, task.is_done)}
            className={cn(
              'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors',
              isInProgress
                ? 'hover:bg-muted/50 cursor-pointer'
                : 'cursor-default',
              task.is_done && 'opacity-60',
            )}
          >
            {task.is_done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                'text-sm flex-1',
                task.is_done && 'line-through text-muted-foreground',
              )}
            >
              {task.title_ar}
            </span>
            {task.done_at && (
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(task.done_at).toLocaleDateString('ar-AE')}
              </span>
            )}
          </button>
        ))}

        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            لا توجد مهام
          </p>
        )}

        {/* Complete action */}
        {isInProgress && allDone && (
          <div className="pt-3 border-t">
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11 gap-2"
              onClick={handleComplete}
              disabled={updateOnboarding.isPending}
            >
              <CheckSquare className="h-4 w-4" />
              {updateOnboarding.isPending ? 'جاري الإنهاء...' : 'إنهاء التعيين (كل المهام مكتملة)'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
