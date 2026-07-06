'use client';

import { useTranslations } from 'next-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface BusinessEntity {
  id: string;
  name_en: string;
  name_ar: string;
  license_no: string;
  logo_url: string;
  is_default: boolean;
}

interface Props {
  entities: BusinessEntity[];
  entityId: string;
  onEntityChange: (value: string) => void;
}

export function BusinessEntitySelector({ entities, entityId, onEntityChange }: Props) {
  const t = useTranslations('finance.invoices.new.businessEntity');
  if (entities.length === 0) return null;
  return (
    <div className="space-y-2">
      <Label>{t('label')}</Label>
      <Select value={entityId} onValueChange={onEntityChange}>
        <SelectTrigger>
          <SelectValue placeholder={t('placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {entities.map(e => (
            <SelectItem key={e.id} value={e.id}>
              {e.name_en} {e.is_default ? t('default') : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {entityId && (
        <p className="text-xs text-muted-foreground">
          {t('licenseNumber', { licenseNo: entities.find(e => e.id === entityId)?.license_no ?? '' })}
        </p>
      )}
    </div>
  );
}
