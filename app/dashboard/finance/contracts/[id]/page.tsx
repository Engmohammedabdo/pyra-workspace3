'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  ArrowRight, Save, Plus, Pencil, Trash2, CheckCircle2,
  FileText, Loader2, Receipt,
} from 'lucide-react';
import { toast } from 'sonner';

// ==========================================
// Types
// ==========================================

interface Client { id: string; name: string; company: string; }
interface Project { id: string; name: string; client_id: string | null; }

interface Milestone {
  id: string;
  contract_id: string;
  title: string;
  description: string | null;
  percentage: number;
  amount: number;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'invoiced';
  invoice_id: string | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MilestoneForm {
  title: string;
  description: string;
  percentage: string;
  due_date: string;
}

// ==========================================
// Constants
// ==========================================

const CONTRACT_TYPES = [
  { value: 'retainer', label: 'ثابت شهري (Retainer)' },
  { value: 'milestone', label: 'مراحل (Milestone)' },
  { value: 'upfront_delivery', label: 'دفعة مقدمة + تسليم' },
  { value: 'fixed', label: 'سعر ثابت (Fixed)' },
  { value: 'hourly', label: 'بالساعة (Hourly)' },
];

const STATUSES = [
  { value: 'draft', label: 'مسودة' },
  { value: 'active', label: 'نشط' },
  { value: 'in_progress', label: 'قيد التنفيذ' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'cancelled', label: 'ملغي' },
];

const MILESTONE_STATUS_MAP: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline'; className?: string }> = {
  pending: { label: 'قيد الانتظار', variant: 'secondary' },
  in_progress: { label: 'قيد التنفيذ', variant: 'default' },
  completed: { label: 'مكتمل', variant: 'outline', className: 'border-green-500 text-green-700 dark:text-green-400' },
  invoiced: { label: 'تم الفوترة', variant: 'outline', className: 'border-blue-500 text-blue-700 dark:text-blue-400' },
};

const EMPTY_MILESTONE_FORM: MilestoneForm = { title: '', description: '', percentage: '', due_date: '' };

// ==========================================
// Component
// ==========================================

