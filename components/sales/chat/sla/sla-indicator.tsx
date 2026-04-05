'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { Clock, AlertTriangle, CheckCircle2, Timer } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getSlaStatus, getSlaTimeRemaining, getActiveSlaDeadline } from '@/lib/whatsapp/sla';
import type { SlaStatus } from '@/lib/whatsapp/sla';

interface SlaConversationData {
  sla_policy_id?: string | null;
  sla_first_response_due?: string | null;
  sla_resolution_due?: string | null;
  sla_first_response_breached?: boolean;
  sla_resolution_breached?: boolean;
  first_reply_at?: string | null;
  resolved_at?: string | null;
  status?: string;
}

interface SlaIndicatorProps {
  conversation: SlaConversationData;
  /** Show as compact dot only (for conversation list) */
  compact?: boolean;
}

const STATUS_CONFIG: Record<SlaStatus, {
  color: string;
  bgColor: string;
  dotColor: string;
  icon: typeof Clock;
  label: string;
}> = {
  ok: {
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/20 border-green-200/50 dark:border-green-800/30',
    dotColor: 'bg-green-500',
    icon: CheckCircle2,
    label: 'ضمن الاتفاقية',
  },
  warning: {
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200/50 dark:border-yellow-800/30',
    dotColor: 'bg-yellow-500',
    icon: Timer,
    label: 'قريب من الانتهاء',
  },
  breached: {
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/20 border-red-200/50 dark:border-red-800/30',
    dotColor: 'bg-red-500',
    icon: AlertTriangle,
    label: 'تجاوز الاتفاقية',
  },
};

export function SlaIndicator({ conversation, compact = false }: SlaIndicatorProps) {
  const status = useMemo(() => getSlaStatus(conversation), [conversation]);
  const deadline = useMemo(() => getActiveSlaDeadline(conversation), [conversation]);
  const timeRemaining = useMemo(() => getSlaTimeRemaining(deadline), [deadline]);

  // Don't show if no SLA policy assigned or conversation is resolved
  if (!conversation.sla_policy_id) return null;
  if (conversation.status === 'resolved') return null;

  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  // Compact mode: just a colored dot (for conversation list items)
  if (compact) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                config.dotColor,
                status === 'breached' && 'animate-pulse'
              )}
              title={config.label}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p className="font-medium">{config.label}</p>
            {timeRemaining.label && (
              <p className="text-muted-foreground">{timeRemaining.label}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full badge mode (for chat header)
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
              config.bgColor,
              config.color
            )}
          >
            <Icon className="h-3 w-3" />
            <span>{config.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            {timeRemaining.label && (
              <p className="text-muted-foreground">{timeRemaining.label}</p>
            )}
            {!conversation.first_reply_at && conversation.sla_first_response_due && (
              <p className="text-muted-foreground">الرد الأول: {getSlaTimeRemaining(conversation.sla_first_response_due).label}</p>
            )}
            {!conversation.resolved_at && conversation.sla_resolution_due && (
              <p className="text-muted-foreground">الحل: {getSlaTimeRemaining(conversation.sla_resolution_due).label}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
