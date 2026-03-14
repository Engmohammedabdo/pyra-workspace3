'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { LeadActivityTimeline } from '@/components/sales/lead-activity-timeline';
import { LeadTransferDialog } from '@/components/sales/lead-transfer-dialog';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import {
  ArrowRight, Phone, Mail, Building2, User, Calendar,
  Edit2, Save, X, ArrowRightLeft, MessageSquare, FileText,
  Clock, StickyNote, Loader2, Trash2, UserCheck, AlertCircle, Plus
} from 'lucide-react';
import Link from 'next/link';

interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  source: string;
  stage_id: string;
  assigned_to?: string;
  client_id?: string;
  notes?: string;
  priority: string;
  score?: number;
  score_breakdown?: {
    total: number;
    source: number;
    contactInfo: number;
    engagement: number;
    pipeline: number;
    recency: number;
  };
  last_contact_at?: string;
  next_follow_up?: string;
  converted_at?: string;
  is_converted: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface Stage {
  id: string;
  name_ar: string;
  color: string;
}

interface Activity {
  id: string;
  activity_type: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
}

interface FollowUp {
  id: string;
  title?: string;
  notes?: string;
  due_at: string;
  status: string;
  assigned_to?: string;
  completed_at?: string;
}

interface LinkedQuote {
  id: string;
  quote_number: string;
  project_name?: string;
  status: string;
  total: number;
  currency: string;
  estimate_date: string;
  created_at: string;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'يدوي', whatsapp: 'واتساب', website: 'موقع', referral: 'إحالة', ad: 'إعلان', social: 'سوشيال',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [linkedQuotes, setLinkedQuotes] = useState<LinkedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Lead>>({});

  // Add activity form
  const [newActivity, setNewActivity] = useState({ type: 'note', description: '' });
  const [addingActivity, setAddingActivity] = useState(false);

  // Add follow-up form
  const [newFollowUp, setNewFollowUp] = useState({ title: '', due_at: '', notes: '' });
  const [addingFollowUp, setAddingFollowUp] = useState(false);

  // Conversion
  const [showConvert, setShowConvert] = useState(false);
  const [convertPortal, setConvertPortal] = useState(false);
  const [convertPassword, setConvertPassword] = useState('');
  const [converting, setConverting] = useState(false);

  const fetchLead = useCallback(async () => {
    try {
      const [leadRes, stagesRes, activitiesRes, followUpsRes, quotesRes] = await Promise.all([
        fetch(`/api/dashboard/sales/leads/${id}`),
        fetch('/api/dashboard/sales/pipeline-stages'),
        fetch(`/api/dashboard/sales/leads/${id}/activities`),
        fetch(`/api/dashboard/sales/follow-ups?lead_id=${id}`),
        fetch(`/api/dashboard/sales/leads/${id}/quotes`),
      ]);

      const leadData = await leadRes.json();
      const stagesData = await stagesRes.json();
      const activitiesData = await activitiesRes.json();
      const followUpsData = await followUpsRes.json();
      const quotesData = await quotesRes.json();

      if (!leadRes.ok) {
        toast.error('العميل المحتمل غير موجود');
        router.push('/dashboard/sales/leads');
        return;
      }

      setLead(leadData.data);
      setStages(stagesData.data || []);
      setActivities(activitiesData.data || []);
      setFollowUps(followUpsData.data || []);
      setLinkedQuotes(quotesData.data || []);
    } catch {
      toast.error('فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/sales/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error();
      toast.success('تم حفظ التعديلات');
      setEditing(false);
      fetchLead();
    } catch {
      toast.error('فشل حفظ التعديلات');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('هل أنت متأكد من حذف هذا العميل المحتمل؟')) return;
    try {
      const res = await fetch(`/api/dashboard/sales/leads/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('تم الحذف');
      router.push('/dashboard/sales/leads');
    } catch {
      toast.error('فشل الحذف');
    }
  }

  async function handleAddActivity() {
    if (!newActivity.description.trim()) return;
    setAddingActivity(true);
    try {
      const res = await fetch(`/api/dashboard/sales/leads/${id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_type: newActivity.type, description: newActivity.description }),
      });
      if (!res.ok) throw new Error();
      setNewActivity({ type: 'note', description: '' });
      fetchLead();
    } catch {
      toast.error('فشل إضافة النشاط');
    } finally {
      setAddingActivity(false);
    }
  }

