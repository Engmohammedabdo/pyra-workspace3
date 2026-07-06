'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useStatusLabels } from '@/lib/i18n/status-labels';

interface BasicInfoProps {
  form: any;
  clients: any[];
  contracts: any[];
  updateForm: (field: string, value: any) => void;
}

export function BasicInfo({ form, clients, contracts, updateForm }: BasicInfoProps) {
  const t = useTranslations('finance.recurring.new.basicInfo');
  const cycleLabelFor = useStatusLabels('periodCycle');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cardTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">{t('titleLabel')}</Label>
          <Input id="title" value={form.title} onChange={(e) => updateForm('title', e.target.value)} placeholder={t('titlePlaceholder')} required />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="client_id">{t('clientLabel')}</Label>
            <Select value={form.client_id} onValueChange={(value) => updateForm('client_id', value)}>
              <SelectTrigger>
                <SelectValue placeholder={t('clientPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>{client.name} {client.company ? `- ${client.company}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract_id">{t('contractLabel')}</Label>
            <Select value={form.contract_id} onValueChange={(value) => updateForm('contract_id', value)}>
              <SelectTrigger>
                <SelectValue placeholder={t('contractPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {contracts.map((contract) => (
                  <SelectItem key={contract.id} value={contract.id}>{contract.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="billing_cycle">{t('billingCycleLabel')}</Label>
            <Select value={form.billing_cycle} onValueChange={(value) => updateForm('billing_cycle', value)}>
              <SelectTrigger>
                <SelectValue placeholder={t('billingCyclePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{cycleLabelFor('monthly')}</SelectItem>
                <SelectItem value="quarterly">{cycleLabelFor('quarterly')}</SelectItem>
                <SelectItem value="yearly">{cycleLabelFor('yearly')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="next_generation_date">{t('nextGenerationDateLabel')}</Label>
            <Input id="next_generation_date" type="date" value={form.next_generation_date} onChange={(e) => updateForm('next_generation_date', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">{t('currencyLabel')}</Label>
            <Select value={form.currency} onValueChange={(value) => updateForm('currency', value)}>
              <SelectTrigger>
                <SelectValue placeholder={t('currencyPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AED">{t('currencies.AED')}</SelectItem>
                <SelectItem value="USD">{t('currencies.USD')}</SelectItem>
                <SelectItem value="EUR">{t('currencies.EUR')}</SelectItem>
                <SelectItem value="SAR">{t('currencies.SAR')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="auto_send">{t('autoSendLabel')}</Label>
            <div className="flex items-center gap-3 pt-1">
              <Switch id="auto_send" checked={form.auto_send} onCheckedChange={(checked) => updateForm('auto_send', checked)} />
              <span className="text-sm text-muted-foreground">{t('autoSendHelpText')}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
