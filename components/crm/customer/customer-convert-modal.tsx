'use client';

/**
 * Modal that wires the "تحويل لعميل" admin action to the
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
 * (no extra UI per case — admin sees "تم التحويل" + the page refetches).
 */

import { useState, useEffect } from 'react';
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

interface Props {
  customer: DossierCustomer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PASSWORD_MIN_LENGTH = 6;

export function CustomerConvertModal({ customer, open, onOpenChange }: Props) {
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
              ? 'تم تحويل العميل بنجاح'
              : 'العميل محوّل مسبقًا — تم تحديث الصفحة',
          );
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(err.message || 'فشل تحويل العميل');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تحويل العميل المحتمل لعميل دائم</DialogTitle>
          <DialogDescription>
            ينشئ سجل عميل في نظام البورتال ويربطه بهذا الـ Lead. يتطلب أن
            يكون الـ Lead في مرحلة <span className="font-medium">stg_closed_won</span> ومُعتمدًا.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="convert-email">البريد الإلكتروني *</Label>
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
              يستخدمه العميل للدخول للبوابة (لو فعّلتها).
            </p>
          </div>

          {/* Primary contact name */}
          <div className="space-y-1.5">
            <Label htmlFor="convert-contact-name">اسم جهة الاتصال (اختياري)</Label>
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
                إنشاء حساب بورتال للعميل
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                لو مفعّل، هتحتاج تشارك بيانات الدخول (الإيميل + كلمة المرور)
                مع العميل خارج النظام (واتساب / إيميل). البريد الترحيبي
                التلقائي مش متاح في v1.
              </p>
            </div>
          </div>

          {/* Password (only when portal access is enabled) */}
          {createPortalAccess && (
            <div className="space-y-1.5">
              <Label htmlFor="convert-password">
                كلمة المرور * <span className="text-muted-foreground">(٦ أحرف على الأقل)</span>
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
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {mutation.isPending ? 'جاري التحويل...' : 'تحويل العميل'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
