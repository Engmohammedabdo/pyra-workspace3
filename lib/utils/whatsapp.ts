/**
 * WhatsApp deep-link helper.
 *
 * Builds a `https://wa.me/<digits>` URL with optional pre-filled text. The
 * `wa.me` scheme is the WhatsApp-recommended deep link for both web and
 * native clients — no auth, no API token, just a URL the OS resolves.
 *
 * Migration note: this util consolidates the inline `whatsAppHref` helpers
 * that previously lived in:
 *   components/crm/pipeline/pipeline-card.tsx
 *   components/crm/lead-detail/lead-header.tsx
 *   app/dashboard/crm/follow-ups/follow-ups-client.tsx
 * Those copies still work; future cleanup can route them through here for
 * a single source of truth. New CRM Phase 8 dashboard components import
 * directly from this file.
 *
 * @param phone  Raw phone number (any format — non-digits are stripped)
 * @param text   Optional pre-filled message body. URL-encoded automatically.
 * @returns      Full wa.me URL, or null when phone is missing / has fewer
 *               than 7 digits (shorter than a valid local subscriber number).
 */
export function whatsAppHref(
  phone: string | null | undefined,
  text?: string | null,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (text && text.trim().length > 0) {
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }
  return `https://wa.me/${digits}`;
}
