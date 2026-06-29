export type ExpiryTier = 'expired' | 'expiring_7' | 'expiring_30' | 'ok' | 'none';

/** todayKey + expiryDate are 'YYYY-MM-DD' (Dubai day). Pure string-date math. */
export function classifyExpiry(expiryDate: string | null, todayKey: string): ExpiryTier {
  if (!expiryDate) return 'none';
  const exp = Date.parse(expiryDate + 'T00:00:00Z');
  const today = Date.parse(todayKey + 'T00:00:00Z');
  if (Number.isNaN(exp) || Number.isNaN(today)) return 'none';
  const days = Math.round((exp - today) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= 7) return 'expiring_7';
  if (days <= 30) return 'expiring_30';
  return 'ok';
}

export const EXPIRY_BADGE: Record<ExpiryTier, { labelAr: string; className: string }> = {
  expired:     { labelAr: 'منتهية',        className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  expiring_7:  { labelAr: 'تنتهي خلال أيام', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  expiring_30: { labelAr: 'تنتهي قريباً',    className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  ok:          { labelAr: 'سارية',          className: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  none:        { labelAr: 'دائمة',          className: 'bg-gray-500/10 text-gray-500 dark:text-gray-400' },
};
