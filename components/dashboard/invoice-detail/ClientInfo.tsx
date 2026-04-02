'use client';

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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">بيانات العميل</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">الاسم</span>
            <p className="font-medium">{name || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">الشركة</span>
            <p className="font-medium">{company || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">البريد الإلكتروني</span>
            <p className="font-medium">{email || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">الهاتف</span>
            <p className="font-medium">{phone || '—'}</p>
          </div>
        </div>
        {projectName && !editing && (
          <div className="mt-3 pt-3 border-t text-sm">
            <span className="text-muted-foreground">المشروع: </span>
            <span className="font-medium">{projectName}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
