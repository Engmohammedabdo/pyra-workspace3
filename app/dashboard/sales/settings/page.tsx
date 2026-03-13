'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import {
  Settings2, Plus, Trash2, GripVertical, Loader2,
  Wifi, WifiOff, QrCode, Phone, User
} from 'lucide-react';

interface Stage {
  id: string;
  name: string;
  name_ar: string;
  color: string;
  sort_order: number;
  is_default: boolean;
}

interface SalesLabel {
  id: string;
  name: string;
  name_ar?: string;
  color: string;
}

interface WAInstance {
  id: string;
  instance_name: string;
  agent_username?: string;
  phone_number?: string;
  status: string;
  qr_code?: string;
  connection_state?: string;
}

const COLORS = ['blue', 'yellow', 'orange', 'purple', 'indigo', 'green', 'red', 'gray', 'pink', 'brown'];
const COLOR_BG: Record<string, string> = {
  blue: 'bg-blue-500', yellow: 'bg-yellow-500', orange: 'bg-orange-500',
  purple: 'bg-purple-500', indigo: 'bg-indigo-500', green: 'bg-green-500',
  red: 'bg-red-500', gray: 'bg-gray-500', pink: 'bg-pink-500', brown: 'bg-amber-700',
};

export default function SalesSettingsPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [labels, setLabels] = useState<SalesLabel[]>([]);
  const [instances, setInstances] = useState<WAInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [stagesRes, labelsRes, instancesRes] = await Promise.all([
        fetch('/api/dashboard/sales/pipeline-stages'),
        fetch('/api/dashboard/sales/labels'),
        fetch('/api/dashboard/sales/whatsapp/instances'),
      ]);
      const stagesData = await stagesRes.json();
      const labelsData = await labelsRes.json();
      const instancesData = await instancesRes.json();

      setStages(stagesData.data || []);
      setLabels(labelsData.data || []);
      setInstances(instancesData.data || []);
    } catch {
      console.error('Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">إعدادات المبيعات</h1>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">إعدادات المبيعات</h1>

      <Tabs defaultValue="stages">
        <TabsList>
          <TabsTrigger value="stages">مراحل Pipeline</TabsTrigger>
          <TabsTrigger value="labels">التصنيفات</TabsTrigger>
          <TabsTrigger value="whatsapp">واتساب</TabsTrigger>
        </TabsList>

        {/* Pipeline Stages */}
        <TabsContent value="stages" className="mt-4">
          <PipelineStagesManager stages={stages} onRefresh={fetchAll} />
        </TabsContent>

        {/* Labels */}
        <TabsContent value="labels" className="mt-4">
          <LabelsManager labels={labels} onRefresh={fetchAll} />
        </TabsContent>

        {/* WhatsApp */}
        <TabsContent value="whatsapp" className="mt-4">
          <WAInstancesManager instances={instances} onRefresh={fetchAll} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Pipeline Stages Manager ──────────────────────────────
function PipelineStagesManager({ stages, onRefresh }: { stages: Stage[]; onRefresh: () => void }) {
  const [newStage, setNewStage] = useState({ name: '', name_ar: '', color: 'blue' });
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!newStage.name_ar.trim()) {
      toast.error('اسم المرحلة مطلوب');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/dashboard/sales/pipeline-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStage),
      });
      if (!res.ok) throw new Error();
      toast.success('تمت إضافة المرحلة');
      setNewStage({ name: '', name_ar: '', color: 'blue' });
      onRefresh();
    } catch {
      toast.error('فشل إضافة المرحلة');
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">مراحل خط المبيعات</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stages.map((stage, i) => (
          <div key={stage.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
            <div className={cn('w-4 h-4 rounded-full shrink-0', COLOR_BG[stage.color] || 'bg-gray-500')} />
            <span className="flex-1 text-sm font-medium">{stage.name_ar}</span>
            <Badge variant="outline" className="text-xs">{stage.name || '—'}</Badge>
            {stage.is_default && <Badge className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">افتراضي</Badge>}
          </div>
        ))}

        <div className="border-t pt-4 grid grid-cols-4 gap-2 items-end">
          <div>
            <Label className="text-xs">الاسم (عربي)</Label>
            <Input value={newStage.name_ar} onChange={e => setNewStage(s => ({ ...s, name_ar: e.target.value }))} placeholder="اسم المرحلة" />
          </div>
          <div>
            <Label className="text-xs">الاسم (إنجليزي)</Label>
            <Input value={newStage.name} onChange={e => setNewStage(s => ({ ...s, name: e.target.value }))} placeholder="Stage name" dir="ltr" />
          </div>
          <div>
            <Label className="text-xs">اللون</Label>
            <Select value={newStage.color} onValueChange={v => setNewStage(s => ({ ...s, color: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLORS.map(c => (
                  <SelectItem key={c} value={c}>
                    <div className="flex items-center gap-2">
                      <div className={cn('w-3 h-3 rounded-full', COLOR_BG[c])} />
                      {c}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={adding} className="bg-orange-500 hover:bg-orange-600 text-white">
            {adding ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <Plus className="h-4 w-4 me-1" />}
            إضافة
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Labels Manager ──────────────────────────────────────
function LabelsManager({ labels, onRefresh }: { labels: SalesLabel[]; onRefresh: () => void }) {
  const [newLabel, setNewLabel] = useState({ name: '', name_ar: '', color: 'blue' });
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!newLabel.name.trim() && !newLabel.name_ar.trim()) {
      toast.error('اسم التصنيف مطلوب');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/dashboard/sales/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLabel),
      });
      if (!res.ok) throw new Error();
      toast.success('تم إضافة التصنيف');
      setNewLabel({ name: '', name_ar: '', color: 'blue' });
      onRefresh();
    } catch {
      toast.error('فشل إضافة التصنيف');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('حذف هذا التصنيف؟')) return;
    try {
      const res = await fetch('/api/dashboard/sales/labels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم الحذف');
      onRefresh();
    } catch {
      toast.error('فشل الحذف');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">التصنيفات</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {labels.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لا توجد تصنيفات</p>
        ) : (
          labels.map(label => (
            <div key={label.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
              <div className="flex items-center gap-2">
                <div className={cn('w-3 h-3 rounded-full', COLOR_BG[label.color] || 'bg-gray-500')} />
                <span className="text-sm">{label.name_ar || label.name}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(label.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}

        <div className="border-t pt-4 grid grid-cols-4 gap-2 items-end">
          <div>
            <Label className="text-xs">الاسم (عربي)</Label>
            <Input value={newLabel.name_ar} onChange={e => setNewLabel(l => ({ ...l, name_ar: e.target.value }))} placeholder="اسم التصنيف" />
          </div>
          <div>
            <Label className="text-xs">الاسم (إنجليزي)</Label>
            <Input value={newLabel.name} onChange={e => setNewLabel(l => ({ ...l, name: e.target.value }))} placeholder="Label name" dir="ltr" />
          </div>
          <div>
            <Label className="text-xs">اللون</Label>
            <Select value={newLabel.color} onValueChange={v => setNewLabel(l => ({ ...l, color: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLORS.map(c => (
                  <SelectItem key={c} value={c}>
                    <div className="flex items-center gap-2">
                      <div className={cn('w-3 h-3 rounded-full', COLOR_BG[c])} />
                      {c}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={adding} className="bg-orange-500 hover:bg-orange-600 text-white">
            {adding ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <Plus className="h-4 w-4 me-1" />}
            إضافة
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── WhatsApp Instances Manager ──────────────────────────
interface AgentOption {
  username: string;
  display_name: string;
}

function WAInstancesManager({ instances, onRefresh }: { instances: WAInstance[]; onRefresh: () => void }) {
  const [newInstance, setNewInstance] = useState({ instance_name: '', agent_username: '', phone_number: '' });
  const [adding, setAdding] = useState(false);
  const [qrLoading, setQrLoading] = useState<string | null>(null);
  const [qrData, setQrData] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<AgentOption[]>([]);

  useEffect(() => {
    // Fetch sales agents + employees for dropdown
    fetch('/api/users?role=sales_agent')
      .then(r => r.json())
      .then(d => {
        const salesAgents = (d.data || []).map((u: { username: string; display_name: string }) => ({
          username: u.username,
          display_name: u.display_name,
        }));
        // Also fetch employees
        fetch('/api/users?role=employee')
          .then(r2 => r2.json())
          .then(d2 => {
            const employees = (d2.data || []).map((u: { username: string; display_name: string }) => ({
              username: u.username,
              display_name: u.display_name,
            }));
            setAgents([...salesAgents, ...employees]);
          });
      })
      .catch(() => {});
  }, []);

  async function handleAdd() {
    if (!newInstance.instance_name.trim()) {
      toast.error('اسم الـ Instance مطلوب');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/dashboard/sales/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newInstance),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإنشاء');
      toast.success('تم إنشاء الـ Instance');
      setNewInstance({ instance_name: '', agent_username: '', phone_number: '' });
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setAdding(false);
    }
  }

  async function handleGetQR(instanceId: string) {
    setQrLoading(instanceId);
    try {
      const res = await fetch(`/api/dashboard/sales/whatsapp/instances/${instanceId}`);
      const data = await res.json();
      if (data.data?.qr_code) {
        setQrData(prev => ({ ...prev, [instanceId]: data.data.qr_code }));
      } else {
        toast.info(data.data?.connection_state === 'open' ? 'الـ Instance متصل بالفعل' : 'لم يتم العثور على QR Code');
      }
      onRefresh();
    } catch {
      toast.error('فشل جلب QR Code');
    } finally {
      setQrLoading(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4" />
          WhatsApp Instances
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {instances.length === 0 ? (
          <EmptyState icon={Phone} title="لا يوجد Instances" description="أضف Instance لربط واتساب بموظف" />
        ) : (
          instances.map(inst => (
            <div key={inst.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {inst.status === 'connected' ? (
                    <Wifi className="h-5 w-5 text-green-500" />
                  ) : (
                    <WifiOff className="h-5 w-5 text-red-500" />
                  )}
                  <div>
                    <p className="font-medium text-sm">{inst.instance_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {inst.agent_username && <span className="flex items-center gap-1"><User className="h-3 w-3" />{inst.agent_username}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={inst.status === 'connected' ? 'default' : 'secondary'}>
                    {inst.status === 'connected' ? 'متصل' : inst.status === 'pending' ? 'جاري الاتصال' : 'غير متصل'}
                  </Badge>
                  {inst.status !== 'connected' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleGetQR(inst.id)}
                      disabled={qrLoading === inst.id}
                    >
                      {qrLoading === inst.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4 me-1" />}
                      QR Code
                    </Button>
                  )}
                </div>
              </div>
              {qrData[inst.id] && (
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  <img src={`data:image/png;base64,${qrData[inst.id]}`} alt="QR Code" className="w-48 h-48" />
                </div>
              )}
            </div>
          ))
        )}

        <div className="border-t pt-4 grid grid-cols-4 gap-2 items-end">
          <div>
            <Label className="text-xs">اسم Instance</Label>
            <Input value={newInstance.instance_name} onChange={e => setNewInstance(i => ({ ...i, instance_name: e.target.value }))} placeholder="my-instance" dir="ltr" />
          </div>
          <div>
            <Label className="text-xs">الموظف</Label>
            <Select value={newInstance.agent_username || '__none__'} onValueChange={v => setNewInstance(i => ({ ...i, agent_username: v === '__none__' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">بدون تعيين</SelectItem>
                {agents.map(agent => (
                  <SelectItem key={agent.username} value={agent.username}>
                    {agent.display_name} ({agent.username})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">رقم الهاتف</Label>
            <Input value={newInstance.phone_number} onChange={e => setNewInstance(i => ({ ...i, phone_number: e.target.value }))} placeholder="+971..." dir="ltr" />
          </div>
          <Button onClick={handleAdd} disabled={adding} className="bg-orange-500 hover:bg-orange-600 text-white">
            {adding ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <Plus className="h-4 w-4 me-1" />}
            إنشاء
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