export default function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  // Contract form state
  const [clients, setClients] = useState<Client[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', client_id: '', project_id: '',
    contract_type: '', total_value: '', currency: 'AED', vat_rate: '0',
    start_date: '', end_date: '', status: 'draft',
    amount_billed: '', amount_collected: '', notes: '',
  });

  // Milestone state
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(true);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [milestoneForm, setMilestoneForm] = useState<MilestoneForm>(EMPTY_MILESTONE_FORM);
  const [milestoneSaving, setMilestoneSaving] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null);

  // Filter projects by selected client
  const filteredProjects = form.client_id
    ? allProjects.filter(p => p.client_id === form.client_id)
    : allProjects;

  // Calculated milestone amount (preview)
  const totalValue = Number(form.total_value) || 0;
  const milestonePercentage = Number(milestoneForm.percentage) || 0;
  const calculatedAmount = totalValue * (milestonePercentage / 100);

  // Progress calculation
  const completedOrInvoiced = milestones.filter(m => m.status === 'completed' || m.status === 'invoiced');
  const progressPercentage = milestones.length > 0
    ? completedOrInvoiced.reduce((sum, m) => sum + m.percentage, 0)
    : 0;

  // ==========================================
  // Data fetching
  // ==========================================

  const fetchMilestones = useCallback(async () => {
    try {
      const res = await fetch(`/api/finance/contracts/${id}/milestones`);
      const j = await res.json();
      if (j.data) setMilestones(j.data);
    } catch {
      // silent
    } finally {
      setMilestonesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch('/api/clients?pageSize=100')
      .then(r => r.json())
      .then(j => { if (j.data) setClients(j.data); })
      .catch(() => {});
    fetch('/api/projects?pageSize=100')
      .then(r => r.json())
      .then(j => { if (j.data) setAllProjects(j.data); })
      .catch(() => {});
  }, []);

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
          });
        }
      })
      .catch(() => toast.error('فشل في تحميل البيانات'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  // ==========================================
  // Contract form handlers
  // ==========================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/contracts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          total_value: Number(form.total_value) || 0,
          vat_rate: Number(form.vat_rate) || 0,
          amount_billed: Number(form.amount_billed) || 0,
          amount_collected: Number(form.amount_collected) || 0,
          client_id: form.client_id || null,
          project_id: form.project_id || null,
          contract_type: form.contract_type || null,
        }),
      });
      if (res.ok) {
        toast.success('تم تحديث العقد');
        router.push('/dashboard/finance/contracts');
      } else {
        toast.error('فشل في التحديث');
      }
    } catch {
      toast.error('فشل في التحديث');
    } finally {
      setSaving(false);
    }
  };

  const u = (k: string, v: string) => {
    if (k === 'client_id') {
      setForm(p => ({ ...p, client_id: v, project_id: '' }));
    } else {
      setForm(p => ({ ...p, [k]: v }));
    }
  };

  // ==========================================
  // Milestone handlers
  // ==========================================

  const openAddMilestone = () => {
    setEditingMilestone(null);
    setMilestoneForm(EMPTY_MILESTONE_FORM);
    setMilestoneDialogOpen(true);
  };

  const openEditMilestone = (m: Milestone) => {
    setEditingMilestone(m);
    setMilestoneForm({
      title: m.title,
      description: m.description || '',
      percentage: String(m.percentage),
      due_date: m.due_date || '',
    });
    setMilestoneDialogOpen(true);
  };

  const handleSaveMilestone = async () => {
    if (!milestoneForm.title.trim()) {
      toast.error('عنوان المرحلة مطلوب');
      return;
    }
    if (!milestoneForm.percentage || Number(milestoneForm.percentage) <= 0) {
      toast.error('نسبة المرحلة مطلوبة');
      return;
    }

    setMilestoneSaving(true);
    try {
      const payload = {
        title: milestoneForm.title.trim(),
        description: milestoneForm.description.trim() || null,
        percentage: Number(milestoneForm.percentage),
        amount: totalValue * (Number(milestoneForm.percentage) / 100),
        due_date: milestoneForm.due_date || null,
      };

      const url = editingMilestone
        ? `/api/finance/contracts/${id}/milestones/${editingMilestone.id}`
        : `/api/finance/contracts/${id}/milestones`;

      const res = await fetch(url, {
        method: editingMilestone ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(editingMilestone ? 'تم تحديث المرحلة' : 'تمت إضافة المرحلة');
        setMilestoneDialogOpen(false);
        fetchMilestones();
      } else {
        const j = await res.json().catch(() => null);
        toast.error(j?.error || 'فشل في حفظ المرحلة');
      }
    } catch {
      toast.error('فشل في حفظ المرحلة');
    } finally {
      setMilestoneSaving(false);
    }
  };

  const handleDeleteMilestone = async (m: Milestone) => {
    if (m.status === 'invoiced') return;
    if (!confirm(`هل أنت متأكد من حذف المرحلة "${m.title}"؟`)) return;

    try {
      const res = await fetch(`/api/finance/contracts/${id}/milestones/${m.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('تم حذف المرحلة');
        fetchMilestones();
      } else {
        const j = await res.json().catch(() => null);
        toast.error(j?.error || 'فشل في حذف المرحلة');
      }
    } catch {
      toast.error('فشل في حذف المرحلة');
    }
  };

  const handleMarkComplete = async (m: Milestone) => {
    try {
      const res = await fetch(`/api/finance/contracts/${id}/milestones/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (res.ok) {
        toast.success('تم تحديد المرحلة كمكتملة');
        fetchMilestones();
      } else {
        toast.error('فشل في تحديث الحالة');
      }
    } catch {
      toast.error('فشل في تحديث الحالة');
    }
  };

  const handleGenerateInvoice = async (m: Milestone) => {
    if (!confirm(`سيتم إنشاء فاتورة بقيمة ${m.amount.toLocaleString()} للمرحلة "${m.title}". متابعة؟`)) return;

    setGeneratingInvoice(m.id);
    try {
      const res = await fetch(`/api/finance/contracts/${id}/milestones/${m.id}/generate-invoice`, {
        method: 'POST',
      });
      const j = await res.json();
      if (res.ok && j.data) {
        toast.success(`تم إنشاء الفاتورة ${j.data.invoice_number}`);
        fetchMilestones();
        // Refresh contract to update amount_billed
        const cRes = await fetch(`/api/finance/contracts/${id}`);
        const cJ = await cRes.json();
        if (cJ.data) {
          setForm(p => ({
            ...p,
            amount_billed: String(cJ.data.amount_billed || '0'),
          }));
        }
      } else {
        toast.error(j?.error || 'فشل في إنشاء الفاتورة');
      }
    } catch {
      toast.error('فشل في إنشاء الفاتورة');
    } finally {
      setGeneratingInvoice(null);
    }
  };

  // ==========================================
  // Render
  // ==========================================

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Card><CardContent className="p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/contracts">
          <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">تعديل العقد</h1>
      </div>

      {/* ==========================================
          Contract Form
          ========================================== */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><CardTitle className="text-base">بيانات العقد</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>عنوان العقد *</Label>
                <Input value={form.title} onChange={e => u('title', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>العميل</Label>
                <Select value={form.client_id} onValueChange={v => u('client_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون عميل</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المشروع</Label>
                <Select value={form.project_id} onValueChange={v => u('project_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder={form.client_id ? 'اختر المشروع' : 'اختر العميل أولاً'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون مشروع</SelectItem>
                    {filteredProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نوع العقد</Label>
                <Select value={form.contract_type} onValueChange={v => u('contract_type', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">غير محدد</SelectItem>
                    {CONTRACT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>الحالة</Label>
                <Select value={form.status} onValueChange={v => u('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>القيمة الإجمالية</Label>
                <Input type="number" step="0.01" min="0" value={form.total_value} onChange={e => u('total_value', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>العملة</Label>
                <Select value={form.currency} onValueChange={v => u('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="SAR">SAR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نسبة الضريبة (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" value={form.vat_rate} onChange={e => u('vat_rate', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>المبلغ المفوتر</Label>
                <Input type="number" step="0.01" min="0" value={form.amount_billed} onChange={e => u('amount_billed', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>المبلغ المحصل</Label>
                <Input type="number" step="0.01" min="0" value={form.amount_collected} onChange={e => u('amount_collected', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>تاريخ البداية</Label>
                <Input type="date" value={form.start_date} onChange={e => u('start_date', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>تاريخ النهاية</Label>
                <Input type="date" value={form.end_date} onChange={e => u('end_date', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea value={form.description} onChange={e => u('description', e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea value={form.notes} onChange={e => u('notes', e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4 ml-2" />
                {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* ==========================================
          Milestones Section
          ========================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">مراحل العقد</CardTitle>
            <Button size="sm" onClick={openAddMilestone}>
              <Plus className="h-4 w-4 ml-1" />
              إضافة مرحلة
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar */}
          {milestones.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>نسبة الإنجاز</span>
                <span>{Math.min(progressPercentage, 100).toFixed(0)}%</span>
              </div>
              <Progress value={Math.min(progressPercentage, 100)} className="h-2" />
            </div>
          )}

          {/* Milestones list */}
          {milestonesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : milestones.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>لا توجد مراحل بعد</p>
              <p className="text-xs mt-1">أضف مراحل لتتبع تقدم العقد وإنشاء الفواتير تلقائياً</p>
            </div>
          ) : (
            <div className="space-y-2">
              {milestones.map(m => {
                const statusInfo = MILESTONE_STATUS_MAP[m.status] || MILESTONE_STATUS_MAP.pending;
                const isGenerating = generatingInvoice === m.id;

                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    {/* Title & info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{m.title}</span>
                        <Badge variant={statusInfo.variant} className={statusInfo.className}>
                          {statusInfo.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{m.percentage}%</span>
                        <span>{m.amount.toLocaleString()} {form.currency}</span>
                        {m.due_date && <span>{m.due_date}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Pending / In Progress: Edit + Mark Complete */}
                      {(m.status === 'pending' || m.status === 'in_progress') && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditMilestone(m)}
                            title="تعديل"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                            onClick={() => handleMarkComplete(m)}
                            title="اكتمل"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}

                      {/* Completed: Generate Invoice */}
                      {m.status === 'completed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                          onClick={() => handleGenerateInvoice(m)}
                          disabled={isGenerating}
                        >
                          {isGenerating ? (
                            <Loader2 className="h-3.5 w-3.5 ml-1 animate-spin" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 ml-1" />
                          )}
                          إنشاء فاتورة
                        </Button>
                      )}

                      {/* Invoiced: Link to invoice */}
                      {m.status === 'invoiced' && m.invoice_id && (
                        <Link href={`/dashboard/invoices/${m.invoice_id}`}>
                          <Button variant="ghost" size="sm" className="h-8 text-xs text-blue-600 hover:text-blue-700">
                            <FileText className="h-3.5 w-3.5 ml-1" />
                            عرض الفاتورة
                          </Button>
                        </Link>
                      )}

                      {/* Delete (disabled if invoiced) */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteMilestone(m)}
                        disabled={m.status === 'invoiced'}
                        title={m.status === 'invoiced' ? 'لا يمكن حذف مرحلة تم فوترتها' : 'حذف'}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary */}
          {milestones.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t text-sm text-muted-foreground">
              <span>إجمالي النسب: {milestones.reduce((s, m) => s + m.percentage, 0)}%</span>
              <span>
                إجمالي المبالغ: {milestones.reduce((s, m) => s + m.amount, 0).toLocaleString()} {form.currency}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==========================================
          Add/Edit Milestone Dialog
          ========================================== */}
      <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMilestone ? 'تعديل المرحلة' : 'إضافة مرحلة جديدة'}</DialogTitle>
            <DialogDescription>
              {editingMilestone ? 'تعديل بيانات المرحلة' : 'أدخل بيانات المرحلة الجديدة'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>عنوان المرحلة *</Label>
              <Input
                value={milestoneForm.title}
                onChange={e => setMilestoneForm(p => ({ ...p, title: e.target.value }))}
                placeholder="مثال: التسليم الأولي"
              />
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea
                value={milestoneForm.description}
                onChange={e => setMilestoneForm(p => ({ ...p, description: e.target.value }))}
                rows={2}
                placeholder="وصف اختياري للمرحلة"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>النسبة (%) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100"
                  value={milestoneForm.percentage}
                  onChange={e => setMilestoneForm(p => ({ ...p, percentage: e.target.value }))}
                  placeholder="25"
                />
              </div>
              <div className="space-y-2">
                <Label>المبلغ المحسوب</Label>
                <Input
                  value={calculatedAmount > 0 ? calculatedAmount.toLocaleString() : '-'}
                  disabled
                  className="bg-muted"
                />
                {totalValue > 0 && milestonePercentage > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {milestonePercentage}% من {totalValue.toLocaleString()} {form.currency}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>تاريخ الاستحقاق</Label>
              <Input
                type="date"
                value={milestoneForm.due_date}
                onChange={e => setMilestoneForm(p => ({ ...p, due_date: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMilestoneDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveMilestone} disabled={milestoneSaving}>
              {milestoneSaving && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
              {editingMilestone ? 'حفظ التعديلات' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
