import {
  AlertCircle,
  CheckCircle2,
  MessageCircle,
  Pencil,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { AgentWhatsAppSetting } from '@/hooks/useAgentWhatsAppSettings';

export interface SettingsListProps {
  settings: AgentWhatsAppSetting[] | undefined;
  isLoading: boolean;
  canManage: boolean;
  onEdit: (row: AgentWhatsAppSetting) => void;
  onDelete: (row: AgentWhatsAppSetting) => void;
  onToggleActive: (row: AgentWhatsAppSetting) => void;
  toggleDisabled: boolean;
}

/**
 * Card-style list for the agent WhatsApp routing rows.
 *
 * Pure presentational component — receives mutations + state via callback
 * props from the parent `<AgentWhatsAppSettingsSection>`. Visual language
 * mirrors the API Keys section pattern in `app/dashboard/settings/settings-
 * client.tsx` lines 826-889 (gradient icon cards, opacity-60 for inactive,
 * Switch + Pencil/Trash2 ghost icon buttons in the row's right gutter).
 */
export function SettingsList({
  settings,
  isLoading,
  canManage,
  onEdit,
  onDelete,
  onToggleActive,
  toggleDisabled,
}: SettingsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  if (!settings || settings.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="لا توجد إعدادات حتى الآن"
        description="ابدأ بربط أول موظف برقم WhatsApp المستلم — الـ Cron سيستخدم هذا الإعداد على الفور بمجرد تفعيله."
      />
    );
  }

  return (
    <div className="space-y-3">
      {settings.map((row) => {
        // sender_instance_status comes from the GET endpoint's join with
        // pyra_whatsapp_instances. Three states matter to the admin:
        //   'connected'  → green check (cron will succeed)
        //   null/undef   → red alert (instance row doesn't exist; cron skips)
        //   anything else (e.g. 'disconnected') → amber (instance exists but
        //                                                cron will skip until reconnected)
        const status = row.sender_instance_status;
        const isConnected = status === 'connected';
        const instanceMissing = status === null || status === undefined;

        return (
          <div
            key={row.id}
            className={`rounded-xl border border-border/60 bg-background/50 p-4 space-y-3 transition-opacity ${
              !row.is_active ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
                  <MessageCircle className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {row.agent_display_name || row.agent_username}
                    </span>
                    <Badge variant="outline" className="font-mono text-[11px]" dir="ltr">
                      @{row.agent_username}
                    </Badge>
                    {!row.is_active && <Badge variant="secondary">معطّل</Badge>}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={row.is_active}
                  onCheckedChange={() => onToggleActive(row)}
                  disabled={!canManage || toggleDisabled}
                  aria-label={row.is_active ? 'تعطيل' : 'تفعيل'}
                />
                {canManage && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEdit(row)}
                      aria-label="تعديل"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onDelete(row)}
                      aria-label="حذف"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="ps-9 space-y-1 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Instance:{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {row.sender_instance_name}
                  </code>
                </span>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> connected
                  </span>
                ) : instanceMissing ? (
                  <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                    <AlertCircle className="h-3 w-3" /> غير موجود
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3 w-3" /> {status}
                  </span>
                )}
              </div>
              {/*
               * Display the stored value as-is (digits-only, no leading +).
               * Reviewer caught the original "+{row.recipient_phone}" rendering
               * could feed a copy-paste-into-Edit corruption: copying the
               * displayed "+971..." and pasting into the Edit dialog would
               * save "+971..." → next render "++971...". Helper text in the
               * dialog ("بدون + أو مسافات") already conveys the format.
               */}
              <div>
                الرقم المستلم:{' '}
                <code
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                  dir="ltr"
                >
                  {row.recipient_phone}
                </code>
              </div>
              {row.notes && <p className="pt-1 italic">{row.notes}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
