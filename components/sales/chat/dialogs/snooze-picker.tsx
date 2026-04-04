'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import { AlarmClock, Clock, Sun, CalendarDays, X } from 'lucide-react';
import { toast } from 'sonner';
import { useUpdateConversation } from '@/hooks/useWhatsApp';

interface SnoozePickerProps {
  conversationId: string;
  snoozedUntil?: string | null;
  onSnoozed?: () => void;
}

function getPresets(): Array<{ label: string; icon: React.ReactNode; getDate: () => Date }> {
  return [
    {
      label: 'ساعة واحدة',
      icon: <Clock className="h-3.5 w-3.5" />,
      getDate: () => new Date(Date.now() + 60 * 60 * 1000),
    },
    {
      label: '3 ساعات',
      icon: <Clock className="h-3.5 w-3.5" />,
      getDate: () => new Date(Date.now() + 3 * 60 * 60 * 1000),
    },
    {
      label: 'غداً الساعة 9 صباحاً',
      icon: <Sun className="h-3.5 w-3.5" />,
      getDate: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
    {
      label: 'الأسبوع القادم',
      icon: <CalendarDays className="h-3.5 w-3.5" />,
      getDate: () => {
        const d = new Date();
        // Next Monday
        const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
        d.setDate(d.getDate() + daysUntilMonday);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
  ];
}

export function SnoozePicker({ conversationId, snoozedUntil, onSnoozed }: SnoozePickerProps) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('09:00');
  const updateConversation = useUpdateConversation();

  const isSnoozed = snoozedUntil && new Date(snoozedUntil) > new Date();

  function handleSnooze(until: Date) {
    updateConversation.mutate(
      { conversationId, data: { snoozed_until: until.toISOString() } },
      {
        onSuccess: () => {
          toast.success('تم تأجيل المحادثة');
          setOpen(false);
          onSnoozed?.();
        },
        onError: () => toast.error('فشل تأجيل المحادثة'),
      }
    );
  }

  function handleUnsnooze() {
    updateConversation.mutate(
      { conversationId, data: { snoozed_until: null } },
      {
        onSuccess: () => {
          toast.success('تم إلغاء التأجيل');
          setOpen(false);
          onSnoozed?.();
        },
        onError: () => toast.error('فشل إلغاء التأجيل'),
      }
    );
  }

  function handleCustomSnooze() {
    if (!customDate) return;
    const [year, month, day] = customDate.split('-').map(Number);
    const [hours, minutes] = customTime.split(':').map(Number);
    const until = new Date(year, month - 1, day, hours, minutes);
    if (until <= new Date()) {
      toast.error('يجب اختيار وقت في المستقبل');
      return;
    }
    handleSnooze(until);
  }

  const presets = getPresets();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'rounded-xl h-9 w-9',
            isSnoozed && 'bg-amber-50 dark:bg-amber-950/20 text-amber-600'
          )}
          title={isSnoozed ? `مؤجلة حتى ${new Date(snoozedUntil!).toLocaleString('ar-EG')}` : 'تأجيل'}
        >
          <AlarmClock className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="end">
        <div className="p-3 border-b border-border/60">
          <h4 className="text-xs font-semibold text-muted-foreground/70">
            تأجيل المحادثة
          </h4>
        </div>

        {/* Unsnooze button if snoozed */}
        {isSnoozed && (
          <div className="p-2 border-b border-border/40">
            <button
              onClick={handleUnsnooze}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              إلغاء التأجيل
            </button>
          </div>
        )}

        {/* Presets */}
        <div className="p-1">
          {presets.map((preset, i) => (
            <button
              key={i}
              onClick={() => handleSnooze(preset.getDate())}
              disabled={updateConversation.isPending}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-muted/50 transition-colors"
            >
              {preset.icon}
              <span className="flex-1 text-start">{preset.label}</span>
              <span className="text-[10px] text-muted-foreground/40 tabular-nums" dir="ltr">
                {preset.getDate().toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          ))}
        </div>

        {/* Custom */}
        <div className="border-t border-border/60 p-2">
          {showCustom ? (
            <div className="space-y-2">
              <div className="flex gap-1.5">
                <Input
                  type="date"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  className="h-7 text-xs rounded-lg flex-1"
                  min={new Date().toISOString().split('T')[0]}
                />
                <Input
                  type="time"
                  value={customTime}
                  onChange={e => setCustomTime(e.target.value)}
                  className="h-7 text-xs rounded-lg w-24"
                />
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs rounded-lg bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={handleCustomSnooze}
                  disabled={!customDate || updateConversation.isPending}
                >
                  تأجيل
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs rounded-lg"
                  onClick={() => setShowCustom(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCustom(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <CalendarDays className="h-3 w-3" />
              وقت مخصص
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
