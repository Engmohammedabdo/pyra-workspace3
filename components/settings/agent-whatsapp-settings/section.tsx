'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Info, MessageCircle, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { fetchAPI } from '@/hooks/api-helpers';
import { usePermission } from '@/hooks/usePermission';
import {
  useAgentWhatsAppSettings,
  useCreateAgentWhatsAppSetting,
  useUpdateAgentWhatsAppSetting,
  useDeleteAgentWhatsAppSetting,
  type AgentWhatsAppSetting,
} from '@/hooks/useAgentWhatsAppSettings';
import { SettingsList } from './list';
import {
  AddEditDialog,
  DeleteConfirmDialog,
  type AgentDropdownUser,
  type InstanceSuggestion,
} from './dialog';

const containerMotion = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};
const itemMotion = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/**
 * Settings tab orchestrator — Phase 11 Refinement.
 *
 * Composes the list (presentational) + dialogs (Add/Edit + Delete confirm)
 * with the React Query hooks that back the agent WhatsApp routing API.
 *
 * Read the locked decisions in `CLAUDE.md` → "## CRM Phase 11 — Locked
 * Decisions" before changing UX semantics here (Q-R-1 .. Q-R-7).
 */
export default function AgentWhatsAppSettingsSection() {
  const canManage = usePermission('settings.manage');

  // Data + mutations from the hooks file (commit 851b70e)
  const { data: settings, isLoading } = useAgentWhatsAppSettings();
  const createMutation = useCreateAgentWhatsAppSetting();
  const updateMutation = useUpdateAgentWhatsAppSetting();
  const deleteMutation = useDeleteAgentWhatsAppSetting();

  // /api/users returns { username, display_name, role, ... } per
  // app/api/users/route.ts. We only declare the 3 fields we use; extras
  // are ignored by structural typing — no `as unknown as` cast needed.
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchAPI<AgentDropdownUser[]>('/api/users'),
    staleTime: 5 * 60_000,
  });
  const { data: instances } = useQuery({
    queryKey: ['whatsapp-instances'],
    queryFn: () =>
      fetchAPI<InstanceSuggestion[]>('/api/dashboard/sales/whatsapp/instances'),
    staleTime: 60_000,
  });

  // Filter to users who can plausibly own a follow-up: sales_agent + admin.
  // Sorted by Arabic locale for intuitive dropdown order.
  const agents = useMemo(
    () =>
      (users ?? [])
        .filter((u) => u.role === 'sales_agent' || u.role === 'admin')
        .sort((a, b) => a.display_name.localeCompare(b.display_name, 'ar')),
    [users],
  );

  // Dialog state — addOpen and editTarget are MUTUALLY EXCLUSIVE; the
  // openAdd / openEdit helpers below clear the other before setting their
  // own, preventing a "both true" stuck state under rapid double-clicks
  // (caught by Reviewer agent during orchestra review).
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AgentWhatsAppSetting | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentWhatsAppSetting | null>(null);

  const openAdd = () => {
    setEditTarget(null);
    setAddOpen(true);
  };
  const openEdit = (row: AgentWhatsAppSetting) => {
    setAddOpen(false);
    setEditTarget(row);
  };
  const closeDialog = () => {
    setAddOpen(false);
    setEditTarget(null);
  };

  const handleSubmit = async (input: {
    agent_username: string;
    sender_instance_name: string;
    recipient_phone: string;
    is_active: boolean;
    notes: string | null;
  }) => {
    try {
      if (editTarget) {
        await updateMutation.mutateAsync({
          id: editTarget.id,
          sender_instance_name: input.sender_instance_name,
          recipient_phone: input.recipient_phone,
          is_active: input.is_active,
          notes: input.notes,
        });
        toast.success('تم التحديث');
      } else {
        await createMutation.mutateAsync({
          agent_username: input.agent_username,
          sender_instance_name: input.sender_instance_name,
          recipient_phone: input.recipient_phone,
          is_active: input.is_active,
          notes: input.notes ?? undefined,
        });
        toast.success('تم الإنشاء');
      }
      closeDialog();
    } catch (err) {
      // mutateAPI's ApiError carries the server's Arabic message via
      // pickServerMessage(body.error) — the 409 conflict hint
      // ("استخدم تعديل بدلاً من إضافة") and 422 validation messages
      // both surface here directly without further extraction.
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const handleToggleActive = async (row: AgentWhatsAppSetting) => {
    try {
      await updateMutation.mutateAsync({ id: row.id, is_active: !row.is_active });
      toast.success(row.is_active ? 'تم التعطيل' : 'تم التفعيل');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل التحديث');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('تم الحذف');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل الحذف');
    }
  };

  return (
    <motion.div
      variants={containerMotion}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      {/* Guide banner — explains the cron-routing relationship */}
      <motion.div variants={itemMotion}>
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 px-4 py-3">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed space-y-1">
            <p className="font-medium">إلى أين يصل تنبيه المتابعة لكل موظف؟</p>
            <p>
              اربط كل عضو في الفريق بـ Evolution Instance + رقم WhatsApp المستلم.
              الـ Cron يقرأ من هنا ويرسل تذكير المتابعة على واتساب الموظف. Instance
              واحد ممكن يخدم عدة موظفين، كل واحد على رقمه الخاص.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Section card */}
      <motion.div variants={itemMotion}>
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <h3 className="font-bold text-sm flex-1">إعدادات WhatsApp للفريق</h3>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={openAdd}
                className="rounded-xl"
              >
                <Plus className="h-4 w-4 me-1" />
                إضافة إعداد
              </Button>
            )}
          </div>
          <div className="p-5">
            <SettingsList
              settings={settings}
              isLoading={isLoading}
              canManage={canManage}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              onToggleActive={handleToggleActive}
              toggleDisabled={updateMutation.isPending}
            />
          </div>
        </div>
      </motion.div>

      <AddEditDialog
        target={editTarget}
        open={addOpen || editTarget !== null}
        agents={agents}
        instances={instances ?? []}
        onClose={closeDialog}
        onSubmit={handleSubmit}
        submitting={createMutation.isPending || updateMutation.isPending}
      />
      <DeleteConfirmDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        deleting={deleteMutation.isPending}
      />
    </motion.div>
  );
}
