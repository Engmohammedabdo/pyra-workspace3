'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { Phone, Mail, Building2, GripVertical } from 'lucide-react';
import Link from 'next/link';

interface LeadCardProps {
  lead: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    company?: string;
    source: string;
    priority: string;
    assigned_to?: string;
  };
}

const PRIORITY_CONFIG: Record<string, { label: string; dot: string; bg: string }> = {
  low: {
    label: 'منخفضة',
    dot: 'bg-gray-400',
    bg: 'bg-gray-100/80 text-gray-600 dark:bg-gray-800/80 dark:text-gray-400',
  },
  medium: {
    label: 'متوسطة',
    dot: 'bg-blue-400',
    bg: 'bg-blue-50/80 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  },
  high: {
    label: 'عالية',
    dot: 'bg-orange-400',
    bg: 'bg-orange-50/80 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  },
  urgent: {
    label: 'عاجلة',
    dot: 'bg-red-500 animate-pulse',
    bg: 'bg-red-50/80 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'يدوي',
  whatsapp: 'واتساب',
  website: 'موقع',
  referral: 'إحالة',
  ad: 'إعلان',
  social: 'سوشيال',
};

export function LeadCard({ lead }: LeadCardProps) {
  const priority = PRIORITY_CONFIG[lead.priority] || PRIORITY_CONFIG.medium;

  return (
    <Link href={`/dashboard/sales/leads/${lead.id}`}>
      <div className="group relative bg-card border border-border/60 rounded-xl p-3.5 hover:shadow-lg hover:shadow-orange-500/5 dark:hover:shadow-orange-500/10 transition-all duration-200 cursor-pointer hover:border-orange-200 dark:hover:border-orange-800/50 space-y-2.5">
        {/* Drag handle indicator */}
        <div className="absolute top-3 start-1.5 opacity-0 group-hover:opacity-40 transition-opacity">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>

        {/* Name + Priority */}
        <div className="flex items-start justify-between gap-2 ps-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-900/40 dark:to-amber-900/20 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold text-xs shrink-0">
              {lead.name.charAt(0).toUpperCase()}
            </div>
            <p className="font-semibold text-sm truncate">{lead.name}</p>
          </div>
          <div className={cn('flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0', priority.bg)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', priority.dot)} />
            {priority.label}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-xs text-muted-foreground ps-3">
          {lead.company && (
            <div className="flex items-center gap-2">
              <Building2 className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              <span className="truncate">{lead.company}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              <span dir="ltr" className="truncate">{lead.phone}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              <span dir="ltr" className="truncate text-[11px]">{lead.email}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40 ps-3">
          <Badge
            variant="secondary"
            className="text-[10px] bg-muted/60 hover:bg-muted font-normal"
          >
            {SOURCE_LABELS[lead.source] || lead.source}
          </Badge>
          {lead.assigned_to && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white text-[8px] font-bold">
                {lead.assigned_to.charAt(0).toUpperCase()}
              </div>
              <span className="truncate max-w-[60px]">{lead.assigned_to}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
