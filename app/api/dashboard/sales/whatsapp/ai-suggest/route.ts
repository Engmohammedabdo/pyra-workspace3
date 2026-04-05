import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// ── Types ────────────────────────────────────────────────────
interface IncomingMessage {
  direction: string;
  content: string | null;
  timestamp?: string;
}

interface SuggestRequestBody {
  conversation_id?: string;
  messages: IncomingMessage[];
  contact_name?: string;
}

// ── Pattern matching helpers ─────────────────────────────────

/** Case-insensitive check if content contains any keyword */
function matchesPattern(content: string, keywords: string[]): boolean {
  const lower = content.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/** Score how well a template matches the last message */
function scoreTemplate(templateContent: string, lastMsg: string): number {
  const templateWords = templateContent
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const msgWords = lastMsg
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  let score = 0;
  for (const tw of templateWords) {
    if (msgWords.some((mw) => mw.includes(tw) || tw.includes(mw))) {
      score++;
    }
  }
  return score;
}

// ── Rule-based suggestion engine ─────────────────────────────

function generateRuleSuggestions(
  messages: IncomingMessage[],
  contactName: string
): string[] {
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.direction !== 'incoming') return [];

  const content = lastMsg.content?.toLowerCase() || '';
  if (!content.trim()) return [];

  const name = contactName?.trim() || '';
  const suggestions: string[] = [];

  // Greeting patterns
  if (
    matchesPattern(content, [
      'هلا',
      'مرحبا',
      'مرحباً',
      'السلام',
      'هاي',
      'hi',
      'hello',
      'hey',
      'صباح',
      'مساء',
      'أهلا',
      'أهلاً',
    ])
  ) {
    suggestions.push(
      name
        ? `أهلاً ${name}! كيف أقدر أساعدك؟`
        : 'أهلاً! كيف أقدر أساعدك؟'
    );
    suggestions.push('مرحباً بك! أنا هنا لمساعدتك');
    suggestions.push('أهلاً وسهلاً! كيف يمكنني خدمتك اليوم؟');
  }

  // Price/cost inquiry
  if (
    matchesPattern(content, [
      'سعر',
      'كم',
      'تكلفة',
      'price',
      'cost',
      'how much',
      'عرض سعر',
      'أسعار',
      'باقات',
      'باكج',
      'package',
    ])
  ) {
    suggestions.push('بالتأكيد! خليني أجهز لك عرض سعر مفصّل');
    suggestions.push(
      'أقدر أرسل لك تفاصيل الأسعار. ممكن تحدد لي بالضبط إيش تحتاج؟'
    );
  }

  // Thank you
  if (
    matchesPattern(content, [
      'شكرا',
      'شكراً',
      'thanks',
      'thank you',
      'مشكور',
      'مشكورين',
      'يعطيك العافية',
      'تسلم',
    ])
  ) {
    suggestions.push('العفو! سعيدين بخدمتك');
    suggestions.push('لا شكر على واجب! نتطلع للتعاون معك');
  }

  // Meeting/appointment
  if (
    matchesPattern(content, [
      'موعد',
      'اجتماع',
      'meeting',
      'appointment',
      'نلتقي',
      'زيارة',
      'نشوفكم',
      'متى فاضي',
    ])
  ) {
    suggestions.push('أكيد! متى يناسبك؟ أنا متاح الأسبوع هذا');
    suggestions.push('بكل سرور. ممكن نحدد موعد يناسبك؟');
  }

  // Services inquiry
  if (
    matchesPattern(content, [
      'خدمات',
      'services',
      'إيش تقدمون',
      'شو عندكم',
      'ايش تسوون',
      'نبذة',
      'تعريف',
      'بروفايل',
    ])
  ) {
    suggestions.push(
      'نقدم خدمات تسويق رقمي متكاملة: إعلانات، سوشيال ميديا، تصوير، إنتاج'
    );
    suggestions.push('خليني أرسل لك بروفايل الشركة مع كل التفاصيل');
  }

  // Follow up / waiting
  if (
    matchesPattern(content, [
      'متى يكون جاهز',
      'waiting',
      'منتظر',
      'رد',
      'وين وصلتوا',
      'تحديث',
      'update',
      'أخبار',
      'خلصتوا',
    ])
  ) {
    suggestions.push('شكراً لصبرك! جاري التحقق وبرد عليك بأسرع وقت');
    suggestions.push('أعتذر عن التأخير. خليني أتابع الموضوع وأرد عليك');
  }

  // Complaint / problem
  if (
    matchesPattern(content, [
      'مشكلة',
      'شكوى',
      'problem',
      'issue',
      'خطأ',
      'ما يشتغل',
      'مو شغال',
      'خراب',
      'عطل',
      'زعلان',
      'مو راضي',
    ])
  ) {
    suggestions.push(
      'نعتذر عن أي إزعاج. ممكن توضح لي المشكلة بالتفصيل عشان نحلها؟'
    );
    suggestions.push('أفهم قلقك تماماً. خليني أتابع الموضوع شخصياً');
  }

  // Agreement / confirmation
  if (
    matchesPattern(content, [
      'تمام',
      'أوكي',
      'ok',
      'okay',
      'موافق',
      'ماشي',
      'حلو',
      'good',
      'great',
      'agreed',
    ])
  ) {
    suggestions.push('ممتاز! بنبدأ على طول');
    suggestions.push('تمام، أي شي ثاني تحتاجه لا تتردد');
  }

  // Availability / business hours
  if (
    matchesPattern(content, [
      'مواعيد',
      'دوام',
      'ساعات',
      'مفتوح',
      'شغالين',
      'open',
      'hours',
      'available',
    ])
  ) {
    suggestions.push(
      'دوامنا من الأحد إلى الخميس، من 9 صباحاً حتى 6 مساءً'
    );
    suggestions.push('نحن متاحين لخدمتك! تقدر تتواصل معنا أي وقت');
  }

  // Default fallback — if no pattern matched
  if (suggestions.length === 0) {
    suggestions.push(
      name
        ? `شكراً لتواصلك ${name}! كيف أقدر أساعدك؟`
        : 'شكراً لتواصلك! كيف أقدر أساعدك؟'
    );
    suggestions.push('تم استلام رسالتك. سأرد عليك بأسرع وقت');
  }

  return suggestions.slice(0, 3);
}

