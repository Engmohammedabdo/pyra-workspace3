'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { AgentWhatsAppSetting } from '@/hooks/useAgentWhatsAppSettings';

export interface AgentDropdownUser {
  username: string;
  display_name: string;
  role: string;
}

export interface InstanceSuggestion {
  instance_name: string;
  status: string | null;
}

export interface AddEditDialogProps {
  /** non-null = EDIT mode for this row; null + open=true = ADD mode */
  target: AgentWhatsAppSetting | null;
  open: boolean;
  /** filtered users eligible to be agents (sales_agent + admin) */
  agents: AgentDropdownUser[];
  /** suggestions for the sender_instance_name datalist (free-text input) */
  instances: InstanceSuggestion[];
  onClose: () => void;
  onSubmit: (input: {
    agent_username: string;
    sender_instance_name: string;
    recipient_phone: string;
    is_active: boolean;
    notes: string | null;
  }) => Promise<void> | void;
  /** mutation pending — disable submit + cancel; show the saving label
   *  (settings.agentWhatsapp.dialog.saving) */
  submitting: boolean;
}

export interface DeleteConfirmDialogProps {
  target: AgentWhatsAppSetting | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  deleting: boolean;
}

/**
 * Add / Edit dialog for agent WhatsApp routing config.
 *
 * Single component handles both modes — `target !== null` ⇒ EDIT mode:
 *   • Agent <Select> is disabled (identity is immutable per Q-R-1)
 *   • Form pre-populates from `target` via the useEffect below
 *
 * Validation runs client-side BEFORE calling onSubmit (toast errors).
 * Server-side validation provides the second-line defence with clean
 * Arabic 422 / 409 messages — those are surfaced to the user via the
 * parent's catch-block toast (mutateAPI's ApiError carries the body's
 * `error` field).
 */
export function AddEditDialog({
  target,
  open,
  agents,
  instances,
  onClose,
  onSubmit,
  submitting,
}: AddEditDialogProps) {
  const t = useTranslations('settings.agentWhatsapp.dialog');
  const tCommon = useTranslations('common');
  const isEdit = target !== null;

  // Form state. NOTE: isActive defaults `false` to match the DB column
  // default + Q-R-3 ("admin can prepare row without triggering"). Edit
  // mode overrides this with target.is_active in the useEffect below.
  const [agentUsername, setAgentUsername] = useState('');
  const [senderInstance, setSenderInstance] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setAgentUsername('');
    setSenderInstance('');
    setRecipientPhone('');
    setIsActive(false);
    setNotes('');
  };

  useEffect(() => {
    // Only re-sync when dialog transitions to open (avoids overwriting
    // mid-edit if `target` reference changes while the dialog is closed).
    if (!open) return;
    if (target) {
      setAgentUsername(target.agent_username);
      setSenderInstance(target.sender_instance_name);
      setRecipientPhone(target.recipient_phone);
      setIsActive(target.is_active);
      setNotes(target.notes ?? '');
    } else {
      resetForm();
    }
  }, [target, open]);

  const handleSubmit = async () => {
    // Client-side validation — fast feedback before round-tripping to API.
    // Server returns 422 with similar Arabic messages as a second line.
    if (!isEdit && !agentUsername) {
      toast.error(t('agentPlaceholder'));
      return;
    }
    if (!senderInstance.trim()) {
      toast.error(t('instanceNameRequired'));
      return;
    }
    if (!recipientPhone.trim()) {
      toast.error(t('recipientPhoneRequired'));
      return;
    }
    // Parent catches errors from the mutation — we don't try/catch here so
    // the error bubbles up; on success the parent closes the dialog.
    await onSubmit({
      agent_username: agentUsername,
      sender_instance_name: senderInstance.trim(),
      recipient_phone: recipientPhone.trim(),
      is_active: isActive,
      notes: notes.trim() ? notes.trim() : null,
    });
    resetForm();
  };

  const handleOpenChange = (next: boolean) => {
    // Triggered by ESC / backdrop / X button. Reset form + delegate to
    // parent so it can clear its addOpen / editTarget state too.
    if (!next) {
      resetForm();
      onClose();
    }
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('editTitle') : t('addTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Agent select — disabled in EDIT mode (identity immutable per Q-R-1) */}
          <div className="space-y-2">
            <Label htmlFor="agent-select">{t('agentLabel')}</Label>
            <Select
              value={agentUsername}
              onValueChange={setAgentUsername}
              disabled={isEdit}
            >
              <SelectTrigger id="agent-select" className="rounded-xl">
                <SelectValue placeholder={t('agentPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.username} value={agent.username}>
                    <span>{agent.display_name}</span>
                    <span className="ms-1 text-muted-foreground">
                      (@{agent.username} — {agent.role})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                {t('agentLockedHint')}
              </p>
            )}
          </div>

          {/* Instance free-text input + HTML5 datalist suggestions (Q-R-2) */}
          <div className="space-y-2">
            <Label htmlFor="sender-instance">Sender Instance</Label>
            <Input
              id="sender-instance"
              list="instance-suggestions"
              dir="ltr"
              value={senderInstance}
              onChange={(e) => setSenderInstance(e.target.value)}
              placeholder="pyraai"
              className="rounded-xl"
            />
            <datalist id="instance-suggestions">
              {instances.map((inst) => (
                <option key={inst.instance_name} value={inst.instance_name} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              {t('instanceHint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient-phone">{t('recipientLabel')}</Label>
            <Input
              id="recipient-phone"
              dir="ltr"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="971565799505"
              className="rounded-xl font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t('recipientHint')}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Label htmlFor="is-active" className="cursor-pointer">
                  {t('activeLabel')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('activeHint')}
                </p>
              </div>
              <Switch
                id="is-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('notesLabel')}</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleCancel}
            disabled={submitting}
            className="rounded-xl"
          >
            {tCommon('actions.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl"
          >
            {submitting
              ? t('saving')
              : isEdit
                ? t('saveEdits')
                : t('createSetting')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Destructive confirmation for deleting an agent WhatsApp routing row.
 * Reminds the admin that in-app fallback (notify()) keeps working —
 * only the WhatsApp send is removed.
 */
export function DeleteConfirmDialog({
  target,
  onClose,
  onConfirm,
  deleting,
}: DeleteConfirmDialogProps) {
  const t = useTranslations('settings.agentWhatsapp.dialog');
  const tCommon = useTranslations('common');
  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  const displayName = target?.agent_display_name ?? target?.agent_username ?? '';

  return (
    <AlertDialog open={target !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.rich('deleteDescription', {
              name: displayName,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{tCommon('actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('deleteConfirmButton')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
