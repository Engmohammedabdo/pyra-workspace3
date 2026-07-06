'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { useStatusLabels } from '@/lib/i18n/status-labels';
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

// Deliberately narrower than the full `paymentSourceType` entity (7 keys) —
// `salary` and `advance` are not user-creatable via this form (they come from
// payroll runs / other server-side paths). See CLAUDE.md HAZARD H2 note.
const CREATABLE_SOURCE_TYPES = ['commission', 'task', 'bonus', 'deduction', 'overtime'] as const;

export function AddPaymentDialog({ open, onOpenChange, users }: Props) {
  const t = useTranslations('hr.payroll.addPaymentDialog');
  const sourceTypeLabelFor = useStatusLabels('paymentSourceType');
  const [payForm, setPayForm] = useState(EMPTY_FORM);

  const createEmployeePayment = useCreateEmployeePayment();

  const handleSave = () => {
    if (!payForm.username || !payForm.amount || !payForm.source_type) {
      toast.error(t('toasts.validationError'));
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
          toast.success(t('toasts.createSuccess'));
          onOpenChange(false);
          setPayForm(EMPTY_FORM);
        },
        onError: () => toast.error(t('toasts.createError')),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('employeeLabel')}</Label>
            <Select
              value={payForm.username}
              onValueChange={v => setPayForm(p => ({ ...p, username: v }))}
            >
              <SelectTrigger><SelectValue placeholder={t('employeePlaceholder')} /></SelectTrigger>
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
            <Label>{t('typeLabel')}</Label>
            <Select
              value={payForm.source_type}
              onValueChange={v => setPayForm(p => ({ ...p, source_type: v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CREATABLE_SOURCE_TYPES.map(st => (
                  <SelectItem key={st} value={st}>{sourceTypeLabelFor(st)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('descriptionLabel')}</Label>
            <Input
              value={payForm.description}
              onChange={e => setPayForm(p => ({ ...p, description: e.target.value }))}
              placeholder={t('descriptionPlaceholder')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('amountLabel')}</Label>
              <Input
                type="number" step="0.01" min="0"
                value={payForm.amount}
                onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                placeholder="0.00"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('currencyLabel')}</Label>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
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
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
