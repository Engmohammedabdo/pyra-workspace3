'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useTranslations } from 'next-intl';
import { useClients } from '@/hooks/useClients';
import { useProjects } from '@/hooks/useProjects';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ContractItemsEditor } from '@/components/finance/contract-items-editor';
import { ContractForm } from '@/components/dashboard/contract-detail/contract-form';
import { MilestonesSection } from '@/components/dashboard/contract-detail/milestones-section';
import { RetainerBillingSection } from '@/components/dashboard/contract-detail/retainer-billing-section';
import { MilestoneDialog } from '@/components/dashboard/contract-detail/milestone-dialog';

const EMPTY_MILESTONE_FORM = { title: '', description: '', percentage: '', due_date: '' };

export default function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('finance.contracts.detail');
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const { data: clients = [] } = useClients({ pageSize: '100' });
  const { data: allProjects = [] } = useProjects({ pageSize: '100' });
  const [form, setForm] = useState<any>({
    title: '', description: '', client_id: '', project_id: '',
    contract_type: '', total_value: '', currency: 'AED', vat_rate: '0',
    start_date: '', end_date: '', status: 'draft',
    amount_billed: '', amount_collected: '', notes: '',
    retainer_amount: '', retainer_cycle: 'monthly', billing_day: '1',
  });
  const [saving, setSaving] = useState(false);

  const [milestones, setMilestones] = useState<any[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(true);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<any>(null);
  const [milestoneForm, setMilestoneForm] = useState<any>(EMPTY_MILESTONE_FORM);
  const [milestoneSaving, setMilestoneSaving] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null);
  const [showDeleteMilestoneDialog, setShowDeleteMilestoneDialog] = useState(false);
  const [deleteMilestoneTarget, setDeleteMilestoneTarget] = useState<any>(null);

  const [billingHistory, setBillingHistory] = useState<any>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [generatingRetainerInvoice, setGeneratingRetainerInvoice] = useState(false);

  const fetchMilestones = useCallback(async () => {
    try {
      const res = await fetch(`/api/finance/contracts/${id}/milestones`);
      const j = await res.json();
      if (j.data) setMilestones(j.data);
    } finally {
      setMilestonesLoading(false);
    }
  }, [id]);

  const fetchBillingHistory = useCallback(async () => {
    setBillingLoading(true);
    try {
      const res = await fetch(`/api/finance/contracts/${id}/billing-history`);
      const j = await res.json();
      if (j.data) setBillingHistory(j.data);
    } finally {
      setBillingLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch(`/api/finance/contracts/${id}`)
      .then(r => r.json())
      .then(j => {
        if (j.data) {
          const d = j.data;
          setForm({
            title: d.title || '', description: d.description || '',
            client_id: d.client_id || '', project_id: d.project_id || '',
            contract_type: d.contract_type || '',
            total_value: String(d.total_value || ''),
            currency: d.currency || 'AED',
            vat_rate: String(d.vat_rate || '0'),
            start_date: d.start_date || '', end_date: d.end_date || '',
            status: d.status || 'draft',
            amount_billed: String(d.amount_billed || '0'),
            amount_collected: String(d.amount_collected || '0'),
            notes: d.notes || '',
            retainer_amount: String(d.retainer_amount || ''),
            retainer_cycle: d.retainer_cycle || 'monthly',
            billing_day: String(d.billing_day || '1'),
          });
        }
      }).finally(() => setLoading(false));
    fetchMilestones();
  }, [id, fetchMilestones]);

  useEffect(() => {
    if (form.contract_type === 'retainer' && !loading) fetchBillingHistory();
  }, [form.contract_type, loading, fetchBillingHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/finance/contracts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        total_value: Number(form.total_value) || 0,
        vat_rate: Number(form.vat_rate) || 0,
        amount_billed: Number(form.amount_billed) || 0,
        amount_collected: Number(form.amount_collected) || 0,
        retainer_amount: Number(form.retainer_amount) || 0,
        billing_day: Number(form.billing_day) || 1,
      }),
    });
    if (res.ok) {
      toast.success(t('toasts.updateSuccess'));
      router.push('/dashboard/finance/contracts');
    } else {
      toast.error(t('toasts.updateFailed'));
    }
    setSaving(false);
  };

  const handleSaveMilestone = async () => {
    setMilestoneSaving(true);
    const payload = {
      title: milestoneForm.title.trim(),
      description: milestoneForm.description.trim() || null,
      percentage: Number(milestoneForm.percentage),
      amount: Number(form.total_value) * (Number(milestoneForm.percentage) / 100),
      due_date: milestoneForm.due_date || null,
    };
    const url = editingMilestone ? `/api/finance/contracts/${id}/milestones/${editingMilestone.id}` : `/api/finance/contracts/${id}/milestones`;
    const res = await fetch(url, { method: editingMilestone ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) {
      toast.success(editingMilestone ? t('toasts.milestoneUpdateSuccess') : t('toasts.milestoneAddSuccess'));
      setMilestoneDialogOpen(false);
      fetchMilestones();
    } else {
      toast.error(t('toasts.milestoneSaveFailed'));
    }
    setMilestoneSaving(false);
  };

  const handleMarkComplete = async (m: any) => {
    try {
      const res = await fetch(`/api/finance/contracts/${id}/milestones/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) {
        toast.error(j.error || t('toasts.milestoneUpdateFailedFallback'));
      } else {
        toast.success(t('toasts.milestoneUpdateSuccess'));
      }
    } catch {
      toast.error(t('toasts.connectionError'));
    }
    fetchMilestones();
  };

  const handleGenerateInvoice = async (m: any) => {
    setGeneratingInvoice(m.id);
    try {
      const res = await fetch(`/api/finance/contracts/${id}/milestones/${m.id}/generate-invoice`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) {
        toast.error(j.error || t('toasts.invoiceGenerateFailedFallback'));
      } else {
        toast.success(t('toasts.invoiceGenerateSuccess'));
      }
    } catch {
      toast.error(t('toasts.connectionError'));
    }
    fetchMilestones();
    setGeneratingInvoice(null);
  };

  const handleDeleteMilestone = (m: any) => {
    setDeleteMilestoneTarget(m);
    setShowDeleteMilestoneDialog(true);
  };

  const confirmDeleteMilestone = async () => {
    if (!deleteMilestoneTarget) return;
    try {
      const res = await fetch(`/api/finance/contracts/${id}/milestones/${deleteMilestoneTarget.id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) {
        toast.error(j.error || t('toasts.milestoneDeleteFailedFallback'));
      } else {
        toast.success(t('toasts.milestoneDeleteSuccess'));
      }
    } catch {
      toast.error(t('toasts.connectionError'));
    }
    fetchMilestones();
    setShowDeleteMilestoneDialog(false);
    setDeleteMilestoneTarget(null);
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Card><CardContent className="p-6 space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/contracts" aria-label={t('back')}><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
      </div>
      <ContractForm form={form} setForm={setForm} clients={clients} projects={allProjects} onSubmit={handleSubmit} saving={saving} />
      <ContractItemsEditor contractId={id} />
      {form.contract_type === 'retainer' && (
        <RetainerBillingSection 
          loading={billingLoading} data={billingHistory} currency={form.currency} status={form.status}
          onGenerateInvoice={async () => {
             setGeneratingRetainerInvoice(true);
             try {
               const res = await fetch(`/api/finance/contracts/${id}/generate-invoice`, { method: 'POST' });
               const j = await res.json().catch(() => ({}));
               if (!res.ok || j.error) {
                 // 409 duplicate-period guard returns a specific Arabic message — surface it verbatim
                 toast.error(j.error || t('toasts.invoiceGenerateFailedFallback'));
               } else {
                 toast.success(t('toasts.invoiceGenerateSuccess'));
               }
             } catch {
               toast.error(t('toasts.connectionError'));
             }
             fetchBillingHistory();
             setGeneratingRetainerInvoice(false);
          }}
          generating={generatingRetainerInvoice}
        />
      )}
      {form.contract_type === 'milestone' && (
        <MilestonesSection 
          loading={milestonesLoading} milestones={milestones} currency={form.currency}
          progressPercentage={milestones.reduce((s: number, m: any) => s + (m.status === 'completed' || m.status === 'invoiced' ? m.percentage : 0), 0)}
          onAdd={() => { setEditingMilestone(null); setMilestoneForm(EMPTY_MILESTONE_FORM); setMilestoneDialogOpen(true); }}
          onEdit={(m: any) => { setEditingMilestone(m); setMilestoneForm({ title: m.title, description: m.description || '', percentage: String(m.percentage), due_date: m.due_date || '' }); setMilestoneDialogOpen(true); }}
          onMarkComplete={handleMarkComplete}
          onGenerateInvoice={handleGenerateInvoice}
          onDelete={handleDeleteMilestone}
          generatingInvoice={generatingInvoice}
        />
      )}
      <MilestoneDialog
        open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen} milestone={editingMilestone}
        form={milestoneForm} setForm={setMilestoneForm} onSave={handleSaveMilestone} loading={milestoneSaving}
        totalValue={Number(form.total_value)} currency={form.currency}
      />

      <AlertDialog open={showDeleteMilestoneDialog} onOpenChange={setShowDeleteMilestoneDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteMilestoneDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteMilestoneDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('deleteMilestoneDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteMilestone} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('deleteMilestoneDialog.confirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
