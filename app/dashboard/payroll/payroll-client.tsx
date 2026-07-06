'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Receipt, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEmployeePayments } from '@/hooks/useEmployeePayments';
import { useUsersLite } from '@/hooks/useUsers';
import { PayrollRunsTable } from '@/components/payroll/PayrollRunsTable';
import { EmployeePaymentsTab } from '@/components/payroll/EmployeePaymentsTab';
import { CreatePayrollDialog } from '@/components/payroll/CreatePayrollDialog';
import { AddPaymentDialog } from '@/components/payroll/AddPaymentDialog';

export default function PayrollClient() {
  const t = useTranslations('hr.payroll.list');
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { data: payments = [], isLoading: paymentsLoading } = useEmployeePayments();
  // Lite endpoint (no users.view needed) — an HR manager with only
  // payroll.manage still gets a populated employee picker.
  const { data: allUsersRaw = [] } = useUsersLite();
  const allUsers = allUsersRaw
    .filter((u) => u.username && u.display_name && u.role !== 'client')
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
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4" />
          {t('createButton')}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            {t('tabs.runs')}
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            {t('tabs.payments')}
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