  async function handleAddFollowUp() {
    if (!newFollowUp.due_at) {
      toast.error('وقت المتابعة مطلوب');
      return;
    }
    setAddingFollowUp(true);
    try {
      const res = await fetch('/api/dashboard/sales/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: id, ...newFollowUp }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم إضافة المتابعة');
      setNewFollowUp({ title: '', due_at: '', notes: '' });
      fetchLead();
    } catch {
      toast.error('فشل إضافة المتابعة');
    } finally {
      setAddingFollowUp(false);
    }
  }

  async function handleCompleteFollowUp(fuId: string) {
    try {
      const res = await fetch('/api/dashboard/sales/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fuId, status: 'completed' }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم إكمال المتابعة');
      fetchLead();
    } catch {
      toast.error('فشل تحديث المتابعة');
    }
  }

  async function handleConvert() {
    setConverting(true);
    try {
      const res = await fetch(`/api/dashboard/sales/leads/${id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          create_portal_access: convertPortal,
          password: convertPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل التحويل');
      toast.success('تم تحويل العميل المحتمل لعميل فعلي');
      setShowConvert(false);
      fetchLead();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setConverting(false);
    }
  }

  async function handleStageChange(stageId: string) {
    try {
      const res = await fetch(`/api/dashboard/sales/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم تغيير المرحلة');
      fetchLead();
    } catch {
      toast.error('فشل تغيير المرحلة');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 col-span-2 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <EmptyState icon={AlertCircle} title="العميل المحتمل غير موجود" description="ربما تم حذفه أو ليس لديك صلاحية عرضه" />
    );
  }

  const currentStage = stages.find(s => s.id === lead.stage_id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard/sales/leads" className="hover:text-foreground transition-colors">العملاء المحتملين</Link>
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
            <span>{lead.name}</span>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {lead.name}
            {lead.is_converted && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">محوّل لعميل</Badge>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTransfer(true)}>
            <ArrowRightLeft className="h-4 w-4 me-1" />
            تحويل
          </Button>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => { setEditing(true); setEditForm(lead); }}>
              <Edit2 className="h-4 w-4 me-1" />
              تعديل
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
                {saving ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <Save className="h-4 w-4 me-1" />}
                حفظ
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Pipeline Progress */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {stages.map((stage, i) => {
          const isActive = stage.id === lead.stage_id;
          const isPast = stages.findIndex(s => s.id === lead.stage_id) > i;
          return (
            <button
              key={stage.id}
              onClick={() => handleStageChange(stage.id)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap',
                isActive
                  ? 'bg-orange-500 text-white shadow-md'
                  : isPast
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {stage.name_ar}
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="info">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="info">المعلومات</TabsTrigger>
              <TabsTrigger value="activity">النشاط</TabsTrigger>
              <TabsTrigger value="followups">المتابعات</TabsTrigger>
              <TabsTrigger value="quotes">عروض الأسعار</TabsTrigger>
              <TabsTrigger value="messages">الرسائل</TabsTrigger>
            </TabsList>

            {/* Info Tab */}
            <TabsContent value="info" className="mt-4">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  {editing ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>الاسم</Label>
                        <Input value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                        <Label>الهاتف</Label>
                        <Input value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" />
                      </div>
                      <div>
                        <Label>البريد الإلكتروني</Label>
                        <Input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} dir="ltr" />
                      </div>
                      <div>
                        <Label>الشركة</Label>
                        <Input value={editForm.company || ''} onChange={e => setEditForm(f => ({ ...f, company: e.target.value }))} />
                      </div>
                      <div>
                        <Label>الأولوية</Label>
                        <Select value={editForm.priority || ''} onValueChange={v => setEditForm(f => ({ ...f, priority: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label>ملاحظات</Label>
                        <Textarea value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <InfoRow icon={User} label="الاسم" value={lead.name} />
                      <InfoRow icon={Phone} label="الهاتف" value={lead.phone} dir="ltr" />
                      <InfoRow icon={Mail} label="البريد" value={lead.email} dir="ltr" />
                      <InfoRow icon={Building2} label="الشركة" value={lead.company} />
                      <div className="flex items-start gap-3 py-2 border-b last:border-0">
                        <StickyNote className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">ملاحظات</p>
                          <p className="text-sm mt-0.5">{lead.notes || '—'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">إضافة نشاط</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Select value={newActivity.type} onValueChange={v => setNewActivity(a => ({ ...a, type: v }))}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="note">ملاحظة</SelectItem>
                        <SelectItem value="call">مكالمة</SelectItem>
                        <SelectItem value="message">رسالة</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={newActivity.description}
                      onChange={e => setNewActivity(a => ({ ...a, description: e.target.value }))}
                      placeholder="تفاصيل النشاط..."
                      className="flex-1"
                      onKeyDown={e => e.key === 'Enter' && handleAddActivity()}
                    />
                    <Button onClick={handleAddActivity} disabled={addingActivity} className="bg-orange-500 hover:bg-orange-600 text-white">
                      {addingActivity ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إضافة'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <LeadActivityTimeline activities={activities} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Follow-ups Tab */}
            <TabsContent value="followups" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">إضافة متابعة</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      value={newFollowUp.title}
                      onChange={e => setNewFollowUp(f => ({ ...f, title: e.target.value }))}
                      placeholder="عنوان المتابعة"
                    />
                    <Input
                      type="datetime-local"
                      value={newFollowUp.due_at}
                      onChange={e => setNewFollowUp(f => ({ ...f, due_at: e.target.value }))}
                      dir="ltr"
                    />
                    <Button onClick={handleAddFollowUp} disabled={addingFollowUp} className="bg-orange-500 hover:bg-orange-600 text-white">
                      {addingFollowUp ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <Clock className="h-4 w-4 me-1" />}
                      إضافة متابعة
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {followUps.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <p className="text-center text-muted-foreground text-sm">لا توجد متابعات</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {followUps.map(fu => (
                    <Card key={fu.id}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{fu.title || 'متابعة'}</p>
                          <p className="text-xs text-muted-foreground">{formatRelativeDate(fu.due_at)}</p>
                          {fu.notes && <p className="text-xs text-muted-foreground mt-1">{fu.notes}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={fu.status === 'completed' ? 'default' : fu.status === 'pending' ? 'outline' : 'secondary'}>
                            {fu.status === 'completed' ? 'مكتملة' : fu.status === 'pending' ? 'معلقة' : 'ملغاة'}
                          </Badge>
                          {fu.status === 'pending' && (
                            <Button size="sm" variant="ghost" onClick={() => handleCompleteFollowUp(fu.id)}>
                              <UserCheck className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Quotes Tab */}
            <TabsContent value="quotes" className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">
                  عروض الأسعار المرتبطة ({linkedQuotes.length})
                </h3>
                <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" asChild>
                  <Link href={`/dashboard/quotes/new?lead_id=${lead.id}`}>
                    <Plus className="h-4 w-4 me-1" />
                    إنشاء عرض سعر
                  </Link>
                </Button>
              </div>

              {linkedQuotes.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <EmptyState
                      icon={FileText}
                      title="لا توجد عروض أسعار"
                      description="أنشئ عرض سعر جديد لهذا العميل المحتمل"
                      actionLabel="إنشاء عرض سعر"
                      onAction={() => router.push(`/dashboard/quotes/new?lead_id=${lead.id}`)}
                    />
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {linkedQuotes.map(q => {
                    const statusMap: Record<string, { label: string; className: string }> = {
                      draft: { label: 'مسودة', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
                      pending_approval: { label: 'بانتظار الموافقة', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
                      sent: { label: 'مُرسل', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
                      viewed: { label: 'تمت المشاهدة', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
                      signed: { label: 'مُوقع', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
                      invoiced: { label: 'تم الفوترة', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
                      rejected: { label: 'مرفوض', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
                      expired: { label: 'منتهي', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
                      cancelled: { label: 'ملغي', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
                    };
                    const s = statusMap[q.status] || { label: q.status, className: '' };
                    return (
                      <Link key={q.id} href={`/dashboard/quotes/${q.id}`} className="block">
                        <Card className="hover:border-orange-300 dark:hover:border-orange-700 transition-colors cursor-pointer">
                          <CardContent className="py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div>
                                <p className="font-medium text-sm font-mono">{q.quote_number}</p>
                                <p className="text-xs text-muted-foreground">{q.project_name || '—'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm">
                                {new Intl.NumberFormat('en-AE', { style: 'currency', currency: q.currency || 'AED' }).format(q.total)}
                              </span>
                              <Badge className={cn('text-xs', s.className)}>{s.label}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Messages Tab */}
            <TabsContent value="messages" className="mt-4">
              <Card>
                <CardContent className="py-12">
                  <EmptyState
                    icon={MessageSquare}
                    title="محادثات واتساب"
                    description="سيتم عرض الرسائل هنا بعد ربط واتساب"
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: Summary */}
        <div className="space-y-4">
          {/* Lead Score Card */}
          {lead.score != null && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">التقييم</span>
                  <Badge className={cn('text-sm px-3',
                    lead.score >= 70 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    lead.score >= 40 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' :
                    'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  )}>
                    {lead.score}/100 — {lead.score >= 70 ? 'ساخن' : lead.score >= 40 ? 'دافئ' : 'بارد'}
                  </Badge>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all',
                      lead.score >= 70 ? 'bg-green-500' :
                      lead.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                    )}
                    style={{ width: `${lead.score}%` }}
                  />
                </div>
                {lead.score_breakdown && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                    <span>المصدر: {lead.score_breakdown.source}</span>
                    <span>التواصل: {lead.score_breakdown.contactInfo}</span>
                    <span>التفاعل: {lead.score_breakdown.engagement}</span>
                    <span>المرحلة: {lead.score_breakdown.pipeline}</span>
                    <span>الحداثة: {lead.score_breakdown.recency}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ملخص</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">المرحلة</span>
                <Badge variant="outline">{currentStage?.name_ar || '—'}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الأولوية</span>
                <Badge className={cn('text-xs', PRIORITY_COLORS[lead.priority])}>
                  {PRIORITY_LABELS[lead.priority]}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المصدر</span>
                <span>{SOURCE_LABELS[lead.source] || lead.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المسؤول</span>
                <span>{lead.assigned_to || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">تاريخ الإنشاء</span>
                <span>{formatRelativeDate(lead.created_at)}</span>
              </div>
              {lead.last_contact_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">آخر تواصل</span>
                  <span>{formatRelativeDate(lead.last_contact_at)}</span>
                </div>
              )}
              {lead.next_follow_up && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">القادمة متابعة</span>
                  <span>{formatRelativeDate(lead.next_follow_up)}</span>
                </div>
              )}
              {lead.client_id && (
                <div className="pt-2 border-t">
                  <Link href={`/dashboard/clients/${lead.client_id}`} className="text-orange-600 hover:underline text-xs">
                    عرض ملف العميل ←
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          {!lead.is_converted && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">إجراءات سريعة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start gap-2" asChild>
                  <Link href={`/dashboard/quotes?lead_id=${lead.id}`}>
                    <FileText className="h-4 w-4" />
                    إنشاء عرض سعر
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-green-600"
                  onClick={() => setShowConvert(true)}
                >
                  <UserCheck className="h-4 w-4" />
                  تحويل لعميل فعلي
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Transfer Dialog */}
      <LeadTransferDialog
        open={showTransfer}
        onOpenChange={setShowTransfer}
        leadId={lead.id}
        leadName={lead.name}
        currentAgent={lead.assigned_to}
        onTransferred={fetchLead}
      />

      {/* Conversion Dialog */}
      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تحويل لعميل فعلي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم إنشاء سجل عميل جديد من بيانات <strong>{lead.name}</strong>
            </p>
            <div className="space-y-2 text-sm">
              <p><strong>الاسم:</strong> {lead.name}</p>
              <p><strong>البريد:</strong> {lead.email || '—'}</p>
              <p><strong>الهاتف:</strong> {lead.phone || '—'}</p>
              <p><strong>الشركة:</strong> {lead.company || '—'}</p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="portal"
                checked={convertPortal}
                onCheckedChange={v => setConvertPortal(!!v)}
              />
              <Label htmlFor="portal" className="text-sm cursor-pointer">إنشاء حساب بورتال للعميل</Label>
            </div>

            {convertPortal && (
              <div>
                <Label>كلمة المرور</Label>
                <Input
                  type="password"
                  value={convertPassword}
                  onChange={e => setConvertPassword(e.target.value)}
                  placeholder="كلمة مرور البورتال"
                />
                {!lead.email && (
                  <p className="text-xs text-red-500 mt-1">يجب إضافة بريد إلكتروني أولاً لإنشاء حساب البورتال</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowConvert(false)}>إلغاء</Button>
              <Button
                onClick={handleConvert}
                disabled={converting || (convertPortal && (!lead.email || !convertPassword))}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {converting && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                تحويل لعميل
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, dir }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
  dir?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm" dir={dir}>{value || '—'}</p>
      </div>
    </div>
  );
}
