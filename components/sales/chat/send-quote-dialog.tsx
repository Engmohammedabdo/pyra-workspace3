'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { X, FileText, Send, Search, Loader2, ExternalLink, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';
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
  leadId: string | null;
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

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  signed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  invoiced: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

export function SendQuoteDialog({ leadId, remoteJid, instanceName, phone, onClose, onSent }: SendQuoteDialogProps) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetch_() {
      try {
        const url = leadId
          ? `/api/dashboard/sales/leads/${leadId}/quotes`
          : `/api/quotes?limit=20`;
        const res = await fetch(url);
        const data = await res.json();
        setQuotes(data.data || []);
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

      const res = await fetch('/api/dashboard/sales/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: instanceName,
          remote_jid: remoteJid,
          number: phone,
          text: message,
          lead_id: leadId,
        }),
      });

      if (!res.ok) throw new Error('فشل الإرسال');

      toast.success(`تم إرسال عرض السعر ${quote.quote_number}`);
      onSent();
      onClose();
    } catch {
      toast.error('فشل إرسال عرض السعر');
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <FileText className="h-4.5 w-4.5 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="font-semibold text-sm">إرسال عرض سعر</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border/30">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            <input
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
                    <Badge className={cn('text-[10px]', STATUS_COLORS[q.status] || 'bg-gray-100 text-gray-600')}>
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
                  <Button variant="ghost" size="icon" asChild className="h-8 w-8 rounded-lg">
                    <Link href={`/dashboard/quotes?id=${q.id}`} target="_blank">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
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
      </div>
    </div>
  );
}
