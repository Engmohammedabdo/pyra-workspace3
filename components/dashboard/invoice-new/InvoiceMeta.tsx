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
  return (
    <>
      <div className="space-y-2">
        <Label>اسم المشروع</Label>
        <Input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="اسم المشروع" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>تاريخ الإصدار</Label>
          <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>تاريخ الاستحقاق <span className="text-destructive">*</span></Label>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>نوع الدفعة (اختياري)</Label>
        <Select value={milestoneType} onValueChange={setMilestoneType}>
          <SelectTrigger>
            <SelectValue placeholder="اختر نوع الدفعة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="booking">دفعة حجز</SelectItem>
            <SelectItem value="initial_delivery">تسليم أولي</SelectItem>
            <SelectItem value="final_delivery">تسليم نهائي</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>ملاحظات</Label>
        <Textarea value={notes} onChange={(e: any) => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." rows={3} />
      </div>
    </>
  );
}
