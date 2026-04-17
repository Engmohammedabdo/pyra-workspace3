'use client';

import { useState, useEffect } from 'react';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';
import { Receipt, Send, Search, Loader2, ExternalLink, File } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';
import { getStatusBadgeClass } from '@/lib/constants/badge-colors';
import Link from 'next/link';

interface Invoice {
  id: string;
  invoice_number: string;
  project_name: string | null;
  total: number;
  amount_due: number;
  currency: string;
  status: string;
  due_date: string;
}

interface SendInvoiceDialogProps {
  open?: boolean;
  leadId: string | null;
  clientId?: string | null;
  conversationId?: string | null;
  remoteJid: string;
  instanceName: string;
  phone: string;
  onClose: () => void;
  onSent: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  sent: 'مرسل',
  viewed: 'تمت المعاينة',
  partially_paid: 'مدفوع جزئياً',
  paid: 'مدفوع',
  overdue: 'متأخر',
  cancelled: 'ملغي',
};


export function SendInvoiceDialog({ open = true, leadId, clientId, conversationId, remoteJid, instanceName, phone, onClose, onSent }: SendInvoiceDialogProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sendingPdf, setSendingPdf] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetch_() {
      try {
        // Fetch invoices — filter by client_id if available
        const params = new URLSearchParams({ limit: '20' });
        if (clientId) params.set('client_id', clientId);
        const data = await fetchAPI<Invoice[]>(`/api/invoices?${params}`);
        setInvoices(data);
      } catch {
        toast.error('فشل تحميل الفواتير');
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, [clientId]);

  const filteredInvoices = search
    ? invoices.filter(inv =>
        inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
        inv.project_name?.toLowerCase().includes(search.toLowerCase())
      )
    : invoices;

  async function handleSend(inv: Invoice) {
    setSending(inv.id);
    try {
      const message = `🧾 *فاتورة ${inv.invoice_number}*\n${inv.project_name ? `المشروع: ${inv.project_name}\n` : ''}الإجمالي: ${formatCurrency(inv.total, inv.currency)}${inv.amount_due > 0 && inv.amount_due !== inv.total ? `\nالمبلغ المتبقي: ${formatCurrency(inv.amount_due, inv.currency)}` : ''}\nتاريخ الاستحقاق: ${new Date(inv.due_date).toLocaleDateString('ar-EG')}\n\nسيتم إرسال التفاصيل الكاملة قريباً.`;

      await mutateAPI('/api/dashboard/sales/whatsapp/send', 'POST', {
        instance_name: instanceName,
        remote_jid: remoteJid,
        number: phone,
        text: message,
        lead_id: leadId,
      });

      toast.success(`تم إرسال الفاتورة ${inv.invoice_number}`);
      onSent();
      onClose();
    } catch {
      toast.error('فشل إرسال الفاتورة');
    } finally {
      setSending(null);
    }
  }

  async function handleSendPdf(inv: Invoice) {
    if (!conversationId) {
      toast.error('لا يمكن إرسال PDF بدون محادثة');
      return;
    }
    setSendingPdf(inv.id);
    try {
      await mutateAPI('/api/dashboard/sales/whatsapp/send-pdf', 'POST', {
        conversation_id: conversationId,
        type: 'invoice',
        document_id: inv.id,
      });
      toast.success(`تم إرسال الفاتورة ${inv.invoice_number} كـ PDF`);
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
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
            <Receipt className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400" />
          </div>
          <DialogTitle className="text-sm">إرسال فاتورة</DialogTitle>
          <DialogDescription className="sr-only">نموذج</DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border/30">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            <label htmlFor="invoice-search" className="sr-only">بحث الفواتير</label>
            <input
              id="invoice-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث برقم الفاتورة أو المشروع..."
              className="w-full bg-muted/30 rounded-xl ps-9 pe-3 py-2 text-sm border border-border/40 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/40"
            />
          </div>
        </div>

        {/* Invoice List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground/50 text-sm">جاري التحميل...</div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground/50">
                {search ? 'لا توجد نتائج' : 'لا توجد فواتير'}
              </p>
            </div>
          ) : (
            filteredInvoices.map(inv => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-3 rounded-xl border border-border/40 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{inv.invoice_number}</p>
                    <Badge className={cn('text-[10px]', getStatusBadgeClass(inv.status))}>
                      {STATUS_LABELS[inv.status] || inv.status}
                    </Badge>
                  </div>
                  {inv.project_name && (
                    <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{inv.project_name}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(inv.total, inv.currency)}
                    </p>
                    {inv.amount_due > 0 && inv.amount_due !== inv.total && (
                      <p className="text-[10px] text-destructive">
                        متبقي: {formatCurrency(inv.amount_due, inv.currency)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ms-3">
                  <Button variant="ghost" size="icon" asChild className="h-8 w-8 rounded-lg" aria-label="عرض">
                    <Link href={`/dashboard/invoices?id=${inv.id}`} target="_blank">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  {conversationId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl text-xs h-8 px-2.5"
                      onClick={() => handleSendPdf(inv)}
                      disabled={sendingPdf === inv.id}
                      title="إرسال كـ PDF"
                    >
                      {sendingPdf === inv.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <File className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="rounded-xl text-xs bg-purple-600 hover:bg-purple-700 text-white h-8 px-3"
                    onClick={() => handleSend(inv)}
                    disabled={sending === inv.id}
                  >
                    {sending === inv.id ? (
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
