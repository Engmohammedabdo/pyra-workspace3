'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface LeadTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  currentAgent?: string;
  onTransferred: () => void;
}

interface User {
  username: string;
  full_name: string;
}

export function LeadTransferDialog({ open, onOpenChange, leadId, leadName, currentAgent, onTransferred }: LeadTransferDialogProps) {
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<User[]>([]);
  const [toAgent, setToAgent] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      // Fetch users who can be sales agents
      fetch('/api/dashboard/team')
        .then(r => r.json())
        .then(d => {
          const users = (d.data || []).filter((u: User) => u.username !== currentAgent);
          setAgents(users);
        })
        .catch(() => {});
    }
  }, [open, currentAgent]);

  async function handleTransfer() {
    if (!toAgent) {
      toast.error('اختر الموظف المستلم');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/sales/leads/${leadId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_agent: toAgent, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل التحويل');

      toast.success('تم تحويل العميل المحتمل بنجاح');
      setToAgent('');
      setReason('');
      onOpenChange(false);
      onTransferred();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تحويل العميل المحتمل</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            تحويل <strong>{leadName}</strong> إلى موظف آخر
          </p>

          <div>
            <Label>الموظف المستلم *</Label>
            <Select value={toAgent} onValueChange={setToAgent}>
              <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>
                {agents.map(a => (
                  <SelectItem key={a.username} value={a.username}>
                    {a.full_name || a.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>سبب التحويل</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="اختياري..." rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button onClick={handleTransfer} disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white">
              {loading && <Loader2 className="h-4 w-4 animate-spin me-1" />}
              تحويل
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
