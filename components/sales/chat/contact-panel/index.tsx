'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import { useUpdateConversation, useConversationCsat } from '@/hooks/useWhatsApp';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import {
  X, Phone, Mail, Building, Calendar, FileText, Tag,
  MessageCircle, ChevronDown, ChevronUp, ExternalLink,
  Pencil, Check, Plus, Trash2, Link2Off, Merge, Star,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatRelativeDate } from '@/lib/utils/format';
import { PreviousConversations } from './previous-conversations';
import { MergeDialog } from '../dialogs/merge-dialog';
import { LabelPicker, LabelBadges } from '../dialogs/label-picker';
import { CsatBadge, CsatStars } from '../csat/csat-badge';
import type { Conversation } from '@/hooks/useWhatsApp';

// Static lookup tables — moved to module scope to avoid re-creation per render
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

interface ContactPanelProps {
  contactName: string | null;
  phone: string | null;
  leadId?: string | null;
  conversationId?: string | null;
  conversation?: Conversation | null;
  isAdmin?: boolean;
  onClose: () => void;
  onConversationUpdated?: () => void;
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

export function ContactPanel({
  contactName,
  phone,
  leadId,
  conversationId,
  conversation,
  isAdmin,
  onClose,
  onConversationUpdated,
}: ContactPanelProps) {
  const [showQuotes, setShowQuotes] = useState(false);

  // Inline edit states
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(contactName || '');
  const [showMerge, setShowMerge] = useState(false);

  // Custom attributes
  const [customAttrs, setCustomAttrs] = useState<Record<string, string>>(
    conversation?.custom_attributes || {}
  );
  const [editingAttr, setEditingAttr] = useState(false);
  const [newAttrKey, setNewAttrKey] = useState('');
  const [newAttrValue, setNewAttrValue] = useState('');

  const updateConvMutation = useUpdateConversation();
  const { data: csatData } = useConversationCsat(conversationId || undefined);

  // Fetch lead data via React Query
  const { data: lead = null } = useQuery<LeadInfo | null>({
    queryKey: ['lead', leadId],
    queryFn: () => fetchAPI<LeadInfo>(`/api/dashboard/sales/leads/${leadId}`),
    enabled: !!leadId,
    staleTime: 60_000,
  });

  // Fetch quotes linked to this lead
  const { data: quotes = [], isLoading: loading } = useQuery<QuoteInfo[]>({
    queryKey: ['lead-quotes', leadId],
    queryFn: () => fetchAPI<QuoteInfo[]>(`/api/dashboard/sales/leads/${leadId}/quotes`),
    enabled: !!leadId,
    staleTime: 60_000,
  });

  useEffect(() => {
    setNameValue(contactName || '');
  }, [contactName]);

  useEffect(() => {
    setCustomAttrs(conversation?.custom_attributes || {});
  }, [conversation?.custom_attributes]);

  const displayPhone = phone && phone.length > 5 ? `+${phone}` : phone;

  const handleSaveName = useCallback(async () => {
    if (!conversationId) return;
    try {
      await updateConvMutation.mutateAsync({
        conversationId,
        data: { contact_name: nameValue.trim() || null },
      });
      setEditingName(false);
      onConversationUpdated?.();
      toast.success('تم تحديث الاسم');
    } catch {
      toast.error('فشل تحديث الاسم');
    }
  }, [conversationId, nameValue, updateConvMutation, onConversationUpdated]);

  const handleSaveAttrs = useCallback(async (attrs: Record<string, string>) => {
    if (!conversationId) return;
    try {
      await updateConvMutation.mutateAsync({
        conversationId,
        data: { custom_attributes: attrs },
      });
      setCustomAttrs(attrs);
      onConversationUpdated?.();
    } catch {
      toast.error('فشل تحديث البيانات المخصصة');
    }
  }, [conversationId, updateConvMutation, onConversationUpdated]);

  const handleAddAttr = useCallback(async () => {
    if (!newAttrKey.trim()) return;
    const updated = { ...customAttrs, [newAttrKey.trim()]: newAttrValue.trim() };
    try {
      await handleSaveAttrs(updated);
      setNewAttrKey('');
      setNewAttrValue('');
      setEditingAttr(false);
    } catch {
      // Error already handled in handleSaveAttrs
    }
  }, [newAttrKey, newAttrValue, customAttrs, handleSaveAttrs]);

  const handleRemoveAttr = (key: string) => {
    const updated = { ...customAttrs };
    delete updated[key];
    handleSaveAttrs(updated);
  };

  const handleUnlinkLead = useCallback(async () => {
    if (!conversationId) return;
    try {
      await updateConvMutation.mutateAsync({
        conversationId,
        data: { lead_id: null },
      });
      onConversationUpdated?.();
      toast.success('تم إلغاء الربط');
    } catch {
      toast.error('فشل إلغاء الربط');
    }
  }, [conversationId, updateConvMutation, onConversationUpdated]);

  return (
    <div className="h-full flex flex-col border-s border-border/60 bg-card/50 w-72 lg:w-80 animate-in slide-in-from-end duration-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
        <h3 className="font-semibold text-sm">معلومات جهة الاتصال</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose} aria-label="إغلاق">
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
          {/* Editable Name */}
          {editingName ? (
            <div className="flex items-center gap-1 mt-2 justify-center">
              <Input
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                className="h-8 text-sm text-center max-w-[160px]"
                placeholder="اسم جهة الاتصال"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-green-600" onClick={handleSaveName}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={() => { setEditingName(false); setNameValue(contactName || ''); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1 mt-2 group">
              <p className="font-semibold text-base">{contactName || displayPhone || 'غير معروف'}</p>
              {conversationId && (
                <button
                  onClick={() => setEditingName(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-muted/50"
                  title="تعديل الاسم"
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
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

        {/* CSAT Rating */}
        {(csatData || conversation?.csat_rating) && (
          <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/15 border border-amber-200/40 dark:border-amber-800/30">
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                {'\u062a\u0642\u064a\u064a\u0645 \u0627\u0644\u0639\u0645\u064a\u0644'}
              </h4>
              <CsatBadge rating={csatData?.rating || conversation?.csat_rating || 0} size="sm" showLabel />
            </div>
            <CsatStars rating={csatData?.rating || conversation?.csat_rating || 0} size="md" />
            {csatData?.comment && (
              <p className="text-xs text-muted-foreground/70 mt-2 italic leading-relaxed">
                &ldquo;{csatData.comment}&rdquo;
              </p>
            )}
            {csatData?.submitted_at && (
              <p className="text-[10px] text-muted-foreground/40 mt-1">
                {formatRelativeDate(csatData.submitted_at)}
              </p>
            )}
          </div>
        )}

        {/* Conversation Labels */}
        {conversationId && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
                التسميات
              </h4>
              <LabelPicker
                conversationId={conversationId}
                assignedLabels={conversation?.labels}
                compact
              />
            </div>
            <LabelBadges
              labels={conversation?.labels}
              conversationId={conversationId}
              editable
            />
            {(!conversation?.labels || conversation.labels.length === 0) && (
              <p className="text-[11px] text-muted-foreground/40 py-1">لا توجد تسميات</p>
            )}
          </div>
        )}

        {/* Custom Attributes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              بيانات مخصصة
            </h4>
            {conversationId && (
              <button
                onClick={() => setEditingAttr(!editingAttr)}
                className="text-muted-foreground/40 hover:text-foreground transition-colors"
                title="إضافة حقل"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {Object.entries(customAttrs).length > 0 && (
            <div className="space-y-1.5">
              {Object.entries(customAttrs).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 group">
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground/50 uppercase">{key}</p>
                    <p className="text-xs truncate">{val}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveAttr(key)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 text-destructive/50 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {editingAttr && (
            <div className="mt-2 space-y-2 p-2 rounded-lg border border-border/60 bg-muted/10">
              <Input
                value={newAttrKey}
                onChange={e => setNewAttrKey(e.target.value)}
                placeholder="اسم الحقل"
                className="h-7 text-xs"
              />
              <Input
                value={newAttrValue}
                onChange={e => setNewAttrValue(e.target.value)}
                placeholder="القيمة"
                className="h-7 text-xs"
                onKeyDown={e => { if (e.key === 'Enter') handleAddAttr(); }}
              />
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1 rounded-md" onClick={handleAddAttr}>
                  إضافة
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] rounded-md" onClick={() => setEditingAttr(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          )}
          {Object.entries(customAttrs).length === 0 && !editingAttr && (
            <p className="text-[11px] text-muted-foreground/40 py-1">لا توجد بيانات مخصصة</p>
          )}
        </div>

        {/* Lead Status */}
        {lead && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">حالة العميل المحتمل</h4>
              {conversationId && (
                <button
                  onClick={handleUnlinkLead}
                  className="text-muted-foreground/40 hover:text-destructive transition-colors"
                  title="إلغاء ربط العميل المحتمل"
                >
                  <Link2Off className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

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

        {/* No Lead — informational text (lead creation handled in ChatPanel quick actions) */}
        {!leadId && !loading && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground/60">لا يوجد عميل محتمل مرتبط</p>
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

        {/* Previous Conversations */}
        <PreviousConversations
          contactPhone={phone}
          currentConversationId={conversationId || null}
        />

        {/* Merge Button — admin only */}
        {isAdmin && conversationId && conversation && (
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-lg text-xs"
            onClick={() => setShowMerge(true)}
          >
            <Merge className="h-3 w-3 me-1.5" />
            دمج محادثات
          </Button>
        )}
      </div>

      {/* Merge Dialog */}
      {showMerge && conversation && (
        <MergeDialog
          open={showMerge}
          onClose={() => setShowMerge(false)}
          primaryConversation={conversation}
          contactPhone={phone}
          onMerged={() => onConversationUpdated?.()}
        />
      )}
    </div>
  );
}
