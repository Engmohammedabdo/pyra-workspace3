'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { LeadActivityTimeline } from '@/components/sales/lead-activity-timeline';
import { LeadTransferDialog } from '@/components/sales/lead-transfer-dialog';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import { ArrowRight, Phone, Mail, Building2, User, Clock, Edit2, Save, X, ArrowRightLeft, FileText, Trash2, UserCheck, AlertCircle, Plus, StickyNote, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { InfoRow } from '@/components/dashboard/lead-detail/InfoRow';
import { LeadMessagesTab } from '@/components/dashboard/lead-detail/LeadMessagesTab';
import { EmptyState } from '@/components/ui/empty-state';

interface Lead {
  id: string; name: string; phone?: string; email?: string; company?: string; source: string; stage_id: string; assigned_to?: string; client_id?: string; notes?: string; priority: string; score?: number; score_breakdown?: any; last_contact_at?: string; next_follow_up?: string; is_converted: boolean; created_at: string;
}
interface Stage { id: string; name_ar: string; color: string; }
interface Activity { id: string; activity_type: string; description?: string; created_at: string; }
interface FollowUp { id: string; title?: string; due_at: string; status: string; notes?: string; }
interface LinkedQuote { id: string; quote_number: string; project_name?: string; status: string; total: number; currency: string; }

const PRIORITY_LABELS: Record<string, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة' };
const SOURCE_LABELS: Record<string, string> = { manual: 'يدوي', whatsapp: 'واتساب', website: 'موقع', referral: 'إحالة', ad: 'إعلان', social: 'سوشيال' };
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
  const [newActivity, setNewActivity] = useState({ type: 'note', description: '' });
  const [addingActivity, setAddingActivity] = useState(false);
  const [newFollowUp, setNewFollowUp] = useState({ title: '', due_at: '', notes: '' });
  const [addingFollowUp, setAddingFollowUp] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [convertPortal, setConvertPortal] = useState(false);
  const [convertPassword, setConvertPassword] = useState('');
  const [converting, setConverting] = useState(false);

  const fetchLead = useCallback(async () => {
    try {
      const [leadRes, stagesRes, activitiesRes, followUpsRes, quotesRes] = await Promise.all([
        fetch(`/api/dashboard/sales/leads/${id}`), fetch('/api/dashboard/sales/pipeline-stages'), fetch(`/api/dashboard/sales/leads/${id}/activities`), fetch(`/api/dashboard/sales/follow-ups?lead_id=${id}`), fetch(`/api/dashboard/sales/leads/${id}/quotes`),
      ]);
      const [l, s, a, f, q] = await Promise.all([leadRes.json(), stagesRes.json(), activitiesRes.json(), followUpsRes.json(), quotesRes.json()]);
      if (!leadRes.ok) { toast.error('العميل غير موجود'); router.push('/dashboard/sales/leads'); return; }
      setLead(l.data); setStages(s.data || []); setActivities(a.data || []); setFollowUps(f.data || []); setLinkedQuotes(q.data || []);
    } catch { toast.error('فشل تحميل البيانات'); } finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { fetchLead(); }, [fetchLead]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/sales/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) });
      if (!res.ok) throw new Error();
      toast.success('تم حفظ التعديلات'); setEditing(false); fetchLead();
    } catch { toast.error('فشل حفظ التعديلات'); } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm('هل أنت متأكد؟')) return;
    try { const res = await fetch(`/api/dashboard/sales/leads/${id}`, { method: 'DELETE' }); if (!res.ok) throw new Error(); toast.success('تم الحذف'); router.push('/dashboard/sales/leads'); } catch { toast.error('فشل الحذف'); }
  }

  async function handleAddActivity() {
    if (!newActivity.description.trim()) return; setAddingActivity(true);
    try { await fetch(`/api/dashboard/sales/leads/${id}/activities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activity_type: newActivity.type, description: newActivity.description }) }); setNewActivity({ type: 'note', description: '' }); fetchLead(); } catch { toast.error('فشل إضافة النشاط'); } finally { setAddingActivity(false); }
  }

  async function handleAddFollowUp() {
    if (!newFollowUp.due_at) { toast.error('وقت المتابعة مطلوب'); return; } setAddingFollowUp(true);
    try { await fetch('/api/dashboard/sales/follow-ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: id, ...newFollowUp }) }); toast.success('تم إضافة المتابعة'); setNewFollowUp({ title: '', due_at: '', notes: '' }); fetchLead(); } catch { toast.error('فشل إضافة المتابعة'); } finally { setAddingFollowUp(false); }
  }

  async function handleCompleteFollowUp(fuId: string) {
    try { await fetch('/api/dashboard/sales/follow-ups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: fuId, status: 'completed' }) }); toast.success('تم إكمال المتابعة'); fetchLead(); } catch { toast.error('فشل تحديث المتابعة'); }
  }

  async function handleConvert() {
    setConverting(true);
    try { const res = await fetch(`/api/dashboard/sales/leads/${id}/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ create_portal_access: convertPortal, password: convertPassword || undefined }) }); if (!res.ok) throw new Error('فشل التحويل'); toast.success('تم التحويل'); setShowConvert(false); fetchLead(); } catch { toast.error('حدث خطأ'); } finally { setConverting(false); }
  }

  async function handleStageChange(stageId: string) {
    try { await fetch(`/api/dashboard/sales/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage_id: stageId }) }); toast.success('تم التغيير'); fetchLead(); } catch { toast.error('فشل'); }
  }

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-64" /><div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><Skeleton className="h-64 col-span-2 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div></div>;
  if (!lead) return <EmptyState icon={AlertCircle} title="غير موجود" description="..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Link href="/dashboard/sales/leads">العملاء المحتملين</Link><ArrowRight className="h-3 w-3 rtl:rotate-180" /><span>{lead.name}</span></div>
          <h1 className="text-2xl font-bold flex items-center gap-2">{lead.name}{lead.is_converted && <Badge>محوّل لعميل</Badge>}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTransfer(true)}><ArrowRightLeft className="h-4 w-4 me-1" />تحويل</Button>
          {!editing ? <Button variant="outline" size="sm" onClick={() => { setEditing(true); setEditForm(lead); }}><Edit2 className="h-4 w-4 me-1" />تعديل</Button> : <><Button size="sm" onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">{saving ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <Save className="h-4 w-4 me-1" />}حفظ</Button><Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button></>}
          <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto pb-2">{stages.map((stage, i) => { const isActive = stage.id === lead.stage_id; const isPast = stages.findIndex(s => s.id === lead.stage_id) > i; return (<button key={stage.id} onClick={() => handleStageChange(stage.id)} className={cn('px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap', isActive ? 'bg-orange-500 text-white shadow-md' : isPast ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground')}>{stage.name_ar}</button>); })}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Tabs defaultValue="info">
            <TabsList className="w-full justify-start"><TabsTrigger value="info">المعلومات</TabsTrigger><TabsTrigger value="activity">النشاط</TabsTrigger><TabsTrigger value="followups">المتابعات</TabsTrigger><TabsTrigger value="quotes">عروض الأسعار</TabsTrigger><TabsTrigger value="messages">الرسائل</TabsTrigger></TabsList>
            <TabsContent value="info" className="mt-4"><Card><CardContent className="pt-6 space-y-4">{editing ? <div className="grid grid-cols-2 gap-4"><div className="col-span-2"><Label>الاسم</Label><Input value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div><div><Label>الهاتف</Label><Input value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" /></div><div><Label>البريد</Label><Input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} dir="ltr" /></div></div> : <div className="space-y-3"><InfoRow icon={User} label="الاسم" value={lead.name} /><InfoRow icon={Phone} label="الهاتف" value={lead.phone} dir="ltr" /><InfoRow icon={Mail} label="البريد" value={lead.email} dir="ltr" /><InfoRow icon={Building2} label="الشركة" value={lead.company} /><div className="flex items-start gap-3 py-2 border-b"><StickyNote className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">ملاحظات</p><p className="text-sm">{lead.notes || '—'}</p></div></div></div>}</CardContent></Card></TabsContent>
            <TabsContent value="activity" className="mt-4 space-y-4"><Card><CardHeader><CardTitle className="text-base">إضافة نشاط</CardTitle></CardHeader><CardContent><div className="flex gap-2"><Select value={newActivity.type} onValueChange={v => setNewActivity(a => ({ ...a, type: v }))}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="note">ملاحظة</SelectItem><SelectItem value="call">مكالمة</SelectItem><SelectItem value="message">رسالة</SelectItem></SelectContent></Select><Input value={newActivity.description} onChange={e => setNewActivity(a => ({ ...a, description: e.target.value }))} placeholder="..." /><Button onClick={handleAddActivity} disabled={addingActivity} className="bg-orange-500">إضافة</Button></div></CardContent></Card><Card><CardContent className="pt-6"><LeadActivityTimeline activities={activities} /></CardContent></Card></TabsContent>
            <TabsContent value="followups" className="mt-4 space-y-4"><Card><CardHeader><CardTitle className="text-base">إضافة متابعة</CardTitle></CardHeader><CardContent><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><Input value={newFollowUp.title} onChange={e => setNewFollowUp(f => ({ ...f, title: e.target.value }))} placeholder="عنوان" /><Input type="datetime-local" value={newFollowUp.due_at} onChange={e => setNewFollowUp(f => ({ ...f, due_at: e.target.value }))} dir="ltr" /><Button onClick={handleAddFollowUp} disabled={addingFollowUp} className="bg-orange-500">إضافة</Button></div></CardContent></Card>{followUps.map(fu => <Card key={fu.id}><CardContent className="py-3 flex items-center justify-between"><div><p className="font-medium text-sm">{fu.title}</p></div><Button size="sm" variant="ghost" onClick={() => handleCompleteFollowUp(fu.id)}><UserCheck className="h-4 w-4" /></Button></CardContent></Card>)}</TabsContent>
            <TabsContent value="quotes" className="mt-4 space-y-4"><div className="flex items-center justify-between"><h3 className="text-sm font-medium text-muted-foreground">عروض الأسعار ({linkedQuotes.length})</h3><Button size="sm" className="bg-orange-500" asChild><Link href={`/dashboard/quotes/new?lead_id=${lead.id}`}><Plus className="h-4 w-4" /></Link></Button></div>{linkedQuotes.map(q => <Link key={q.id} href={`/dashboard/quotes/${q.id}`}><Card className="py-3 px-4 mb-2 flex justify-between"><span>{q.quote_number}</span><span>{q.total}</span></Card></Link>)}</TabsContent>
            <TabsContent value="messages" className="mt-4"><LeadMessagesTab leadId={id} /></TabsContent>
          </Tabs>
        </div>
        <div className="space-y-4"><Card><CardHeader><CardTitle className="text-base">ملخص</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">المرحلة</span><Badge variant="outline">{stages.find(s => s.id === lead.stage_id)?.name_ar || '—'}</Badge></div><div className="flex justify-between"><span className="text-muted-foreground">الأولوية</span><Badge className={cn('text-xs', PRIORITY_COLORS[lead.priority])}>{PRIORITY_LABELS[lead.priority]}</Badge></div><div className="flex justify-between"><span className="text-muted-foreground">المصدر</span><span>{SOURCE_LABELS[lead.source] || lead.source}</span></div></CardContent></Card></div>
      </div>
      <LeadTransferDialog open={showTransfer} onOpenChange={setShowTransfer} leadId={lead.id} leadName={lead.name} currentAgent={lead.assigned_to} onTransferred={fetchLead} />
      <Dialog open={showConvert} onOpenChange={setShowConvert}><DialogContent><DialogHeader><DialogTitle>تحويل لعميل</DialogTitle></DialogHeader><Button onClick={handleConvert}>تأكيد</Button></DialogContent></Dialog>
    </div>
  );
}
