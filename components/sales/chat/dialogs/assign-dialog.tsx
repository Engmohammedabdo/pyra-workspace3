'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
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
  is_online?: boolean;
}

export function AssignDialog({ open, conversationId, remoteJid, instanceName, currentAgent, onAssigned, onClose }: AssignDialogProps) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [workload, setWorkload] = useState<Record<string, number>>({});
  const [selectedAgent, setSelectedAgent] = useState(currentAgent || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    // Fetch agents + workload + online status in parallel
    Promise.all([
      fetchAPI<Array<{ username: string; display_name: string }>>('/api/users?role=sales_agent'),
      fetchAPI<Array<{ username: string; display_name: string }>>('/api/users?role=employee'),
      fetchAPI<Array<{ username: string; display_name: string }>>('/api/users?role=admin'),
      fetchAPI<Array<{ assigned_to?: string; status?: string }>>('/api/dashboard/sales/whatsapp/conversations?status=all&assigned=all&limit=200'),
      fetchAPI<Array<{ username: string; last_activity?: string }>>('/api/sessions').catch(() => []),
    ]).then(([salesData, empData, adminData, convsData, sessionsData]) => {
      // Build online set (active within last 5 minutes)
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      const onlineUsers = new Set<string>();
      for (const s of sessionsData || []) {
        if (s.last_activity && new Date(s.last_activity).getTime() > fiveMinAgo) {
          onlineUsers.add(s.username);
        }
      }

      const all = [
        ...(salesData || []),
        ...(empData || []),
        ...(adminData || []),
      ].map((u) => ({
        username: u.username,
        display_name: u.display_name,
        is_online: onlineUsers.has(u.username),
      }));
      const unique = Array.from(new Map(all.map(a => [a.username, a])).values());
      // Sort: online first
      unique.sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0));
      setAgents(unique);

      // Calculate workload (active conversations per agent)
      const convs = Array.isArray(convsData) ? convsData : [];
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
        await mutateAPI(`/api/dashboard/sales/whatsapp/conversations/${conversationId}/assign`, 'POST', { assigned_to: selectedAgent || null });
      } else {
        // Legacy fallback
        await mutateAPI('/api/dashboard/sales/whatsapp/assignments', 'POST', { remote_jid: remoteJid, instance_name: instanceName, assigned_to: selectedAgent });
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
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${agent.is_online ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      {agent.display_name}
                      <span className="text-muted-foreground text-xs">
                        {workload[agent.username] ? `(${workload[agent.username]})` : ''}
                      </span>
                    </span>
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
