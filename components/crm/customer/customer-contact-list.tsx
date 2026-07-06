'use client';

/**
 * Primary contact card for the Active Customer Page Overview tab.
 *
 * v1: shows ONE primary contact (the lead's name + email + phone).
 * v1.1 will add a list of additional contact persons + an "+ Add" CTA.
 *
 * Affordances on the contact:
 *   - Email   → mailto: link
 *   - Phone   → tel: link
 *   - WhatsApp → wa.me/<digits> via shared whatsAppHref helper.
 *               No template (per Phase 9 Q-E3) — opens chat with the
 *               number, admin composes contextually. Templates are
 *               reserved for context-specific outreach (e.g., the
 *               deals-at-risk reminder in Phase 8).
 */

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Mail, Phone, MessageCircle } from 'lucide-react';
import { whatsAppHref } from '@/lib/utils/whatsapp';
import { cn } from '@/lib/utils/cn';
import type { DossierCustomer } from '@/hooks/useCustomerDossier';

interface Props {
  customer: DossierCustomer;
}

function getInitials(name: string, fallback: string): string {
  // Take first letter of first 2 words. Works for both Arabic and Latin.
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return (first + second).toUpperCase() || fallback;
}

export function CustomerContactList({ customer }: Props) {
  const t = useTranslations('crm.customers.contactList');
  const wa = whatsAppHref(customer.phone);

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3">{t('heading')}</h3>

      {/* Avatar + name */}
      <div className="flex items-center gap-3">
        <Avatar className="size-12 bg-orange-500/10 text-orange-700 dark:text-orange-300">
          <AvatarFallback className="bg-transparent text-sm font-medium">
            {getInitials(customer.name, t('initialsFallback'))}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{customer.name}</div>
          {customer.company && (
            <div className="text-xs text-muted-foreground truncate">{customer.company}</div>
          )}
        </div>
      </div>

      {/* Affordances */}
      <div className="mt-4 space-y-1">
        {customer.email && (
          <ContactRow
            href={`mailto:${customer.email}`}
            icon={<Mail className="size-4" />}
            tone="indigo"
            label={customer.email}
          />
        )}
        {customer.phone && (
          <ContactRow
            href={`tel:${customer.phone}`}
            icon={<Phone className="size-4" />}
            tone="orange"
            label={customer.phone}
            ltrLabel
          />
        )}
        {wa && (
          <ContactRow
            href={wa}
            icon={<MessageCircle className="size-4" />}
            tone="emerald"
            label={t('openWhatsApp')}
            external
          />
        )}
        {!customer.email && !customer.phone && (
          <div className="text-xs text-muted-foreground italic">
            {t('empty')}
          </div>
        )}
      </div>
    </Card>
  );
}

interface ContactRowProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  tone: 'orange' | 'indigo' | 'emerald';
  external?: boolean;
  /** True when label content is a Latin string (email/phone) that should
   *  render LTR even inside an RTL parent — prevents reversed digits. */
  ltrLabel?: boolean;
}

const TONE_CLASSES: Record<ContactRowProps['tone'], string> = {
  orange:  'text-orange-600 dark:text-orange-400 bg-orange-500/10',
  indigo:  'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
  emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
};

function ContactRow({ href, icon, label, tone, external, ltrLabel }: ContactRowProps) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={cn(
        'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors',
        'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-orange-500/40',
      )}
    >
      <span className={cn('size-7 rounded-md flex items-center justify-center shrink-0', TONE_CLASSES[tone])}>
        {icon}
      </span>
      <span className={cn('truncate flex-1', ltrLabel && 'text-start ltr:text-start rtl:text-start')} dir={ltrLabel ? 'ltr' : undefined}>
        {label}
      </span>
    </a>
  );
}
