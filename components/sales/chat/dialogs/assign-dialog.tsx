'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { mutateAPI } from '@/hooks/api-helpers';
import { Loader2, UserPlus } from 'lucide-react';
import { useUsers } from '@/hooks/useUsers';
import { useTeams } from '@/hooks/useTeams';

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

interface TeamOption {
  id: string;
  name: string;
  name_ar?: string;
}

export function AssignDialog({ open, conversationId, remoteJid, instanceName, currentAgent, onAssigned, onClose }: AssignDialogProps) {
  const [selectedAgent, setSelectedAgent] = useState(currentAgent || '');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [saving, setSaving] = useState(false);

  // Use existing hooks
  const { data: usersData = [] } = useUsers();
  const { data: teamsData = [] } = useTeams();

  const teams = useMemo<TeamOption[]>(
    () => teamsData.map(t => ({
      id: t.id,
      name: t.name,
      name_ar: t.name_ar as string | undefined,
    })),
    [teamsData]
  );

  const agents = useMemo<AgentOption[]>(() => {
    if (!open) return [];

    const eligible = usersData
      .filter(u => u.role === 'admin' || u.role === 'sales_agent' || u.role === 'employee');
    const mapped = eligible.map(u => ({
      username: String((u as Record<string, unknown>).username || u.id),
      display_name: String((u as Record<string, unknown>).display_name || u.name || u.email || u.id),
    }));
    return Array.from(new Map(mapped.map(a => [a.username, a])).values());
  }, [open, usersData]);

  async function handleAssign() {
    setSaving(true);
    try {
      // Use conversation-based assign if conversationId available
      if (conversationId) {
        const payload: Record<string, unknown> = { assigned_to: selectedAgent || null };
        if (selectedTeam) payload.team_id = selectedTeam === '__none__' ? null : selectedTeam;
        await mutateAPI(`/api/dashboard/sales/whatsapp/conversations/${conversationId}/assign`, 'POST', payload);
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
                    {agent.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {teams.length > 0 && (
            <div>
              <Label className="text-xs">الفريق (اختياري)</Label>
              <Select value={selectedTeam || '__none__'} onValueChange={v => setSelectedTeam(v)}>
                <SelectTrigger className="rounded-lg mt-1">
                  <SelectValue placeholder="اختر الفريق" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بدون فريق</SelectItem>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name_ar || team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
