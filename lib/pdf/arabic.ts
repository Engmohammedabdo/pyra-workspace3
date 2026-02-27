/**
 * Arabic text reshaping + RTL utilities for jsPDF.
 *
 * jsPDF doesn't process OpenType shaping features, so Arabic characters
 * render as isolated (disconnected) glyphs. This module converts base
 * Arabic characters to their positional presentation forms (Unicode
 * Arabic Presentation Forms-B, U+FE70–U+FEFF) and reverses the text
 * for LTR rendering.
 */

// ── Arabic character detection ──────────────────────────────────

const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function hasArabic(text: string): boolean {
  return ARABIC_RANGE.test(text);
}

// ── Reshaping table ─────────────────────────────────────────────
// Each entry: [isolated, final, initial, medial]
// Characters that only connect to the right (non-joining on the left)
// have initial = isolated and medial = final.

type GlyphForms = [number, number, number, number];

const ARABIC_GLYPHS: Record<number, GlyphForms> = {
  // Hamza
  0x0621: [0xFE80, 0xFE80, 0xFE80, 0xFE80], // ء
  // Alef with Madda
  0x0622: [0xFE81, 0xFE82, 0xFE81, 0xFE82], // آ
  // Alef with Hamza Above
  0x0623: [0xFE83, 0xFE84, 0xFE83, 0xFE84], // أ
  // Waw with Hamza
  0x0624: [0xFE85, 0xFE86, 0xFE85, 0xFE86], // ؤ
  // Alef with Hamza Below
  0x0625: [0xFE87, 0xFE88, 0xFE87, 0xFE88], // إ
  // Yeh with Hamza
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C], // ئ
  // Alef
  0x0627: [0xFE8D, 0xFE8E, 0xFE8D, 0xFE8E], // ا
  // Beh
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92], // ب
  // Teh Marbuta
  0x0629: [0xFE93, 0xFE94, 0xFE93, 0xFE94], // ة
  // Teh
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98], // ت
  // Theh
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C], // ث
  // Jeem
  0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0], // ج
  // Hah
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4], // ح
  // Khah
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8], // خ
  // Dal
  0x062F: [0xFEA9, 0xFEAA, 0xFEA9, 0xFEAA], // د
  // Thal
  0x0630: [0xFEAB, 0xFEAC, 0xFEAB, 0xFEAC], // ذ
  // Reh
  0x0631: [0xFEAD, 0xFEAE, 0xFEAD, 0xFEAE], // ر
  // Zain
  0x0632: [0xFEAF, 0xFEB0, 0xFEAF, 0xFEB0], // ز
  // Seen
  0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4], // س
  // Sheen
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8], // ش
  // Sad
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC], // ص
  // Dad
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0], // ض
  // Tah
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4], // ط
  // Zah
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8], // ظ
  // Ain
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC], // ع
  // Ghain
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0], // غ
  // Tatweel (kashida)
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640], // ـ
  // Feh
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4], // ف
  // Qaf
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8], // ق
  // Kaf
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC], // ك
  // Lam
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0], // ل
  // Meem
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4], // م
  // Noon
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8], // ن
  // Heh
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC], // ه
  // Waw
  0x0648: [0xFEED, 0xFEEE, 0xFEED, 0xFEEE], // و
  // Alef Maksura
  0x0649: [0xFEEF, 0xFEF0, 0xFEEF, 0xFEF0], // ى
  // Yeh
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4], // ي
  // Peh (Farsi)
  0x067E: [0xFB56, 0xFB57, 0xFB58, 0xFB59], // پ
  // Tcheh
  0x0686: [0xFB7A, 0xFB7B, 0xFB7C, 0xFB7D], // چ
  // Gaf
  0x06AF: [0xFB92, 0xFB93, 0xFB94, 0xFB95], // گ
};

// Characters that don't join to the left (only connect on right side)
const RIGHT_JOIN_ONLY = new Set([
  0x0621, // Hamza
  0x0622, // Alef with Madda
  0x0623, // Alef with Hamza Above
  0x0624, // Waw with Hamza
  0x0625, // Alef with Hamza Below
  0x0627, // Alef
  0x0629, // Teh Marbuta
  0x062F, // Dal
  0x0630, // Thal
  0x0631, // Reh
  0x0632, // Zain
  0x0648, // Waw
  0x0649, // Alef Maksura
]);

// Arabic diacritics (tashkeel) — these don't affect joining
const DIACRITICS = new Set([
  0x064B, 0x064C, 0x064D, 0x064E, 0x064F, 0x0650, 0x0651, 0x0652,
  0x0653, 0x0654, 0x0655, 0x0656, 0x0657, 0x0658, 0x0659, 0x065A,
  0x065B, 0x065C, 0x065D, 0x065E, 0x065F, 0x0670,
]);

