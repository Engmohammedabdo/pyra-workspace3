'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ClientInfoProps {
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  projectName: string | null;
  editing: boolean;
}

export function ClientInfo({ name, company, email, phone, projectName, editing }: ClientInfoProps) {
  const t = useTranslations('finance.invoices.detail.clientInfo');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t('name')}</span>
            <p className="font-medium">{name || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t('company')}</span>
            <p className="font-medium">{company || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t('email')}</span>
            <p className="font-medium">{email || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t('phone')}</span>
            <p className="font-medium">{phone || '—'}</p>
          </div>
        </div>
        {projectName && !editing && (
          <div className="mt-3 pt-3 border-t text-sm">
            <span className="text-muted-foreground">{t('project')}</span>
            <span className="font-medium">{projectName}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
