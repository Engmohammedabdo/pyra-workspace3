'use client';

import { useTranslations } from 'next-intl';
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
  const t = useTranslations('finance.invoices.new.clientSelector');
  return (
    <>
      <div className="space-y-2">
        <Label>{t('label')}</Label>
        <Select value={clientId} onValueChange={onClientChange}>
          <SelectTrigger>
            <SelectValue placeholder={loading ? t('loading') : t('placeholder')} />
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
          <Label>{t('displayNameLabel')}</Label>
          <Input
            value={displayClientName}
            onChange={e => onDisplayClientNameChange(e.target.value)}
            placeholder={clients.find(c => c.id === clientId)?.name || t('displayNamePlaceholder')}
          />
          <p className="text-xs text-muted-foreground">
            {t('helpText')}
          </p>
        </div>
      )}
    </>
  );
}
