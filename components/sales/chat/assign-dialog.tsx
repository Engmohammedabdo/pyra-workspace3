'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, UserPlus } from 'lucide-react';

interface AssignDialogProps {
  open: boolean;
  conversationId?: string | null;
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

export function AssignDialog({ open, conversationId, remoteJid, instanceName, currentAgent, onAssigned, onClose }: AssignDialogProps) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [workload, setWorkload] = useState<Record<string, number>>({});
  const [selectedAgent, setSelectedAgent] = useState(currentAgent || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    // Fetch agents + workload in parallel
    Promise.all([
      fetch('/api/users?role=sales_agent').then(r => r.json()),
      fetch('/api/users?role=employee').then(r => r.json()),
      fetch('/api/users?role=admin').then(r => r.json()),
      fetch('/api/dashboard/sales/whatsapp/conversations?status=all&assigned=all&limit=200').then(r => r.json()),
    ]).then(([salesData, empData, adminData, convsData]) => {
      const all = [
        ...(salesData.data || []),
        ...(empData.data || []),
        ...(adminData.data || []),
      ].map((u: { username: string; display_name: string }) => ({
        username: u.username,
        display_name: u.display_name,
      }));
      const unique = Array.from(new Map(all.map(a => [a.username, a])).values());
      setAgents(unique);

      // Calculate workload (active conversations per agent)
      const convs = Array.isArray(convsData) ? convsData : (convsData?.data || []);
      const counts: Record<string, number> = {};
      for (const c of convs) {
        if (c.assigned_to && c.status !== 'resolved') {
          counts[c.assigned_to] = (counts[c.assigned_to] || 0) + 1;
        }
      }
      setWorkload(counts);
    }).catch(() => {});
  }, [open]);

  async function handleAssign() {
    setSaving(true);
    try {
      // Use conversation-based assign if conversationId available
      if (conversationId) {
        const res = await fetch(`/api/dashboard/sales/whatsapp/conversations/${conversationId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigned_to: selectedAgent || null }),
        });
        if (!res.ok) throw new Error();
      } else {
        // Legacy fallback
        const res = await fetch('/api/dashboard/sales/whatsapp/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remote_jid: remoteJid, instance_name: instanceName, assigned_to: selectedAgent }),
        });
        if (!res.ok) throw new Error();
      }
      toast.success(selectedAgent ? 'تم تعيين المحادثة' : 'تم إلغاء التعيين');
      onAssigned();
      onClose();
    } catch {
      toast.error('فشل تعيين المحادثة');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-orange-500" />
            تعيين المحادثة لوكيل
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
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
                    {agent.display_name}
                    {workload[agent.username] ? ` (${workload[agent.username]} محادثة)` : ' (فارغ)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button onClick={onClose} variant="outline" size="sm" className="rounded-lg">
            إلغاء
          </Button>
          <Button onClick={handleAssign} disabled={saving} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin me-1" /> : null}
            تعيين
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
