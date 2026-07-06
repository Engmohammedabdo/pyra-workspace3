'use client';

/**
 * Modal that wires the "تحويل لعميل" admin action to the // i18n-exempt: doc comment
 * /api/crm/leads/[id]/convert-to-customer endpoint (Step A).
 *
 * Triggered from <CustomerHeader>'s convert button (Step C placeholder
 * is replaced in Step E with this real modal).
 *
 * Form fields (Phase 9 Q-A1: PRD §03 deviation — workspace has no portal-
 * welcome-email infrastructure, so admin sets the password in-form and
 * shares credentials with the client out-of-band):
 *
 *   email                  required, defaults to lead.email
 *   primary_contact_name   optional, defaults to lead.name
 *   create_portal_access   boolean toggle
 *   password               required when create_portal_access=true (≥ 6 chars)
 *
 * The endpoint enforces lead.stage_id = 'stg_closed_won' AND
 * lead.is_converted = true (returns 422 otherwise). Idempotent: if
 * lead.client_id already exists, returns the existing client with
 * `created: false`. Both behaviours are surfaced as success toasts here
 * (no extra UI per case — admin sees "تم التحويل" + the page refetches). // i18n-exempt: doc comment
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useConvertToCustomer } from '@/hooks/useCustomerDossier';
import type { DossierCustomer } from '@/hooks/useCustomerDossier';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants/auth';

interface Props {
  customer: DossierCustomer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Phase 14.3 P1 fix #3 — replaced local shadow constant (=6) with
// the canonical workspace-wide constant. Reviewer caught this site
// in the post-implementation sweep: it was outside the audit's
// listed 7 surfaces but represented the same inconsistency the audit
// flagged. The CRM convert-to-customer flow was accepting 6-char
// passwords while every other portal-account-creation path now
// requires 8.

export function CustomerConvertModal({ customer, open, onOpenChange }: Props) {
  const t = useTranslations('crm.customers.convertModal');
  const tCommon = useTranslations('common.actions');
  const mutation = useConvertToCustomer(customer.id);

  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [createPortalAccess, setCreatePortalAccess] = useState(true);
  const [password, setPassword] = useState('');

  // Reset form when modal opens (sourced from lead defaults).
  useEffect(() => {
    if (open) {
      setEmail(customer.email ?? '');
      setContactName(''); // placeholder shows lead.name; empty = use default
      setCreatePortalAccess(true);
      setPassword('');
    }
  }, [open, customer.email]);

  const canSubmit =
    email.trim().length > 0 &&
    !mutation.isPending &&
    (!createPortalAccess || password.length >= PASSWORD_MIN_LENGTH);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    mutation.mutate(
      {
        email: email.trim(),
        password: createPortalAccess ? password : undefined,
        create_portal_access: createPortalAccess,
        primary_contact_name: contactName.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          toast.success(
            data.created
              ? t('convertSuccess')
              : t('alreadyConverted'),
          );
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(err.message || t('convertError'));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { stage: 'stg_closed_won' })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="convert-email">{t('emailLabel')}</Label>
            <Input
              id="convert-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              dir="ltr"
              className="text-start"
              placeholder="client@example.com"
            />
            <p className="text-xs text-muted-foreground">
              {t('emailHint')}
            </p>
          </div>

          {/* Primary contact name */}
          <div className="space-y-1.5">
            <Label htmlFor="convert-contact-name">{t('contactNameLabel')}</Label>
            <Input
              id="convert-contact-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder={customer.name}
            />
          </div>

          {/* Portal access toggle */}
          <div className="flex items-start gap-3 pt-2 border-t border-border">
            <Switch
              id="convert-portal"
              checked={createPortalAccess}
              onCheckedChange={setCreatePortalAccess}
            />
            <div className="flex-1 -mt-0.5">
              <Label htmlFor="convert-portal" className="cursor-pointer">
                {t('createPortalLabel')}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t('createPortalHint')}
              </p>
            </div>
          </div>

          {/* Password (only when portal access is enabled) */}
          {createPortalAccess && (
            <div className="space-y-1.5">
              <Label htmlFor="convert-password">
                {t('passwordLabel')} <span className="text-muted-foreground">{t('passwordHint', { min: PASSWORD_MIN_LENGTH })}</span>
              </Label>
              <Input
                id="convert-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={createPortalAccess}
                minLength={PASSWORD_MIN_LENGTH}
                dir="ltr"
                className="text-start"
                autoComplete="new-password"
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {mutation.isPending ? t('submitting') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
