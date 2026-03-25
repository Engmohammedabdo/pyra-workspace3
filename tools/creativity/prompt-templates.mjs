#!/usr/bin/env node
// Creative Prompt Templates for Pyramedia (Dubai Marketing Agency)
// ESM module — node prompt-templates.mjs list | use <name> | random

export const templates = {
  socialMedia: {
    name: 'Social Media Post Generator',
    description: 'Generate creative social media posts for UAE audience',
    variations: ['hook-first', 'story-based', 'question-led', 'controversial', 'educational'],
    template: (topic, platform = 'instagram', tone = 'engaging') => `
أنت كاتب محتوى سوشال ميديا محترف في دبي. اكتب بوست ${platform} عن "${topic}".

🎯 المنصة: ${platform}
🎨 النبرة: ${tone}
🌍 الجمهور: سكان الإمارات (عرب + expats)

اكتب 5 نسخ مختلفة — كل وحدة بأسلوب مختلف:

1. **Hook-First (خطاف أول):**
   - ابدأ بجملة صادمة أو رقم مفاجئ
   - مثال: "90% من البزنس في دبي يفشلون في أول سنة..."

2. **Story-Based (قصة):**
   - ابدأ بقصة قصيرة (3 أسطر) عن عميل أو تجربة
   - خلّي القارئ يحس إنه هو البطل

3. **Question-Led (سؤال):**
   - ابدأ بسؤال يخلي الجمهور يوقف ويفكر
   - سؤال ما عنده جواب واضح

4. **Controversial (رأي جريء):**
   - قدم رأي مخالف للسائد في السوق
   - "الكل يقول X... بس الحقيقة Y"

5. **Educational (تعليمي):**
   - "3 أشياء ما حد يقولك إياهم عن..."
   - قيمة حقيقية + CTA واضح

لكل نسخة:
- العنوان (hook)
- النص (max 150 كلمة)
- الهاشتاقات (5-8، mix عربي + إنجليزي)
- CTA مناسب للمنصة
- إيموجي بشكل طبيعي (مش كثير)

ملاحظات:
- ${platform === 'linkedin' ? 'نبرة مهنية، بدون إيموجي كثير، فقرات قصيرة' : ''}
- ${platform === 'tiktok' ? 'أسلوب شبابي، trending sounds reference، hook أول 3 ثواني' : ''}
- ${platform === 'instagram' ? 'visual-first thinking، carousel ideas، story polls' : ''}
- ${platform === 'twitter' ? 'قصير ومباشر، thread potential، retweet-worthy' : ''}
- راعي ثقافة الإمارات والخليج
`
  },

  brainstorm: {
    name: 'Structured Brainstorm (SCAMPER)',
    description: 'SCAMPER-based brainstorming for any problem or idea',
    template: (problem) => `
أنت مستشار إبداعي. استخدم SCAMPER لتوليد أفكار حول: "${problem}"

طبّق كل خطوة من SCAMPER وأعطني 2-3 أفكار لكل وحدة:

🔄 **Substitute (بدّل):**
- إيش العناصر اللي نقدر نبدلها؟ مواد؟ أشخاص؟ قنوات؟ تقنية؟

🔗 **Combine (ادمج):**
- إيش نقدر ندمج مع بعض؟ خدمات؟ جماهير؟ أفكار من صناعات ثانية؟

🔧 **Adapt (عدّل):**
- مين سوّاها قبل بطريقة مختلفة؟ إيش نقدر ننقل من سوق ثاني؟

📐 **Modify (كبّر/صغّر/غيّر):**
- إيش لو كبّرناها 10x؟ إيش لو صغّرناها للأساسيات بس؟

♻️ **Put to other use (استخدام ثاني):**
- مين ثاني ممكن يستفيد؟ إيش لو استخدمناها بسياق مختلف تماماً؟

✂️ **Eliminate (شيل):**
- إيش نقدر نشيل وتبقى الفكرة تشتغل؟ إيش الزايد؟

🔃 **Reverse (اعكس):**
- إيش لو عكسنا الترتيب؟ العميل يبدأ من النهاية؟ نبيع بالمقلوب؟

بعد ما تخلص:
⭐ اختار أقوى 3 أفكار من الكل
🚀 اقترح خطة تنفيذ سريعة لكل وحدة
💰 قدّر الميزانية التقريبية (AED)
`
  },

  adCopy: {
    name: 'Ad Copy Generator',
    description: 'PAS/AIDA/BAB frameworks for ad copy — UAE market',
    template: (product, audience, framework = 'all') => `
أنت copywriter محترف متخصص في السوق الإماراتي. اكتب إعلان لـ:

📦 المنتج/الخدمة: ${product}
🎯 الجمهور: ${audience}
📍 السوق: الإمارات (دبي + أبوظبي بشكل رئيسي)

${framework === 'all' || framework === 'PAS' ? `
### 🔥 PAS (Problem → Agitate → Solution):
**Problem:** إيش المشكلة اللي يعاني منها ${audience}؟ (كن محدد — مش عام)
**Agitate:** كبّر المشكلة — إيش بيصير لو ما انحلت؟ إيش الألم؟
**Solution:** قدّم ${product} كالحل — بس بطريقة طبيعية مش بيعية
` : ''}

${framework === 'all' || framework === 'AIDA' ? `
### 💡 AIDA (Attention → Interest → Desire → Action):
**Attention:** جملة تلفت النظر — رقم، سؤال، أو تصريح جريء
**Interest:** ليش هذا يهمك؟ إيش الفايدة الحقيقية؟
**Desire:** خلّي القارئ يتخيل حياته بعد ما يستخدم ${product}
**Action:** CTA واضح ومحدد (WhatsApp، حجز، تجربة مجانية)
` : ''}

${framework === 'all' || framework === 'BAB' ? `
### 🌉 BAB (Before → After → Bridge):
**Before:** حياة ${audience} الحين — الإحباطات، التحديات
**After:** حياتهم بعد ${product} — النتائج، الراحة، النجاح
**Bridge:** كيف ${product} بياخذهم من Before لـ After
` : ''}

لكل framework أعطني:
- **Headline** (عربي + إنجليزي)
- **Body copy** (50-100 كلمة)
- **CTA button text**
- **Ad format suggestion** (carousel, video, single image, story)
- **Targeting notes** (age, interest, behavior — للميديا باير)

ملاحظات للسوق الإماراتي:
- راعي التنوع (مواطنين + مقيمين عرب + expats)
- الأسعار بالدرهم AED
- لهجة خليجية أو فصحى بسيطة (حسب الجمهور)
- موسمية: رمضان، عيد الاتحاد، DSF، الصيف (indoor season)
`
  },

  videoScript: {
    name: 'Video Script Creator',
    description: 'Hook→Problem→Solution→CTA structure for video content',
    template: (topic, duration = '60', style = 'educational') => `
أنت scriptwriter لفيديوهات سوشال ميديا في دبي. اكتب سكربت فيديو:

🎬 الموضوع: ${topic}
⏱️ المدة: ${duration} ثانية
🎨 الأسلوب: ${style}
📍 السوق: UAE

## هيكل السكربت:

### 🪝 Hook (أول 3 ثواني) — الأهم!
اكتب 3 خيارات hook مختلفة:
1. سؤال صادم
2. إحصائية مفاجئة  
3. تصريح مثير للجدل

### 😰 Problem (ثانية 3-15):
- وصّف المشكلة بشكل يحسسهم "هذا أنا!"
- استخدم لغة يومية — مش أكاديمية
- B-roll suggestions: إيش نصوّر هنا؟

### 💡 Solution (ثانية 15-${Math.round(duration * 0.75)}):
- قدّم الحل بخطوات واضحة
- كل خطوة = 1 جملة + visual suggestion
- ${style === 'educational' ? 'أرقام وحقائق' : style === 'storytelling' ? 'قصة حقيقية أو مثال' : 'عرض مباشر للمنتج'}

### 📢 CTA (آخر 5 ثواني):
- CTA واضح ومحدد
- عرض أو سبب للتصرف الآن
- معلومات التواصل

## ملاحظات الإنتاج:
- 🎵 Music mood suggestion
- 📝 Text overlays (إيش نكتب على الشاشة)
- 🎨 Color palette suggestion
- 📱 Format: ${duration <= 60 ? 'Reels/TikTok (9:16)' : duration <= 180 ? 'YouTube Shorts أو Feed (1:1 or 9:16)' : 'YouTube (16:9)'}
- 🗣️ Voiceover style: ${style === 'educational' ? 'واثق وهادي' : style === 'hype' ? 'حماسي وسريع' : 'طبيعي وقريب'}

## النص الكامل (جاهز للتسجيل):
اكتب السكربت كامل word-for-word — جاهز يتقرأ مباشرة.
بين القوسين [directions] حط تعليمات للمصوّر/المحرر.
`
  },

  emailSequence: {
    name: 'Email Sequence Builder',
    description: 'Welcome/nurture/conversion email sequences',
    template: (business, goal = 'conversion') => `
أنت email marketing specialist. ابني email sequence لـ:

🏢 البزنس: ${business}
🎯 الهدف: ${goal}
📍 السوق: UAE

## Email Sequence (5 emails):

### 📧 Email 1: Welcome (يوم 0)
- Subject line (3 خيارات — A/B/C test)
- Preview text
- الهدف: بناء ثقة + توقعات
- Template: ترحيب + قصة البراند بـ 3 أسطر + هدية (guide, discount, etc.)

### 📧 Email 2: Value (يوم 2)
- Subject line (3 خيارات)
- الهدف: إثبات خبرة
- Template: "3 أشياء تعلمناها من شغلنا مع +100 عميل في دبي"
- لا بيع — فقط قيمة

### 📧 Email 3: Social Proof (يوم 5)
- Subject line (3 خيارات)
- الهدف: بناء FOMO + ثقة
- Template: case study أو testimonial من عميل إماراتي
- أرقام حقيقية (ROI, نتائج)

### 📧 Email 4: Objection Handler (يوم 7)
- Subject line (3 خيارات)
- الهدف: إزالة العوائق
- Template: "أكثر 3 أسئلة نسمعها..." — FAQ style
- كل جواب ينتهي بـ micro-CTA

### 📧 Email 5: Conversion (يوم 10)
- Subject line (3 خيارات — urgency)
- الهدف: ${goal}
- Template: عرض محدود + deadline + CTA واضح
- P.S. line مع social proof إضافي

## لكل إيميل حدد:
- 📏 الطول المثالي (كلمات)
- 🎨 عناصر التصميم (صور، أزرار، ألوان)
- 📊 KPIs المتوقعة (open rate, click rate)
- ⏰ أفضل وقت للإرسال (UAE timezone)
- 📱 ملاحظات الموبايل (أغلب الناس بتفتح من الجوال)
`
  },

  storyBrand: {
    name: 'StoryBrand Framework (SB7)',
    description: "Donald Miller's StoryBrand 7-part framework for brand messaging",
    template: (brand) => `
طبّق StoryBrand Framework (Donald Miller) على: "${brand}"

## الـ 7 عناصر:

### 1. 🦸 البطل (Character) — العميل مش البراند!
- مين العميل المثالي؟
- إيش يبي؟ (رغبة واحدة واضحة)
- كيف يوصف نفسه؟

### 2. 😰 المشكلة (Problem) — على 3 مستويات:
- **External:** المشكلة الظاهرية (إيش يحاول يحل؟)
- **Internal:** المشكلة الداخلية (إيش يحس؟ إحباط، خوف، حيرة)
- **Philosophical:** ليش هذا غلط؟ (ما لازم يكون الوضع جذي)

### 3. 🧙 المرشد (Guide) — هذا أنت (${brand})
- **Empathy:** "نفهم إيش تمر فيه..." (جملة واحدة)
- **Authority:** إيش يثبت خبرتك؟ (أرقام، شهادات، سنوات)

### 4. 🗺️ الخطة (Plan) — 3 خطوات بسيطة:
- خطوة 1: ___
- خطوة 2: ___
- خطوة 3: ___
(لازم تكون بسيطة — الناس ما تبي تعقيد)

### 5. 📢 الدعوة (Call to Action):
- **Direct CTA:** الزر الرئيسي (احجز، اشتري، تواصل)
- **Transitional CTA:** للي مش جاهز (دليل مجاني، newsletter)

### 6. 💀 الفشل (Failure) — إيش بيصير لو ما تصرّف؟
- إيش بيخسر؟
- كيف بتسوء الأمور؟
- (مش تخويف — واقعية)

### 7. 🏆 النجاح (Success) — إيش بيتغير؟
- كيف بتكون حياته بعد ما يشتغل معكم؟
- إيش بيحقق؟
- كيف بيحس عن نفسه؟

## المخرجات:
بعد ما تخلص الـ 7 عناصر:
1. **One-liner:** جملة واحدة تلخص البراند (Problem + Solution + Result)
2. **Elevator pitch:** 30 ثانية
3. **Website wireframe:** Hero section copy based on SB7
4. **Email header:** Welcome email أول سطرين
`
  },

  reframe: {
    name: 'Problem Reframing (5 Angles)',
    description: 'Look at any problem from 5 completely different angles',
    template: (problem) => `
أنت مستشار استراتيجي. أعد صياغة هذه المشكلة من 5 زوايا مختلفة تماماً:

🎯 المشكلة الأصلية: "${problem}"

### 🔍 الزاوية 1: العميل
"إيش لو المشكلة مش فينا — بل في كيف العميل يشوفنا؟"
- أعد صياغة المشكلة من منظور العميل
- إيش العميل فعلاً يبي (مش إيش نحن نفتكر يبي)
- حل مقترح من هالزاوية

### 🔄 الزاوية 2: المقلوب
"إيش لو عكسنا المشكلة تماماً؟"
- بدل "كيف نزيد المبيعات" → "كيف نخلي الناس ما تقدر ما تشتري"
- بدل "كيف نوقف الخسارة" → "إيش لو الخسارة هي فرصة"
- حل مقترح من هالزاوية

### 🌍 الزاوية 3: صناعة ثانية
"كيف حلوا هالمشكلة في مجال مختلف تماماً؟"
- اختار 3 صناعات مختلفة (مطاعم، تقنية، رياضة، صحة...)
- كيف كل صناعة تعاملت مع مشكلة مشابهة
- حل مقترح مستوحى

### ⏰ الزاوية 4: الزمن
"إيش لو شفناها بعيون المستقبل أو الماضي؟"
- كيف كانوا يحلوها قبل 20 سنة (بساطة)
- كيف بتنحل بعد 5 سنوات (تقنية)
- إيش نقدر ناخذ من كل عصر

### 🎭 الزاوية 5: القيود
"إيش لو شلنا أهم قيد... أو ضعّفناه؟"
- لو عندك ميزانية لا محدودة — إيش تسوي؟
- لو عندك بس 100 درهم — إيش تسوي؟
- لو عندك يوم واحد بس — إيش تسوي؟
- لو عندك سنة — إيش تسوي؟

## الخلاصة:
- ⭐ أقوى زاوية وليش
- 🔀 دمج بين زاويتين لحل هجين
- 🚀 أول خطوة عملية (تقدر تبدأها اليوم)
`
  }
};

