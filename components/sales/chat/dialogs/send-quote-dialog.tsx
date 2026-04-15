'use client';

import { useState, useEffect } from 'react';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';
import { FileText, Send, Search, Loader2, ExternalLink, Plus, File } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';
import { getStatusBadgeClass } from '@/lib/constants/badge-colors';
import Link from 'next/link';

interface Quote {
  id: string;
  quote_number: string;
  project_name: string | null;
  total: number;
  currency: string;
  status: string;
  created_at: string;
}

interface SendQuoteDialogProps {
  open?: boolean;
  leadId: string | null;
  conversationId?: string | null;
  remoteJid: string;
  instanceName: string;
  phone: string;
  onClose: () => void;
  onSent: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending_approval: 'بانتظار الموافقة',
  sent: 'مرسل',
  viewed: 'تمت المعاينة',
  signed: 'تم التوقيع',
  approved: 'معتمد',
  invoiced: 'تمت الفوترة',
};


export function SendQuoteDialog({ open = true, leadId, conversationId, remoteJid, instanceName, phone, onClose, onSent }: SendQuoteDialogProps) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sendingPdf, setSendingPdf] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetch_() {
      try {
        const url = leadId
          ? `/api/dashboard/sales/leads/${leadId}/quotes`
          : `/api/quotes?limit=20`;
        const data = await fetchAPI<Quote[]>(url);
        setQuotes(data);
      } catch {
        toast.error('فشل تحميل عروض الأسعار');
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, [leadId]);

  const filteredQuotes = search
    ? quotes.filter(q =>
        q.quote_number.toLowerCase().includes(search.toLowerCase()) ||
        q.project_name?.toLowerCase().includes(search.toLowerCase())
      )
    : quotes;

  async function handleSend(quote: Quote) {
    setSending(quote.id);
    try {
      // Send message with quote info text
      const message = `📋 *عرض سعر ${quote.quote_number}*\n${quote.project_name ? `المشروع: ${quote.project_name}\n` : ''}الإجمالي: ${formatCurrency(quote.total, quote.currency)}\n\nسيتم إرسال التفاصيل الكاملة قريباً.`;

      await mutateAPI('/api/dashboard/sales/whatsapp/send', 'POST', {
        instance_name: instanceName,
        remote_jid: remoteJid,
        number: phone,
        text: message,
        lead_id: leadId,
      });

      toast.success(`تم إرسال عرض السعر ${quote.quote_number}`);
      onSent();
      onClose();
    } catch {
      toast.error('فشل إرسال عرض السعر');
    } finally {
      setSending(null);
    }
  }

  async function handleSendPdf(quote: Quote) {
    if (!conversationId) {
      toast.error('لا يمكن إرسال PDF بدون محادثة');
      return;
    }
    setSendingPdf(quote.id);
    try {
      await mutateAPI('/api/dashboard/sales/whatsapp/send-pdf', 'POST', {
        conversation_id: conversationId,
        type: 'quote',
        document_id: quote.id,
      });
      toast.success(`تم إرسال عرض السعر ${quote.quote_number} كـ PDF`);
      onSent();
      onClose();
    } catch {
      toast.error('فشل إرسال PDF');
    } finally {
      setSendingPdf(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 rounded-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-border/60 flex-row items-center gap-2.5 space-y-0">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
            <FileText className="h-4.5 w-4.5 text-orange-600 dark:text-orange-400" />
          </div>
          <DialogTitle className="text-sm">إرسال عرض سعر</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border/30">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            <label htmlFor="quote-search" className="sr-only">بحث عروض الأسعار</label>
            <input
              id="quote-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالرقم أو اسم المشروع..."
              className="w-full bg-muted/30 rounded-xl ps-9 pe-3 py-2 text-sm border border-border/40 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/40"
            />
          </div>
        </div>

        {/* Quote List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground/50 text-sm">جاري التحميل...</div>
          ) : filteredQuotes.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground/50">
                {search ? 'لا توجد نتائج' : 'لا توجد عروض أسعار'}
              </p>
              {leadId && (
                <Button variant="outline" size="sm" asChild className="rounded-xl text-xs">
                  <Link href={`/dashboard/quotes/new?lead_id=${leadId}`}>
                    <Plus className="h-3 w-3 me-1.5" />
                    إنشاء عرض سعر جديد
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            filteredQuotes.map(q => (
              <div
                key={q.id}
                className="flex items-center justify-between p-3 rounded-xl border border-border/40 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{q.quote_number}</p>
                    <Badge className={cn('text-[10px]', getStatusBadgeClass(q.status))}>
                      {STATUS_LABELS[q.status] || q.status}
                    </Badge>
                  </div>
                  {q.project_name && (
                    <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{q.project_name}</p>
                  )}
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatCurrency(q.total, q.currency)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ms-3">
                  <Button variant="ghost" size="icon" asChild className="h-8 w-8 rounded-lg" aria-label="عرض">
                    <Link href={`/dashboard/quotes?id=${q.id}`} target="_blank">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  {conversationId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl text-xs h-8 px-2.5"
                      onClick={() => handleSendPdf(q)}
                      disabled={sendingPdf === q.id}
                      title="إرسال كـ PDF"
                    >
                      {sendingPdf === q.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <File className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3"
                    onClick={() => handleSend(q)}
                    disabled={sending === q.id}
                  >
                    {sending === q.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-3 w-3 me-1" />
                        إرسال
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
