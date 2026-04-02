import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface Client {
  id: string;
  name: string;
  company: string | null;
}

interface Props {
  clients: Client[];
  clientId: string;
  onClientChange: (value: string) => void;
  loading: boolean;
  displayClientName: string;
  onDisplayClientNameChange: (value: string) => void;
}

export function ClientSelector({ clients, clientId, onClientChange, loading, displayClientName, onDisplayClientNameChange }: Props) {
  return (
    <>
      <div className="space-y-2">
        <Label>العميل</Label>
        <Select value={clientId} onValueChange={onClientChange}>
          <SelectTrigger>
            <SelectValue placeholder={loading ? 'جارٍ التحميل...' : 'اختر العميل'} />
          </SelectTrigger>
          <SelectContent>
            {clients.map(client => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}{client.company ? ` — ${client.company}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {clientId && (
        <div className="space-y-2">
          <Label>اسم العميل في الفاتورة (اختياري)</Label>
          <Input
            value={displayClientName}
            onChange={e => onDisplayClientNameChange(e.target.value)}
            placeholder={clients.find(c => c.id === clientId)?.name || 'اسم مختلف حسب الرخصة التجارية'}
          />
          <p className="text-xs text-muted-foreground">
            اتركه فارغاً لاستخدام اسم العميل الأصلي، أو اكتب اسم مختلف حسب طلب العميل (مثل اسم الرخصة)
          </p>
        </div>
      )}
    </>
  );
}
