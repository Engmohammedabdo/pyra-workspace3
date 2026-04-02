import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { FileSignature } from 'lucide-react';

const TYPE_MAP: Record<string, string> = {
  retainer: 'ثابت شهري',
  milestone: 'مراحل',
  upfront_delivery: 'دفعة مقدمة + تسليم',
  fixed: 'سعر ثابت',
  hourly: 'بالساعة',
};

export function ContractDetails({ contract }: { contract: any }) {
  const isRetainer = contract.contract_type === 'retainer';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-4 w-4" />
          تفاصيل العقد
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {contract.contract_type && (
            <div>
              <p className="text-muted-foreground text-xs">نوع العقد</p>
              <p className="font-medium">{TYPE_MAP[contract.contract_type] || contract.contract_type}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs">القيمة الإجمالية</p>
            <p className="font-mono font-bold">{formatCurrency(contract.total_value, contract.currency)}</p>
          </div>
          {isRetainer && contract.retainer_amount > 0 && (
            <div>
              <p className="text-muted-foreground text-xs">المبلغ الشهري</p>
              <p className="font-mono">{formatCurrency(contract.retainer_amount, contract.currency)}</p>
            </div>
          )}
          {contract.project_name && (
            <div>
              <p className="text-muted-foreground text-xs">المشروع</p>
              <p>{contract.project_name}</p>
            </div>
          )}
          {contract.start_date && (
            <div>
              <p className="text-muted-foreground text-xs">تاريخ البداية</p>
              <p>{formatDate(contract.start_date)}</p>
            </div>
          )}
          {contract.end_date && (
            <div>
              <p className="text-muted-foreground text-xs">تاريخ النهاية</p>
              <p>{formatDate(contract.end_date)}</p>
            </div>
          )}
        </div>
        {contract.description && (
          <p className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">{contract.description}</p>
        )}
      </CardContent>
    </Card>
  );
}
