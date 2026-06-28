'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Receipt, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEmployeePayments } from '@/hooks/useEmployeePayments';
import { useUsers } from '@/hooks/useUsers';
import { PayrollRunsTable } from '@/components/payroll/PayrollRunsTable';
import { EmployeePaymentsTab } from '@/components/payroll/EmployeePaymentsTab';
import { CreatePayrollDialog } from '@/components/payroll/CreatePayrollDialog';
import { AddPaymentDialog } from '@/components/payroll/AddPaymentDialog';

export default function PayrollClient() {
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { data: payments = [], isLoading: paymentsLoading } = useEmployeePayments();
  const { data: allUsersRaw = [] } = useUsers();
  const allUsers = allUsersRaw
    .filter((u) => u.username && u.display_name)
    .map((u) => ({ username: u.username as string, display_name: u.display_name as string }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">مسير الرواتب</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة وصرف رواتب الموظفين</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4" />
          إنشاء مسير رواتب
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            مسيرات الرواتب
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            المدفوعات
          </TabsTrigger>
        </TabsList>

        {/* Payroll Runs Tab */}
        <TabsContent value="runs" className="space-y-4">
          <PayrollRunsTable onCreateRun={() => setCreateOpen(true)} />
        </TabsContent>

        {/* Employee Payments Tab */}
        <TabsContent value="payments" className="space-y-4">
          <EmployeePaymentsTab
            payments={payments}
            loading={paymentsLoading}
            onAdd={() => setPaymentOpen(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreatePayrollDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AddPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} users={allUsers} />
    </motion.div>
  );
}
