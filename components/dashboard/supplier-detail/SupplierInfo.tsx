'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone, MapPin, Building2, Banknote } from 'lucide-react';

export function SupplierInfo({ supplier }: { supplier: any }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card><CardContent className="p-4 space-y-2">
          <p className="text-sm text-muted-foreground">معلومات التواصل</p>
          {supplier.email && <p className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />{supplier.email}</p>}
          {supplier.phone && <p className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{supplier.phone}</p>}
          {supplier.address && <p className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />{supplier.address}</p>}
          {!supplier.email && !supplier.phone && !supplier.address && <p className="text-sm text-muted-foreground">—</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4 space-y-2">
          <p className="text-sm text-muted-foreground">معلومات مالية</p>
          <p className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /> الرقم الضريبي: {supplier.tax_number || '—'}</p>
          <p className="text-sm">شروط الدفع: {supplier.payment_terms_days} يوم</p>
          <p className="text-sm">العملة: {supplier.currency}</p>
        </CardContent></Card>
      </div>

      {(supplier.bank_name || supplier.bank_account || supplier.bank_iban) && (
        <Card>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm p-4">
            <div><p className="text-muted-foreground">البنك</p><p className="font-medium">{supplier.bank_name || '—'}</p></div>
            <div><p className="text-muted-foreground">رقم الحساب</p><p className="font-medium font-mono" dir="ltr">{supplier.bank_account || '—'}</p></div>
            <div><p className="text-muted-foreground">IBAN</p><p className="font-medium font-mono" dir="ltr">{supplier.bank_iban || '—'}</p></div>
          </CardContent>
        </Card>
      )}

      {supplier.notes && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{supplier.notes}</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
