'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateEmployeePayment } from '@/hooks/useEmployeePayments';

interface UserOption {
  username: string;
  display_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserOption[];
}

const EMPTY_FORM = {
  username: '',
  source_type: 'commission',
  description: '',
  amount: '',
  currency: 'AED',
};

export function AddPaymentDialog({ open, onOpenChange, users }: Props) {
  const [payForm, setPayForm] = useState(EMPTY_FORM);

  const createEmployeePayment = useCreateEmployeePayment();

  const handleSave = () => {
    if (!payForm.username || !payForm.amount || !payForm.source_type) {
      toast.error('اختر الموظف والنوع والمبلغ');
      return;
    }
    createEmployeePayment.mutate(
      {
        username: payForm.username,
        source_type: payForm.source_type,
        description: payForm.description || '',
        amount: Number(payForm.amount),
        currency: payForm.currency,
      },
      {
        onSuccess: () => {
          toast.success('تم تسجيل الدفعة');
          onOpenChange(false);
          setPayForm(EMPTY_FORM);
        },
        onError: () => toast.error('فشل في تسجيل الدفعة'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إضافة دفعة جديدة</DialogTitle>
          <DialogDescription>تسجيل عمولة أو مكافأة أو خصم لموظف</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>الموظف *</Label>
            <Select
              value={payForm.username}
              onValueChange={v => setPayForm(p => ({ ...p, username: v }))}
            >
              <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.username} value={u.username}>
                    {u.display_name || u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>النوع *</Label>
            <Select
              value={payForm.source_type}
              onValueChange={v => setPayForm(p => ({ ...p, source_type: v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="commission">عمولة</SelectItem>
                <SelectItem value="task">مهمة</SelectItem>
                <SelectItem value="bonus">مكافأة</SelectItem>
                <SelectItem value="deduction">خصم</SelectItem>
                <SelectItem value="overtime">إضافي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Input
              value={payForm.description}
              onChange={e => setPayForm(p => ({ ...p, description: e.target.value }))}
              placeholder="مثال: عمولة مشروع Etmam Brand Identity"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>المبلغ *</Label>
              <Input
                type="number" step="0.01" min="0"
                value={payForm.amount}
                onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                placeholder="0.00"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>العملة</Label>
              <Select
                value={payForm.currency}
                onValueChange={v => setPayForm(p => ({ ...p, currency: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AED">AED</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="SAR">SAR</SelectItem>
                  <SelectItem value="EGP">EGP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={handleSave}
            disabled={createEmployeePayment.isPending}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {createEmployeePayment.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin me-1" />
            ) : (
              <Plus className="h-4 w-4 me-1" />
            )}
            تسجيل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
