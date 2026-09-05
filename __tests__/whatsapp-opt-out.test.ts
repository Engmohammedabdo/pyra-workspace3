import { describe, it, expect } from 'vitest';
import {
  detectStopIntent,
  normalizeReply,
  collectOptOutPhones,
  isDialableIdentifier,
} from '@/lib/whatsapp/opt-out';

describe('normalizeReply', () => {
  it('folds alef, alef maqsura, ta marbuta, diacritics and punctuation', () => {
    expect(normalizeReply('إيقاف')).toBe('ايقاف');
    expect(normalizeReply('  إيقاف!!  ')).toBe('ايقاف');
    expect(normalizeReply('اَلْإيقاف')).toBe('الايقاف');
    expect(normalizeReply('كفى')).toBe('كفي');
  });
  it('is empty for empty input', () => {
    expect(normalizeReply('')).toBe('');
    expect(normalizeReply(null)).toBe('');
  });
});

describe('detectStopIntent — genuine opt-outs', () => {
  it('catches the exact word our template asks for', () => {
    for (const t of ['إيقاف', 'ايقاف', 'إيقاف.', ' إيقاف ', 'ايقاف!!']) {
      expect(detectStopIntent(t)).toBe(true);
    }
  });

  it('catches short terse refusals', () => {
    // «خلاص» deliberately absent — see the regression block below.
    for (const t of ['توقف', 'الغاء', 'stop', 'STOP', 'Stop.']) {
      expect(detectStopIntent(t)).toBe(true);
    }
  });

  it('catches unambiguous phrases at any length', () => {
    expect(detectStopIntent('من فضلك لا تراسلوني مرة أخرى، شكراً لتفهمكم')).toBe(true);
    expect(detectStopIntent('شكرا لكم لكن لا أرغب في أي خدمة حالياً إطلاقاً')).toBe(true);
    expect(detectStopIntent('Please unsubscribe me from this list, thank you')).toBe(true);
    expect(detectStopIntent('kindly remove me from your marketing messages')).toBe(true);
    expect(detectStopIntent('احذفوا رقمي من قائمتكم من فضلكم وشكرا')).toBe(true);
  });
});

describe('detectStopIntent — the trap: buying signals that CONTAIN a stop word', () => {
  it('does NOT suppress a marketing enquiry that uses «إيقاف» as a normal word', () => {
    // The single most expensive false positive: our recipients are businesses
    // talking to a marketing agency, so "stop the campaign" is a BUYING signal.
    expect(
      detectStopIntent('نريد إيقاف حملتنا الإعلانية الحالية والبدء بحملة جديدة معكم'),
    ).toBe(false);
    expect(
      detectStopIntent('هل يمكنكم إيقاف النشر مؤقتاً ثم استئنافه الشهر القادم؟'),
    ).toBe(false);
  });

  it('does NOT suppress a long reply that merely mentions cancelling something else', () => {
    expect(
      detectStopIntent('كنا قد قررنا الغاء المعرض السابق ولكننا مهتمون بخدمة الريلز'),
    ).toBe(false);
  });

  it('does not match a stop token buried inside a longer word', () => {
    expect(detectStopIntent('stopped by your office today')).toBe(false);
    expect(detectStopIntent('cancellation policy?')).toBe(false);
  });

  it('lets ordinary interested replies through', () => {
    for (const t of ['نعم', 'ابعتوا التفاصيل', 'ريلز', 'كم السعر؟', 'yes please', 'مهتم']) {
      expect(detectStopIntent(t)).toBe(false);
    }
  });

  it('treats «غير مهتم» as an opt-out even though it is a soft no', () => {
    // Not interested is a decision, and re-messaging it is what earns reports.
    expect(detectStopIntent('غير مهتم')).toBe(true);
    expect(detectStopIntent('شكرا، غير مهتم في الوقت الحالي')).toBe(true);
  });
});

describe('collectOptOutPhones', () => {
  it('only considers INBOUND messages', () => {
    // Every outgoing template of ours ends with «لإيقاف الرسائل اكتبوا: إيقاف» —
    // scanning outbound would suppress every recipient we ever messaged.
    const outbound = [
      { phone: '971501234567', content: 'لإيقاف الرسائل اكتبوا: إيقاف', direction: 'outgoing' },
    ];
    expect(collectOptOutPhones(outbound)).toEqual([]);
  });

  it('returns each opting-out phone once', () => {
    const msgs = [
      { phone: '971501234567', content: 'إيقاف', direction: 'incoming' },
      { phone: '971501234567', content: 'stop', direction: 'incoming' },
      { phone: '971509998877', content: 'كم السعر؟', direction: 'incoming' },
      { phone: null, content: 'إيقاف', direction: 'incoming' },
    ];
    expect(collectOptOutPhones(msgs)).toEqual(['971501234567']);
  });

  it('is empty for an empty batch', () => {
    expect(collectOptOutPhones([])).toEqual([]);
  });
});

