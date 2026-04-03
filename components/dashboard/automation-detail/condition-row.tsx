'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';

const CONDITION_OPERATORS: Record<string, string> = {
  equals: 'يساوي',
  not_equals: 'لا يساوي',
  contains: 'يحتوي',
  starts_with: 'يبدأ بـ',
  greater_than: 'أكبر من',
  less_than: 'أقل من',
  is_empty: 'فارغ',
  is_not_empty: 'غير فارغ',
};

interface Props {
  condition: { field: string; operator: string; value: string };
  index: number;
  updateCondition: (index: number, key: string, value: string) => void;
  removeCondition: (index: number) => void;
}

export function ConditionRow({ condition, index, updateCondition, removeCondition }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
      <div className="sm:col-span-4">
        <Input value={condition.field} onChange={(e) => updateCondition(index, 'field', e.target.value)} placeholder="الحقل (مثل: status)" />
      </div>
      <div className="sm:col-span-3">
        <Select value={condition.operator} onValueChange={(v) => updateCondition(index, 'operator', v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CONDITION_OPERATORS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-4">
        <Input
          value={condition.value}
          onChange={(e) => updateCondition(index, 'value', e.target.value)}
          placeholder="القيمة"
          disabled={condition.operator === 'is_empty' || condition.operator === 'is_not_empty'}
        />
      </div>
      <div className="sm:col-span-1 flex justify-end">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeCondition(index)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
