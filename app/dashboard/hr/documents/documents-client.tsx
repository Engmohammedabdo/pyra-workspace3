'use client';

import { useState, useMemo } from 'react';
import { FileText, Settings, Upload } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { useEmployeeDocuments } from '@/hooks/useEmployeeDocuments';
import { useDocumentTypes } from '@/hooks/useDocumentTypes';
import { useUsers } from '@/hooks/useUsers';
import { classifyExpiry, EXPIRY_BADGE, type ExpiryTier } from '@/lib/hr/document-expiry';
import { dubaiDayKey, formatDate } from '@/lib/utils/format';
import { UploadDocumentDialog } from '@/components/hr/documents/UploadDocumentDialog';
import { DocumentRowActions } from '@/components/hr/documents/DocumentRowActions';
import type { PyraEmployeeDocument } from '@/types/database';

type ExpiryFilter = 'all' | 'expiring' | 'expired';

export default function DocumentsClient() {
  const todayKey = dubaiDayKey();

  const [employeeFilter, setEmployeeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('all');
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: docsResponse, isLoading } = useEmployeeDocuments({
    employee_username: employeeFilter || undefined,
    type_id: typeFilter || undefined,
  });
  const { data: docTypes = [] } = useDocumentTypes();
  const { data: allUsers = [] } = useUsers();

  const employees = useMemo(
    () => allUsers.filter((u) => u.role !== 'client' && u.status === 'active'),
    [allUsers],
  );

  const allDocs = useMemo(
    () => docsResponse?.documents ?? [],
    [docsResponse],
  );

  const docs = useMemo(() => {
    if (expiryFilter === 'all') return allDocs;
    return allDocs.filter((d) => {
      const tier: ExpiryTier = classifyExpiry(d.expiry_date, todayKey);
      if (expiryFilter === 'expired') return tier === 'expired';
      if (expiryFilter === 'expiring') return tier === 'expiring_7' || tier === 'expiring_30';
      return true;
    });
  }, [allDocs, expiryFilter, todayKey]);

  const activeTypes = docTypes.filter((t) => t.is_active);

  const columns: ColumnDef<PyraEmployeeDocument>[] = [
    {
      key: 'employee',
      header: 'الموظف',
      render: (row) => (
        <span className="font-medium">
          {row.employee_display_name || row.employee_username}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'نوع الوثيقة',
      render: (row) => (
        <span className="text-muted-foreground">{row.type_name_ar ?? '—'}</span>
      ),
    },
    {
      key: 'label',
      header: 'التسمية',
      render: (row) => (
        <span className="text-muted-foreground">{row.label || '—'}</span>
      ),
    },
    {
      key: 'expiry',
      header: 'تاريخ الانتهاء',
      render: (row) => {
        const tier = classifyExpiry(row.expiry_date, todayKey);
        const badge = EXPIRY_BADGE[tier];
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
            {row.expiry_date ? formatDate(row.expiry_date) : ''}
            {' '}
            {badge.labelAr}
          </span>
        );
      },
    },
    {
      key: 'uploaded_by',
      header: 'رُفعت بواسطة',
      render: (row) => (
        <span className="text-sm text-muted-foreground">{row.uploaded_by}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-end',
      render: (row) => <DocumentRowActions doc={row} />,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">وثائق الموظفين</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            إدارة الوثائق والشهادات الرسمية للموظفين
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/hr/documents/settings">
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Settings className="h-4 w-4" />
              الإعدادات
            </Button>
          </Link>
          <Button
            className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5"
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="h-4 w-4" />
            رفع وثيقة
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="كل الموظفين" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">كل الموظفين</SelectItem>
            {employees.map((u) => (
              <SelectItem key={u.username as string} value={u.username as string}>
                {(u.display_name || u.name || u.username) as string}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="كل الأنواع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">كل الأنواع</SelectItem>
            {activeTypes.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name_ar}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={expiryFilter}
          onValueChange={(v) => setExpiryFilter(v as ExpiryFilter)}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الوثائق</SelectItem>
            <SelectItem value="expiring">تنتهي قريباً</SelectItem>
            <SelectItem value="expired">منتهية الصلاحية</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable<PyraEmployeeDocument>
        columns={columns}
        data={docs}
        loading={isLoading}
        getRowId={(row) => row.id}
        skeletonRows={6}
        emptyState={{
          icon: FileText,
          title: 'لا توجد وثائق',
          description: 'ارفع أول وثيقة بالضغط على "رفع وثيقة"',
          actionLabel: 'رفع وثيقة',
          onAction: () => setUploadOpen(true),
        }}
      />

      {/* Upload dialog */}
      <UploadDocumentDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        employees={employees}
      />
    </div>
  );
}
