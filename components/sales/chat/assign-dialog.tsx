'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, UserPlus } from 'lucide-react';

interface AssignDialogProps {
  remoteJid: string;
  instanceName: string;
  currentAgent: string | null;
  onAssigned: () => void;
  onClose: () => void;
}

interface AgentOption {
  username: string;
  display_name: string;
}

export function AssignDialog({ remoteJid, instanceName, currentAgent, onAssigned, onClose }: AssignDialogProps) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState(currentAgent || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Fetch all users with sales-related roles
    Promise.all([
      fetch('/api/users?role=sales_agent').then(r => r.json()),
      fetch('/api/users?role=employee').then(r => r.json()),
      fetch('/api/users?role=admin').then(r => r.json()),
    ]).then(([salesData, empData, adminData]) => {
      const all = [
        ...(salesData.data || []),
        ...(empData.data || []),
        ...(adminData.data || []),
      ].map((u: { username: string; display_name: string }) => ({
        username: u.username,
        display_name: u.display_name,
      }));
      // Remove duplicates
      const unique = Array.from(new Map(all.map(a => [a.username, a])).values());
      setAgents(unique);
    }).catch(() => {});
  }, []);

  async function handleAssign() {
    if (!selectedAgent) {
      toast.error('اختر الوكيل');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/sales/whatsapp/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remote_jid: remoteJid,
          instance_name: instanceName,
          assigned_to: selectedAgent,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم تعيين المحادثة');
      onAssigned();
      onClose();
    } catch {
      toast.error('فشل تعيين المحادثة');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute top-14 end-3 z-20 w-72 bg-card border border-border/60 rounded-xl shadow-xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <UserPlus className="h-4 w-4 text-orange-500" />
        تعيين المحادثة لوكيل
      </div>

      <div>
        <Label className="text-xs">الوكيل</Label>
        <Select value={selectedAgent || '__none__'} onValueChange={v => setSelectedAgent(v === '__none__' ? '' : v)}>
          <SelectTrigger className="rounded-lg mt-1">
            <SelectValue placeholder="اختر الوكيل" />
          </SelectTrigger>
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

      <div className="flex gap-2">
        <Button onClick={handleAssign} disabled={saving} size="sm" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin me-1" /> : null}
          تعيين
        </Button>
        <Button onClick={onClose} variant="outline" size="sm" className="rounded-lg">
          إلغاء
        </Button>
      </div>
    </div>
  );
}