// ─── CLI Interface ───────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      parsed[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return parsed;
}

function listTemplates() {
  console.log('\n🎨 Prompt Templates Library — Pyramedia\n');
  console.log('━'.repeat(50));
  for (const [key, t] of Object.entries(templates)) {
    console.log(`\n  📝 ${key}`);
    console.log(`     ${t.name}`);
    console.log(`     ${t.description}`);
    if (t.variations) {
      console.log(`     Variations: ${t.variations.join(', ')}`);
    }
  }
  console.log('\n' + '━'.repeat(50));
  console.log('\nUsage:');
  console.log('  node prompt-templates.mjs list');
  console.log('  node prompt-templates.mjs use socialMedia --topic "Dubai restaurants" --platform instagram --tone fun');
  console.log('  node prompt-templates.mjs use brainstorm --problem "How to increase footfall"');
  console.log('  node prompt-templates.mjs use adCopy --product "Spa service" --audience "expat women 25-40" --framework PAS');
  console.log('  node prompt-templates.mjs use videoScript --topic "Dubai real estate" --duration 60 --style educational');
  console.log('  node prompt-templates.mjs use emailSequence --business "Fitness studio" --goal conversion');
  console.log('  node prompt-templates.mjs use storyBrand --brand "Pyramedia"');
  console.log('  node prompt-templates.mjs use reframe --problem "Low engagement on social media"');
  console.log('  node prompt-templates.mjs random\n');
}