describe('regressions found by the 2026-09-05 adversarial review', () => {
  it('«خلاص» is NOT an opt-out — in Gulf/Egyptian use it means "OK / agreed"', () => {
    // The most expensive false positive found: these are BUYING replies.
    expect(detectStopIntent('خلاص ابعتلي العرض')).toBe(false);
    expect(detectStopIntent('خلاص ارسل لي العرض')).toBe(false);
    expect(detectStopIntent('خلاص تمام شكرا')).toBe(false);
    expect(detectStopIntent('خلاص')).toBe(false);
  });

  it('folds Arabic-Indic digits so the verdict cannot flip on the keyboard used', () => {
    // Digits used to be stripped, shortening the text under the short gate —
    // the same sentence was judged differently in ٠١٢ vs 012.
    expect(normalizeReply('١٢٠٠٠')).toBe('12000');
    const arabicDigits = 'وافقنا على ١٢٠٠٠ درهم شهريا';
    const latinDigits = 'وافقنا على 12000 درهم شهريا';
    expect(detectStopIntent(arabicDigits)).toBe(detectStopIntent(latinDigits));
    expect(detectStopIntent(arabicDigits)).toBe(false);
  });

  it('does not suppress a partial refusal that is really a scoping negotiation', () => {
    // «غير مهتم» is only terminal in a SHORT reply; in a long one it scopes.
    expect(detectStopIntent('غير مهتم بالريلز لكننا نحتاج لافتات ولوحات للمكتب')).toBe(false);
    expect(detectStopIntent('not interested in video but we do need a website')).toBe(false);
    // Short and standalone stays an opt-out.
    expect(detectStopIntent('غير مهتم')).toBe(true);
    expect(detectStopIntent('not interested')).toBe(true);
  });

  it('catches the common refusals the first draft missed entirely', () => {
    for (const t of ['لا شكرا', 'لأ شكرا', 'مش عايز', 'مش مهتم', 'مو مهتم',
                     'لست مهتم', 'no thanks', 'No thank you']) {
      expect(detectStopIntent(t)).toBe(true);
    }
  });

  it('catches explicit removal requests at any length', () => {
    expect(detectStopIntent('please remove my number from your list, thank you')).toBe(true);
    expect(detectStopIntent('الرجاء عدم الإرسال مرة أخرى وشكراً لتفهمكم')).toBe(true);
    expect(detectStopIntent('برجاء عدم الإزعاج مستقبلاً')).toBe(true);
    expect(detectStopIntent('ارجو حذف رقمي من القائمة')).toBe(true);
  });

  it('sees through the definite article ال', () => {
    expect(detectStopIntent('الإيقاف')).toBe(true);
    expect(detectStopIntent('من فضلكم الإيقاف')).toBe(true);
  });

  it('no longer treats English scheduling words as opt-outs', () => {
    // 'end' and 'cancel' were ambiguous tokens; both fire on ordinary replies.
    expect(detectStopIntent('end of the month works')).toBe(false);
    expect(detectStopIntent('cancel the tuesday slot please')).toBe(false);
  });
});

describe('isDialableIdentifier — the LID trap', () => {
  it('accepts real phone numbers in any format', () => {
    expect(isDialableIdentifier('0501234567')).toBe(true);
    expect(isDialableIdentifier('+971 50 123 4567')).toBe(true);
  });
  it('rejects a WhatsApp LID, which would key a row nothing can ever match', () => {
    expect(isDialableIdentifier('123456789012345678')).toBe(false);
    expect(isDialableIdentifier('')).toBe(false);
    expect(isDialableIdentifier(null)).toBe(false);
  });
  it('drops LID-addressed senders instead of writing a useless suppression', () => {
    const msgs = [
      { phone: '199558899223344556', content: 'إيقاف', direction: 'incoming' },
      { phone: '971501234567', content: 'إيقاف', direction: 'incoming' },
    ];
    expect(collectOptOutPhones(msgs)).toEqual(['971501234567']);
  });
});
