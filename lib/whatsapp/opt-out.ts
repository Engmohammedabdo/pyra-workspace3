// Stop-intent detection for inbound WhatsApp replies — pure, no I/O.
//
// WHY THIS EXISTS (2026-09-05):
//   Every campaign message ends with «لإيقاف الرسائل اكتبوا: إيقاف». Nothing
//   in the system acted on that reply: it landed in the shared inbox like any
//   other message, and the next day's run messaged the person again. Breaking
//   an opt-out promise is the single most reliable way to earn a spam report,
//   and reports — not volume — are what get a WhatsApp line banned.
//
// THE TRAP THIS FILE EXISTS TO AVOID:
//   «إيقاف» is an ordinary Arabic word, and our recipients are businesses
//   talking to a MARKETING agency. "نريد إيقاف حملتنا الحالية وبدء حملة جديدة"
//   is a BUYING signal, not an opt-out. Matching a bare substring would
//   suppress the hottest replies we receive.
//
//   So ambiguous single words only count when the reply is SHORT — someone
//   ending the conversation writes «إيقاف», not a paragraph containing it.
//   Unambiguous phrases («لا تراسلوني», "unsubscribe") count at any length.
//
// BIAS — corrected 2026-09-05 after review. The first draft said "when
// uncertain, suppress". That was backwards for this pipeline:
//   • Campaign contacts are ONE-SHOT — run-campaign.ts selects only
//     status='pending', and a person can only reply after being messaged, so
//     their own row is already 'sent'. A missed opt-out costs at most one
//     extra message in a FUTURE campaign.
//   • A wrong suppression is permanent and SILENT: nothing notifies anyone,
//     no screen lists pyra_whatsapp_suppressions, and only hand-written SQL
//     can undo it. The lead is simply never contacted again.
// So: when uncertain, DO NOT suppress.

/**
 * Replies at or under this length are treated as terminal — a person ending
 * the conversation is terse. Longer replies need an unambiguous phrase.
 */
export const SHORT_REPLY_CHARS = 30;

/**
 * Refusals that are only reliable in a SHORT reply. Inside a longer message
 * each of these is routinely a fragment of a negotiation rather than an exit:
 * «غير مهتم بالريلز لكن نحتاج لافتات», "not interested in video, but…".
 *
 * Deliberately NOT here: «خلاص», "end", "cancel". Measured on the live inbox,
 * «خلاص» reads as "OK / agreed" far more often than "stop" — «خلاص ابعتلي
 * العرض» is a BUYING reply, and suppressing it would silently kill the best
 * lead the campaign produced.
 */
const SHORT_ONLY_TOKENS = [
  'ايقاف',
  'اوقفوا',
  'اوقف',
  'توقف',
  'توقفوا',
  'الغاء',
  'كفي',
  'غير مهتم',
  'مش مهتم',
  'مو مهتم',
  'لست مهتم',
  'مش عايز',
  'ما ابغي',
  'لا اريد',
  'لا ارغب',
  'لا شكرا',
  'stop',
  'not interested',
  'no thanks',
  'no thank you',
];

/**
 * Unambiguous at any length — none of these can be a fragment of an enquiry.
 * Every one is an explicit "do not message me", not a "no to this offer".
 */
const EXPLICIT_PHRASES = [
  'لا تراسلوني',
  'لا تراسلني',
  'لا ترسلوا لي',
  'لا ترسل لي',
  'عدم الارسال',
  'عدم الازعاج',
  'الغاء الاشتراك',
  // Universal refusals — the «أي/any» is what separates «لا أرغب في أي خدمة»
  // (terminal) from «لا أرغب في الريلز» (a scoping answer worth replying to).
  'لا ارغب في اي',
  'لا اريد اي',
  'لست مهتم باي',
  'لا نحتاج اي',
  'not interested in any',
  'dont need any',
  'ازالة رقمي',
  'احذفوا رقمي',
  'احذف رقمي',
  'حذف رقمي',
  'امسحوا رقمي',
  'امسح رقمي',
  'شيلوا رقمي',
  'unsubscribe',
  'remove me',
  'remove my number',
  'delete my number',
  'do not contact',
  'dont contact',
  'stop messaging',
  'stop sending',
  'take me off',
];

/**
 * Fold the spelling variation Arabic replies actually arrive in.
 *
 * Arabic-Indic digits are folded to ASCII rather than stripped: the strip
 * shortened «خلاص وافقنا على ١٢٠٠٠ درهم» below the short-reply gate while the
 * identical sentence in latin digits stayed above it, so the verdict flipped
 * on which numeral set the person's keyboard produced.
 */
export function normalizeReply(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    // Arabic-Indic (U+0660-0669) and Extended Arabic-Indic (U+06F0-06F9)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[ً-ْٰـ]/g, '') // harakat + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-يa-z0-9]+/g, ' ')
    .trim();
}

/** The token stands alone, optionally carrying the definite article ال. */
function standsAlone(haystack: string, token: string): boolean {
  for (const form of [token, `ال${token}`]) {
    if (
      haystack === form ||
      haystack.startsWith(`${form} `) ||
      haystack.endsWith(` ${form}`) ||
      haystack.includes(` ${form} `)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True when this inbound reply asks us to stop messaging.
 *
 * Only ever called on INBOUND text — an outgoing template that contains the
 * word «إيقاف» (ours all do) must never suppress its own recipient.
 */
export function detectStopIntent(text: string | null | undefined): boolean {
  const t = normalizeReply(text);
  if (!t) return false;

  for (const phrase of EXPLICIT_PHRASES) {
    if (t.includes(normalizeReply(phrase))) return true;
  }

  if (t.length <= SHORT_REPLY_CHARS) {
    for (const token of SHORT_ONLY_TOKENS) {
      if (standsAlone(t, normalizeReply(token))) return true;
    }
  }

  return false;
}

export interface InboundReplyLike {
  /** Raw phone as stored on the message/conversation. */
  phone: string | null | undefined;
  content: string | null | undefined;
  direction: string | null | undefined;
}

/**
 * The phones among these inbound messages that asked us to stop.
 * Outgoing messages are ignored — our own templates contain the stop word.
 */
export function collectOptOutPhones(messages: InboundReplyLike[]): string[] {
  const out = new Set<string>();
  for (const m of messages) {
    if (m.direction !== 'incoming') continue;
    if (!isDialableIdentifier(m.phone)) continue;
    if (detectStopIntent(m.content)) out.add(m.phone as string);
  }
  return [...out];
}

/**
 * A WhatsApp LID (the privacy identifier used instead of a phone on some
 * inbound messages) is not a dialable number. Keying a suppression row on one
 * writes a row that can never match a campaign contact — it silently looks
 * like the opt-out was honoured while the person stays contactable.
 *
 * Real numbers here are 9-15 digits. LIDs are far longer, so length is a
 * sufficient and cheap discriminator; when in doubt we DROP rather than write
 * a row nobody owns, and the caller reports the drop.
 */
export function isDialableIdentifier(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}