function useTemplate(name, opts) {
  const t = templates[name];
  if (!t) {
    console.error(`❌ Template "${name}" not found. Use "list" to see available templates.`);
    process.exit(1);
  }

  console.log(`\n🎨 Using: ${t.name}\n`);
  console.log('━'.repeat(50));

  let output;
  switch (name) {
    case 'socialMedia':
      output = t.template(opts.topic || 'marketing tips', opts.platform || 'instagram', opts.tone || 'engaging');
      break;
    case 'brainstorm':
      output = t.template(opts.problem || opts.topic || 'growth strategy');
      break;
    case 'adCopy':
      output = t.template(opts.product || opts.topic || 'service', opts.audience || 'UAE residents', opts.framework || 'all');
      break;
    case 'videoScript':
      output = t.template(opts.topic || 'brand story', opts.duration || '60', opts.style || 'educational');
      break;
    case 'emailSequence':
      output = t.template(opts.business || opts.topic || 'business', opts.goal || 'conversion');
      break;
    case 'storyBrand':
      output = t.template(opts.brand || opts.topic || 'brand');
      break;
    case 'reframe':
      output = t.template(opts.problem || opts.topic || 'business challenge');
      break;
    default:
      output = t.template(opts.topic || 'topic');
  }

  console.log(output);
  console.log('\n' + '━'.repeat(50));
  console.log('💡 Copy this prompt and use it with any AI model!\n');
}

function randomTemplate() {
  const keys = Object.keys(templates);
  const key = keys[Math.floor(Math.random() * keys.length)];
  console.log(`🎲 Random pick: ${key}\n`);
  useTemplate(key, {});
}

if (command === 'list') {
  listTemplates();
} else if (command === 'use' && args[1]) {
  useTemplate(args[1], parseArgs(args.slice(2)));
} else if (command === 'random') {
  randomTemplate();
} else if (!command) {
  listTemplates();
} else {
  console.log('Usage: node prompt-templates.mjs [list|use <template>|random]');
  console.log('Run "list" for all available templates.');
}
