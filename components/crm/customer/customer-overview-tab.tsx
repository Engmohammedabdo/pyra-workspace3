'use client';

/**
 * Overview tab content — summary view of the customer relationship.
 *
 * Layout (responsive):
 *   - lg+: 2-column grid with contact list (left) + key info card (right)
 *   - mobile: stacked vertically
 *   - Notes preview spans full width below
 *   - Portal toggle (admin only) full width below notes
 *
 * Data source: passed-down `customer` from <useCustomerDossier>.
 * No additional fetches — keeps the tab cheap.
 */

import { useRouter, usePathname } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { formatDate, formatRelativeDate } from '@/lib/utils/format';
import { CustomerContactList } from './customer-contact-list';
import { CustomerPortalToggle } from './customer-portal-toggle';
import type { DossierCustomer } from '@/hooks/useCustomerDossier';

interface Props {
  customer: DossierCustomer;
}

const SOURCE_LABEL_AR: Record<string, string> = {
  manual:           'إدخال يدوي',
  whatsapp:         'واتساب',
  website:          'الموقع',
  referral:         'إحالة',
  cold_outreach:    'تواصل بارد',
  social:           'سوشيال ميديا',
  crm_conversion:   'تحويل من CRM',
};

const NOTES_PREVIEW_CHARS = 200;

export function CustomerOverviewTab({ customer }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const notesPreview = customer.notes
    ? customer.notes.length > NOTES_PREVIEW_CHARS
      ? customer.notes.slice(0, NOTES_PREVIEW_CHARS) + '…'
      : customer.notes
    : null;

  return (
    <div className="space-y-4">
      {/* Top row — contact + key info, 2-col on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CustomerContactList customer={customer} />
        <KeyInfoCard customer={customer} />
      </div>

      {/* Notes preview */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">الملاحظات</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.replace(`${pathname}?tab=notes`, { scroll: false })}
          >
            عرض الكل
            <ArrowLeft className="size-3.5 ms-1" />
          </Button>
        </div>
        {notesPreview ? (
          <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{notesPreview}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            لا توجد ملاحظات بعد. أضفها من صفحة الـ Lead.
          </p>
        )}
      </Card>

      {/* Portal access toggle (admin-only, hidden if no client_id) */}
      <CustomerPortalToggle customer={customer} />
    </div>
  );
}

function KeyInfoCard({ customer }: { customer: DossierCustomer }) {
  const sourceLabel = customer.source
    ? SOURCE_LABEL_AR[customer.source] ?? customer.source
    : '—';

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3">معلومات أساسية</h3>
      <dl className="space-y-2.5 text-sm">
        <Row label="نوع الصفقة" value={customer.deal_type ?? '—'} />
        <Row label="المصدر" value={sourceLabel} />
        <Row
          label="احتمال الفوز"
          value={
            customer.win_probability != null
              ? `${customer.win_probability}%`
              : '—'
          }
          tabular
        />
        <Row
          label="تاريخ الإنشاء"
          value={formatDate(customer.created_at, 'd MMM yyyy')}
          tabular
        />
        {customer.converted_at && (
          <Row
            label="تاريخ التحويل لعميل"
            value={formatDate(customer.converted_at, 'd MMM yyyy')}
            tabular
          />
        )}
        {customer.last_contact_at && (
          <Row
            label="آخر تواصل"
            value={formatRelativeDate(customer.last_contact_at)}
            tabular
          />
        )}
      </dl>
    </Card>
  );
}

function Row({
  label,
  value,
  tabular,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={tabular ? 'tabular-nums font-medium' : 'font-medium'}>
        {value}
      </dd>
    </div>
  );
}
