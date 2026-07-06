'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { SummaryCards } from '@/components/dashboard/client-statement/summary-cards';
import { InvoicesTable } from '@/components/dashboard/client-statement/invoices-table';
import { PaymentsTable, ContractsTable } from '@/components/dashboard/client-statement/payment-contract-tables';

interface ClientInfo {
  name: string;
  company: string;
}

export default function ClientStatementPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const t = useTranslations('finance.statement');

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    total_invoiced: 0,
    total_paid: 0,
    total_outstanding: 0,
    total_overdue: 0,
  });

  useEffect(() => {
    if (!clientId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/finance/client-statement/${clientId}`);
        const json = await res.json();
        if (json.data) {
          setClient(json.data.client);
          setInvoices(json.data.invoices || []);
          setPayments(json.data.payments || []);
          setContracts(json.data.contracts || []);
          setSummary(json.data.summary);
        } else {
          toast.error(json.error || t('toasts.loadFailed'));
        }
      } catch {
        toast.error(t('toasts.loadFailed'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [clientId]);

  const invoiceNumberMap: Record<string, string> = {};
  invoices.forEach(inv => { invoiceNumberMap[inv.id] = inv.invoice_number; });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance">
          <Button variant="ghost" size="icon" aria-label={t('back')}><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">
          {loading ? (
            <Skeleton className="h-8 w-64 inline-block" />
          ) : (
            <>{t('title', { clientName: client?.company || client?.name || '—' })}</>
          )}
        </h1>
      </div>

      <SummaryCards summary={summary} loading={loading} />
      <InvoicesTable invoices={invoices} loading={loading} />
      <PaymentsTable payments={payments} loading={loading} invoiceNumberMap={invoiceNumberMap} />
      <ContractsTable contracts={contracts} loading={loading} />
    </div>
  );
}
