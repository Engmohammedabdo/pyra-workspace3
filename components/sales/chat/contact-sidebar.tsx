'use client';

import { useState, useEffect } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import {
  X, Phone, Mail, Building, Calendar, FileText, Tag,
  MessageCircle, ChevronDown, ChevronUp, ExternalLink, UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { formatRelativeDate } from '@/lib/utils/format';

interface ContactSidebarProps {
  remoteJid: string;
  instanceName: string;
  contactName: string | null;
  phone: string | null;
  leadId?: string | null;
  onClose: () => void;
}

interface LeadInfo {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  priority: string;
  source: string;
  is_converted: boolean;
  client_id: string | null;
  stage?: { name_ar: string; color: string } | null;
  labels?: { id: string; name_ar: string; color: string }[];
  last_contact_at?: string | null;
  next_follow_up?: string | null;
}

interface QuoteInfo {
  id: string;
  quote_number: string;
  total: number;
  status: string;
  created_at: string;
}

export function ContactSidebar({ contactName, phone, leadId, onClose }: ContactSidebarProps) {
  const [lead, setLead] = useState<LeadInfo | null>(null);
  const [quotes, setQuotes] = useState<QuoteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQuotes, setShowQuotes] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        if (leadId) {
          const leadData = await fetchAPI<LeadInfo>(`/api/dashboard/sales/leads/${leadId}`);
          setLead(leadData);

          // Fetch quotes linked to this lead
          const quotesData = await fetchAPI<QuoteInfo[]>(`/api/dashboard/sales/leads/${leadId}/quotes`);
          setQuotes(quotesData);
        }
      } catch {
        console.error('Failed to fetch contact data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [leadId]);

  const displayPhone = phone && phone.length > 5 ? `+${phone}` : phone;

  const priorityColors: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };

  const priorityLabels: Record<string, string> = {
    urgent: 'عاجل', high: 'مرتفع', medium: 'متوسط', low: 'منخفض',
  };

  const statusLabels: Record<string, string> = {
    draft: 'مسودة', sent: 'مرسل', viewed: 'تمت المعاينة', signed: 'تم التوقيع',
    approved: 'معتمد', rejected: 'مرفوض', expired: 'منتهي', invoiced: 'تمت الفوترة',
  };

  return (
    <div className="h-full flex flex-col border-s border-border/60 bg-card/50 w-72 lg:w-80 animate-in slide-in-from-end duration-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
        <h3 className="font-semibold text-sm">معلومات جهة الاتصال</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Contact Avatar + Name */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-xl mx-auto shadow-lg shadow-emerald-500/15">
            {(contactName || phone || '?').charAt(0).toUpperCase()}
          </div>
          <p className="font-semibold text-base mt-2">{contactName || displayPhone || 'غير معروف'}</p>
          {displayPhone && contactName && (
            <p className="text-sm text-muted-foreground/60 tabular-nums" dir="ltr">{displayPhone}</p>
          )}
        </div>

        {/* Quick Info */}
        <div className="space-y-2">
          {displayPhone && (
            <a href={`tel:${phone}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors">
              <Phone className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="text-sm tabular-nums" dir="ltr">{displayPhone}</span>
            </a>
          )}
          {lead?.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors">
              <Mail className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="text-sm truncate" dir="ltr">{lead.email}</span>
            </a>
          )}
          {lead?.company && (
            <div className="flex items-center gap-3 p-2">
              <Building className="h-4 w-4 text-purple-500 shrink-0" />
              <span className="text-sm">{lead.company}</span>
            </div>
          )}
        </div>

        {/* Lead Status */}
        {lead && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">حالة العميل المحتمل</h4>

            <div className="flex flex-wrap gap-2">
              {lead.stage && (
                <Badge variant="outline" className="text-xs">
                  {lead.stage.name_ar}
                </Badge>
              )}
              <Badge className={cn('text-xs', priorityColors[lead.priority] || 'bg-gray-100 text-gray-700')}>
                {priorityLabels[lead.priority] || lead.priority}
              </Badge>
              {lead.is_converted && (
                <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  تم التحويل
                </Badge>
              )}
            </div>

            {/* Labels */}
            {lead.labels && lead.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lead.labels.map(label => (
                  <span key={label.id} className="flex items-center gap-1 text-[10px] bg-muted/40 rounded-full px-2 py-0.5">
                    <Tag className="h-2.5 w-2.5" />
                    {label.name_ar}
                  </span>
                ))}
              </div>
            )}

            {/* Dates */}
            <div className="space-y-1 text-xs text-muted-foreground/60">
              {lead.last_contact_at && (
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-3 w-3 shrink-0" />
                  <span>آخر تواصل: {formatRelativeDate(lead.last_contact_at)}</span>
                </div>
              )}
              {lead.next_follow_up && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span>متابعة قادمة: {formatRelativeDate(lead.next_follow_up)}</span>
                </div>
              )}
            </div>

            {/* View Lead Button */}
            <Button variant="outline" size="sm" asChild className="w-full rounded-lg text-xs">
              <Link href={`/dashboard/sales/leads/${lead.id}`}>
                <ExternalLink className="h-3 w-3 me-1.5" />
                فتح ملف العميل المحتمل
              </Link>
            </Button>

            {/* View Client Button (if converted) */}
            {lead.client_id && (
              <Button variant="outline" size="sm" asChild className="w-full rounded-lg text-xs">
                <Link href={`/dashboard/clients/${lead.client_id}`}>
                  <ExternalLink className="h-3 w-3 me-1.5" />
                  فتح ملف العميل
                </Link>
              </Button>
            )}
          </div>
        )}

        {/* No Lead — show create button */}
        {!leadId && !loading && (
          <div className="text-center py-4 space-y-2">
            <p className="text-xs text-muted-foreground/60">لا يوجد عميل محتمل مرتبط</p>
            <Button variant="outline" size="sm" className="rounded-lg text-xs">
              <UserPlus className="h-3 w-3 me-1.5" />
              إنشاء عميل محتمل
            </Button>
          </div>
        )}

        {/* Quotes */}
        {quotes.length > 0 && (
          <div>
            <button
              onClick={() => setShowQuotes(!showQuotes)}
              className="flex items-center justify-between w-full py-2"
            >
              <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-3 w-3" />
                عروض الأسعار ({quotes.length})
              </h4>
              {showQuotes ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />}
            </button>
            {showQuotes && (
              <div className="space-y-2">
                {quotes.map(q => (
                  <Link
                    key={q.id}
                    href={`/dashboard/quotes?id=${q.id}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{q.quote_number}</p>
                      <p className="text-[10px] text-muted-foreground/50">{formatRelativeDate(q.created_at)}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {statusLabels[q.status] || q.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
