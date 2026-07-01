'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarDays, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { dubaiDayKey } from '@/lib/utils/format';
import {
  useLeaveBalancesAdmin,
  type EmployeeLeaveBalances,
} from '@/hooks/useLeaveBalancesAdmin';
import { AdjustBalanceDialog } from '@/components/hr/leave-balances/AdjustBalanceDialog';

export default function LeaveBalancesClient() {
  const currentYear = Number(dubaiDayKey().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const { data: employees = [], isLoading } = useLeaveBalancesAdmin(year);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeLeaveBalances | null>(null);

  const openEdit = (employee: EmployeeLeaveBalances) => {
    setSelectedEmployee(employee);
    setDialogOpen(true);
  };

  // Columns are derived from the first employee's balances — the API
  // returns one entry per active leave type, in the same order, for every
  // employee (zero-filled when no row exists yet).
  const leaveTypeColumns = employees[0]?.balances.map((b) => ({
    id: b.leave_type_id,
    name_ar: b.name_ar,
  })) ?? [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-orange-500" aria-hidden />
            أرصدة الإجازات
          </h1>
          <p className="text-sm text-muted-foreground">
            عرض وتعديل أرصدة إجازات الموظفين حسب السنة
          </p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={String(currentYear - 1)}>{currentYear - 1}</SelectItem>
            <SelectItem value={String(currentYear)}>{currentYear}</SelectItem>
            <SelectItem value={String(currentYear + 1)}>{currentYear + 1}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {employees.length === 0 ? (
        <Card className="overflow-hidden">
          <EmptyState
            icon={CalendarDays}
            title="لا يوجد موظفون"
            description="لا توجد بيانات أرصدة إجازات لهذه السنة بعد"
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              أرصدة {year} ({employees.length} موظف)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 dark:bg-muted/20">
                  <th scope="col" className="text-start p-3 font-medium">
                    الموظف
                  </th>
                  {leaveTypeColumns.map((c) => (
                    <th key={c.id} scope="col" className="text-start p-3 font-medium">
                      {c.name_ar}
                    </th>
                  ))}
                  <th scope="col" className="text-start p-3 font-medium">
                    إجراء
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {employees.map((emp) => (
                  <tr key={emp.username} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium whitespace-nowrap">{emp.display_name}</td>
                    {emp.balances.map((b) => (
                      <td key={b.leave_type_id} className="p-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span
                            className={cn(
                              'font-semibold',
                              b.remaining < 0 && 'text-red-600 dark:text-red-400',
                            )}
                            dir="ltr"
                          >
                            {b.remaining} / {b.total_days + b.carried_over}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            مستخدم: {b.used_days}
                          </span>
                        </div>
                      </td>
                    ))}
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(emp)}
                        className="gap-1"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        تعديل
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Adjust Dialog */}
      <AdjustBalanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employee={selectedEmployee}
        year={year}
      />
    </div>
  );
}
