'use client';

import { useState } from 'react';
import { mutateAPI } from '@/hooks/api-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, Wifi, WifiOff, QrCode, Phone, User, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function WAInstancesManager({ instances, onRefresh, agents }: { instances: any[], onRefresh: () => void, agents: any[] }) {
  const [newInstance, setNewInstance] = useState({ instance_name: '', agent_username: '', phone_number: '' });
  const [adding, setAdding] = useState(false);
  const [qrLoading, setQrLoading] = useState<string | null>(null);
  const [qrData, setQrData] = useState<Record<string, string>>({});

  async function handleAdd() {
    if (!newInstance.instance_name.trim()) { toast.error('اسم الـ Instance مطلوب'); return; }
    setAdding(true);
    try {
      await mutateAPI('/api/dashboard/sales/whatsapp/instances', 'POST', newInstance);
      toast.success('تم إنشاء الـ Instance');
      onRefresh();
    } catch { toast.error('فشل الإنشاء'); } finally { setAdding(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4" /> WhatsApp Instances</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {instances.map((inst: any) => (
          <div key={inst.id} className="border border-border/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', inst.status === 'connected' ? 'bg-green-100' : 'bg-red-100')}>
                  {inst.status === 'connected' ? <Wifi className="h-5 w-5 text-green-600" /> : <WifiOff className="h-5 w-5 text-red-600" />}
                </div>
                <div><p className="font-semibold text-sm">{inst.instance_name}</p></div>
              </div>
              <Badge variant={inst.status === 'connected' ? 'default' : 'secondary'}>{inst.status}</Badge>
            </div>
            {qrData[inst.id] && (
              <div className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-xl border">
                <img src={`data:image/png;base64,${qrData[inst.id]}`} alt="QR Code" className="w-48 h-48" />
              </div>
            )}
          </div>
        ))}
        <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
          <div><Label className="text-xs">اسم Instance</Label><Input value={newInstance.instance_name} onChange={e => setNewInstance(i => ({ ...i, instance_name: e.target.value }))} dir="ltr" /></div>
          <div><Label className="text-xs">الموظف</Label><Select onValueChange={v => setNewInstance(i => ({ ...i, agent_username: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{agents.map((a: any) => <SelectItem key={a.username} value={a.username}>{a.display_name}</SelectItem>)}</SelectContent></Select></div>
          <Button onClick={handleAdd} disabled={adding}>{adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} إنشاء</Button>
        </div>
      </CardContent>
    </Card>
  );
}