// Lam-Alef ligatures
const LAM_ALEF_MAP: Record<number, [number, number]> = {
  // [alef char]: [isolated ligature, final ligature]
  0x0622: [0xFEF5, 0xFEF6], // لآ
  0x0623: [0xFEF7, 0xFEF8], // لأ
  0x0625: [0xFEF9, 0xFEFA], // لإ
  0x0627: [0xFEFB, 0xFEFC], // لا
};

function isArabicChar(code: number): boolean {
  return ARABIC_GLYPHS[code] !== undefined;
}

function isDiacritic(code: number): boolean {
  return DIACRITICS.has(code);
}

function canJoinLeft(code: number): boolean {
  return isArabicChar(code) && !RIGHT_JOIN_ONLY.has(code);
}

/**
 * Reshape Arabic text by converting base characters to their
 * positional presentation forms.
 */
export function reshapeArabic(text: string): string {
  const chars = Array.from(text);
  const codes = chars.map((c) => c.codePointAt(0)!);
  const result: number[] = [];

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];

    // Skip diacritics — pass through as-is
    if (isDiacritic(code)) {
      result.push(code);
      continue;
    }

    // Non-Arabic character — pass through
    if (!isArabicChar(code)) {
      result.push(code);
      continue;
    }

    // Find previous and next non-diacritic Arabic characters
    let prevCode: number | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (!isDiacritic(codes[j])) {
        prevCode = codes[j];
        break;
      }
    }

    let nextCode: number | null = null;
    for (let j = i + 1; j < codes.length; j++) {
      if (!isDiacritic(codes[j])) {
        nextCode = codes[j];
        break;
      }
    }

    const prevIsArabic = prevCode !== null && isArabicChar(prevCode);
    const nextIsArabic = nextCode !== null && isArabicChar(nextCode);
    const prevJoinsLeft = prevCode !== null && canJoinLeft(prevCode);

    // Check for Lam-Alef ligature
    if (code === 0x0644 && nextCode !== null && LAM_ALEF_MAP[nextCode]) {
      const ligature = LAM_ALEF_MAP[nextCode];
      const hasLeftConnection = prevIsArabic && prevJoinsLeft;
      result.push(hasLeftConnection ? ligature[1] : ligature[0]);
      // Skip the Alef (and any diacritics between Lam and Alef)
      i++;
      while (i + 1 < codes.length && isDiacritic(codes[i + 1])) {
        i++;
      }
      continue;
    }

    const forms = ARABIC_GLYPHS[code];
    // Determine position: 0=isolated, 1=final, 2=initial, 3=medial
    const rightConnected = prevIsArabic && prevJoinsLeft;
    const leftConnected = nextIsArabic && canJoinLeft(code);

    let formIndex: number;
    if (rightConnected && leftConnected) {
      formIndex = 3; // medial
    } else if (rightConnected) {
      formIndex = 1; // final
    } else if (leftConnected) {
      formIndex = 2; // initial
    } else {
      formIndex = 0; // isolated
    }

    result.push(forms[formIndex]);
  }

  return String.fromCodePoint(...result);
}

/**
 * Process text for rendering in jsPDF.
 * - If text contains Arabic: reshape and reverse for LTR rendering
 * - If text is pure Latin/numbers: return as-is
 */
export function processArabicText(text: string): string {
  if (!text || !hasArabic(text)) return text;

  // Split text into segments of Arabic and non-Arabic
  const segments: { text: string; isArabic: boolean }[] = [];
  let current = '';
  let currentIsArabic = false;

  for (const char of text) {
    const code = char.codePointAt(0)!;
    const charIsArabic = (code >= 0x0600 && code <= 0x06FF) || isDiacritic(code) ||
      (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);

    // Treat spaces as belonging to current segment
    if (char === ' ') {
      current += char;
      continue;
    }

    if (current.length === 0) {
      currentIsArabic = charIsArabic;
      current = char;
    } else if (charIsArabic === currentIsArabic) {
      current += char;
    } else {
      segments.push({ text: current, isArabic: currentIsArabic });
      current = char;
      currentIsArabic = charIsArabic;
    }
  }
  if (current) {
    segments.push({ text: current, isArabic: currentIsArabic });
  }

  // Process each segment
  const processed = segments.map((seg) => {
    if (seg.isArabic) {
      const reshaped = reshapeArabic(seg.text);
      // Reverse for LTR rendering (jsPDF renders left-to-right)
      return Array.from(reshaped).reverse().join('');
    }
    return seg.text;
  });

  // Reverse segment order for RTL flow
  return processed.reverse().join('');
}
