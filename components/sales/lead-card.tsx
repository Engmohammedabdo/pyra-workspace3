'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { Phone, Mail, Building2, User } from 'lucide-react';
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

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  urgent: 'عاجلة',
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
  return (
    <Link href={`/dashboard/sales/leads/${lead.id}`}>
      <div className="bg-card border rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm truncate">{lead.name}</p>
          <Badge variant="secondary" className={cn('text-[10px] shrink-0', PRIORITY_COLORS[lead.priority])}>
            {PRIORITY_LABELS[lead.priority] || lead.priority}
          </Badge>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {lead.company && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.company}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 shrink-0" />
              <span dir="ltr" className="truncate">{lead.phone}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 shrink-0" />
              <span dir="ltr" className="truncate">{lead.email}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1 border-t">
          <Badge variant="outline" className="text-[10px]">
            {SOURCE_LABELS[lead.source] || lead.source}
          </Badge>
          {lead.assigned_to && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <User className="h-3 w-3" />
              <span>{lead.assigned_to}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
