'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  projectName: string;
  setProjectName: (val: string) => void;
  issueDate: string;
  setIssueDate: (val: string) => void;
  dueDate: string;
  setDueDate: (val: string) => void;
  milestoneType: string;
  setMilestoneType: (val: string) => void;
  notes: string;
  setNotes: (val: string) => void;
}

export function InvoiceMeta({ projectName, setProjectName, issueDate, setIssueDate, dueDate, setDueDate, milestoneType, setMilestoneType, notes, setNotes }: Props) {
  const t = useTranslations('finance.invoices.new.meta');
  const milestoneT = useTranslations('finance.invoices.milestoneTypes');
  return (
    <>
      <div className="space-y-2">
        <Label>{t('projectName')}</Label>
        <Input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder={t('projectNamePlaceholder')} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('issueDate')}</Label>
          <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('dueDate')} <span className="text-destructive">*</span></Label>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('milestoneType')}</Label>
        <Select value={milestoneType} onValueChange={setMilestoneType}>
          <SelectTrigger>
            <SelectValue placeholder={t('milestoneTypePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="booking">{milestoneT('booking')}</SelectItem>
            <SelectItem value="initial_delivery">{milestoneT('initial_delivery')}</SelectItem>
            <SelectItem value="final_delivery">{milestoneT('final_delivery')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{t('notes')}</Label>
        <Textarea value={notes} onChange={(e: any) => setNotes(e.target.value)} placeholder={t('notesPlaceholder')} rows={3} />
      </div>
    </>
  );
}