// ── Claude AI suggestion generator ──────────────────────────

async function generateClaudeSuggestions(
  messages: IncomingMessage[],
  contactName: string,
  apiKey: string,
): Promise<string[]> {
  // Take last 10 messages for context
  const recentMsgs = messages.slice(-10).map((m) => ({
    role: m.direction === 'incoming' ? 'user' : 'assistant',
    content: m.content || '[media]',
  }));

  const systemPrompt = `أنت مساعد مبيعات في شركة إنتاج إعلامي في الإمارات (Pyramedia X).
اقترح 3 ردود قصيرة بالعربية مناسبة للرد على آخر رسالة من العميل.
${contactName ? `اسم العميل: ${contactName}` : ''}
الردود يجب أن تكون:
- مختصرة (جملة أو جملتين كحد أقصى)
- مهنية ودودة
- مناسبة لسياق المحادثة
أجب بصيغة JSON فقط: ["رد 1", "رد 2", "رد 3"]`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: recentMsgs.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[AI Suggest] Claude API error:', res.status, errText);
    return [];
  }

  const data = await res.json();
  const textBlock = data?.content?.[0]?.text || '';

  // Parse JSON from response
  try {
    const parsed = JSON.parse(textBlock);
    if (Array.isArray(parsed)) return parsed.slice(0, 3);
  } catch {
    // Try to extract JSON from the text
    const jsonMatch = textBlock.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) return parsed.slice(0, 3);
      } catch {
        // Fallback: return empty
      }
    }
  }
  return [];
}

// ── POST handler ─────────────────────────────────────────────

/**
 * POST /api/dashboard/sales/whatsapp/ai-suggest
 * Generate reply suggestions based on the last incoming message.
 *
 * Body: { conversation_id?, messages[], contact_name? }
 * Returns: { data: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_whatsapp.view');
    if (isApiError(auth)) return auth;

    const body = (await request.json()) as SuggestRequestBody;
    const { messages, contact_name } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return apiValidationError('الرسائل مطلوبة');
    }

    // Check if last message is incoming — no suggestions for outgoing
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.direction !== 'incoming') {
      return apiSuccess<string[]>([]);
    }

    const supabase = createServiceRoleClient();

    // Check AI provider setting
    let aiProvider = 'rules';
    let aiApiKey = '';
    try {
      const { data: providerSetting } = await supabase
        .from('pyra_settings')
        .select('value')
        .eq('key', 'whatsapp_ai_provider')
        .maybeSingle();
      if (providerSetting?.value) aiProvider = String(providerSetting.value);

      if (aiProvider === 'claude') {
        const { data: keySetting } = await supabase
          .from('pyra_settings')
          .select('value')
          .eq('key', 'whatsapp_ai_api_key')
          .maybeSingle();
        if (keySetting?.value) aiApiKey = String(keySetting.value);
      }
    } catch {
      // Settings not found — use rules
    }

    // If Claude provider is selected and key is available, use it
    if (aiProvider === 'claude' && aiApiKey) {
      const claudeSuggestions = await generateClaudeSuggestions(
        messages,
        contact_name || '',
        aiApiKey,
      );
      if (claudeSuggestions.length > 0) {
        return apiSuccess(claudeSuggestions);
      }
      // Fallback to rules if Claude fails
    }

    // 1) Generate rule-based suggestions
    const ruleSuggestions = generateRuleSuggestions(
      messages,
      contact_name || ''
    );

    // 2) Try to find matching canned responses (templates)
    const templateSuggestions: string[] = [];
    try {
      const { data: templates } = await supabase
        .from('pyra_whatsapp_templates')
        .select('content')
        .limit(50);

      if (templates && templates.length > 0) {
        const msgContent = lastMsg.content || '';
        const scored = templates
          .map((t) => ({
            content: t.content,
            score: scoreTemplate(t.content, msgContent),
          }))
          .filter((t) => t.score >= 2)
          .sort((a, b) => b.score - a.score)
          .slice(0, 2);

        for (const t of scored) {
          templateSuggestions.push(t.content);
        }
      }
    } catch {
      // Templates fetch failed — continue with rule-based only
    }

    // 3) Merge: rule-based first, then template matches (deduplicated)
    const allSuggestions: string[] = [...ruleSuggestions];
    for (const ts of templateSuggestions) {
      if (!allSuggestions.includes(ts)) {
        allSuggestions.push(ts);
      }
    }

    return apiSuccess(allSuggestions.slice(0, 3));
  } catch (err) {
    console.error('POST /api/dashboard/sales/whatsapp/ai-suggest error:', err);
    return apiServerError();
  }
}
