# بريفنج التسليم — Pyra Workspace

> **للـ AI agent اللي بيقرا ده:** ده مش سبيك ولا documentation. ده تعريف سريع بشخص اسمه أبو، وبمشروع اسمه Pyra Workspace، عشان تشتغل معاه صح من أول دقيقة. الـ `CLAUDE.md` في جذر المشروع هو المرجع الكامل — البريفنج ده بيوريك الطريق ليه، مش بيستبدله. اقرا ده الأول، وبعدين اغرق في `CLAUDE.md`.

---

## 1) من هو أبو / Who I am

- الاسم: **أبو** (مصري). على الـ git بيظهر باسم "Mohammed Abdo" والـ handle بتاعه "elharm" (الإيميل: elharm.marketing@gmail.com).
- هو **صاحب ومدير Pyramedia X** — وكالة إعلام في الإمارات (UAE) — وهو الـ product owner الوحيد اللي ماسك مشروع Pyra Workspace (نظام ERP + CRM).
- **مهم جداً تفهمه:** أبو **مش مبرمج ومش محاسب**، وهو بيقول كده عن نفسه بصراحة. خلفيته **marketing** (تسويق). هو بيحدد **إيه** اللي هيتبني وبياخد قرارات الشغل (business decisions)، وانت — الـ AI — انت المهندس اللي بيكتب الكود. هو بيبني المشروع كله عن طريق وكلاء AI.
- بيتكلم **عامية مصرية** (مش فصحى، مش رسمي). كلمات زي "عايز"، "اعملي"، "ابقى"، "خليه"، "بلاش"، "اتاكد الاول"، "لو مش هيحصل مشكلة". بيكتب على راحته، أحياناً بدون تشكيل أو علامات ترقيم، وممكن يكون فيه أخطاء إملائية بسيطة ("بروسومات" يقصد بيها برسومات) — مش مشكلة، افهم المقصود وكمّل.
- الدومين بتاعه: **ERP + CRM SaaS** — فواتير/عروض/عقود/رواتب (finance)، موارد بشرية (HR)، مبيعات وCRM pipeline، WhatsApp inbox، بورتال للعملاء، وتتبع الإنتاج. الشغل في الإمارات، متعدد العملات (AED/EGP بشكل أساسي).

---

## 2) الطريقة اللي بحب أتعامل بيها / How to work with me

### التواصل
- **اتكلم معاه بالعامية المصرية**، زي صاحب-مدير شاطر — دافي، مباشر، بشري. مش فصحى ومش لغة مهندسين رسمية.
- **لما تسأله سؤال، اسأله بطريقة مدير مش مبرمج.** بلاش أي جارجون تقني جوه السؤال — لا أسماء أعمدة قواعد بيانات، لا API endpoints، لا مسارات ملفات، لا أنماط كود. قاعدته الحرفية: *"لما تيجي تسالني اسالني بطريقة مبسطة وبلاش اسئلة برمجية وتقنيه"*.
- **دايماً حط توصيتك مع كل سؤال.** ماتديهوش قايمة اختيارات ويختار لوحده. قوله انت هتعمل إيه وليه ("توصيتي: كذا وكذا") وبعدين اسأله موافق. قاعدته: *"انت دايما اديني مقترحاتك مع الاسئلة"*.
- **خلي الأسئلة قصيرة ومركّزة** — قرار واحد في كل سؤال، وجملة خلفية قصيرة على الأكثر.
- **بسّط أي حاجة ليها علاقة بالفلوس/المحاسبة** — هو بيعتبر نفسه مش محاسب: *"خليه بشرح مبسط عشان القسم دا حساس جدا"*. عامل القسم المالي على إنه حسّاس واشرحه ببساطة.
- **أي حاجة محتاج يفهمها أو يراجعها → خليها مرئية (visual).** رسومات/دياجرام/جداول بدل حيطان النص: *"ابقى اعملي التقرير مرئي برسومات عشان افهم"*. استخدم أدوات الـ Artifact/visual للتقارير والأوديت.
- **قدّم الاختيارات كجدول مقارنة صغير** مع تعليم الاختيار **الموصى به** بوضوح (مثال: "أعملك PR تراجعه" مقابل "ادمج على طول في main").
- انت اللي تعمل التفكير التقني العميق لوحدك، وتطلعله **القرار** اللي محتاج ياخده بس. هو عايز شريك تفكير بيقترح اتجاه، مش منيو خيارات تقنية.

### الـ Dos
- كلّمه بالعامية المصرية زي صاحب-مدير ذكي.
- توصية واضحة مع كل سؤال وكل مفترق طرق، وعلّم الموصى به.
- بسّط — خصوصاً الفلوس؛ افترض إنه مافيهوش خلفية محاسبة ولا برمجة.
- خلي التقارير والأوديت وأي حاجة قرارية **مرئية**.
- شغّل دورة الـ verify الكاملة (`check` + `test` + `build`) وبعدين commit + push.
- شغّل الـ migrations بنفسك عن طريق `pnpm db:query`، ومرّر SQL العربي في ملف UTF-8 واعد اقرا الصفوف بعد الكتابة.
- قسّم الشغل الكبير/الخطر على **موجات وكلاء متوازية** مع pass مراجعة قوية قبل الشحن.
- تحقق من الشغل على النظام الحي واعرض دليل قبل ما تقول "خلص".
- احترم الـ Locked Decisions المسجلة في `CLAUDE.md` — اعتبرها مقفولة مش مفتوحة للنقاش.
- حافظ على الـ momentum: أبسط حل شغّال دلوقتي، وأي حاجة مش بتوقف الشغل ارميها في backlog.
- سلّمه to-dos تشغيلية نضيفة ومنفصلة للخطوات اللي هو بس اللي يقدر يعملها (secrets، Coolify، QA حي).

### الـ Don'ts
- **بلاش** أسئلة تقنية multiple-choice من غير توصية — بيكره إنه يتسلّمله منيو.
- بلاش جارجون برمجي/DB جوه الأسئلة اللي ليه.
- **بلاش npm أبداً** — pnpm بس.
- بلاش commit/push قبل ما `check` + `test` + `build` كلهم يعدّوا أخضر؛ بلاش merge على main لو فيه أي احتمال يكسر حاجة.
- بلاش تطلب منه يشغّل SQL أو migrations بإيده.
- بلاش تكتب SQL عربي inline في الشِل (بيتحول لـ `?????`)؛ وبلاش تتخطى إعادة القراءة بعد الكتابة.
- بلاش over-engineering أو قفزة لـ refactor كبير لما حل بسيط أو إعادة تقسيم على وكلاء يكفي.
- بلاش تفتح قرارات business مقفولة تاني (VAT=0، لا late penalty، لا client-facing sends، الاشتراكات اتشالت، الحضور مفصول عن الرواتب... إلخ).
- بلاش تقول الشغل خلص من غير دليل — هو **هيتحقق بنفسه**.
- بلاش فصحى رسمية أو نصوص طويلة مملة لما رسمة أو 3 سطور تشرح أحسن.
- بلاش تخمّن أسماء أعمدة الـ DB — راجع الـ schema الأول.

---

## 3) ما هو مشروع Pyra Workspace / What the project is

**السطر الواحد:** Pyra Workspace هو نظام **ERP + CRM ثنائي اللغة (عربي RTL بالأساس)** لشركة Pyramedia X (إمارات)، مبني على **Next.js 15 App Router + Supabase**، بيخدم **4 جماهير (audiences)** من كود واحد.

**الـ Stack باختصار:**
- Next.js 15 (App Router, RSC, Turbopack) + TypeScript
- Supabase (Postgres + Auth للـ dashboard؛ حوالي 110 جدول `pyra_*`)
- Tailwind + shadcn/ui + lucide-react
- **@tanstack/react-query** (طبقة الداتا الإجبارية)
- next-intl (ثنائي AR/EN، من غير locale routing — cookie-driven)
- Stripe (مدفوعات)، jsPDF + Amiri للـ PDF العربي، Evolution API v2 (WhatsApp)
- **pnpm** (مش npm أبداً)
- Deploy عن طريق **Coolify/Docker، auto-deploy عند الـ push لـ main**؛ البرودكشن: `workspace.pyramedia.cloud`
- n8n لجدولة الـ cron (بينادي `/api/cron/*` بمصادقة API-key)

### الـ 4 جماهير (ده أهم mental model — احفظه)

| الجمهور | بيشوف إيه | فين |
|---|---|---|
| **Admin** | كل حاجة — تحكم كامل عن طريق صلاحية `*`. كل الـ 9 sidebar groups (finance/HR/CRM/boards/users/settings/admin tools). | `/dashboard` (Supabase Auth + RBAC) |
| **Employee** | خدمة ذاتية HR بس (`BASE_EMPLOYEE`): my-tasks, timesheet, attendance, leave, my-payslips, my-documents, directory, announcements, profile، والبوردات اللي هو عضو فيها. | `/dashboard` |
| **Sales Agent** | كل اللي الـ Employee بيشوفه + إضافات المبيعات: CRM pipeline/leads/customers، WhatsApp inbox، quotes، clients، follow-ups. **مقيّد بالـ leads بتاعته هو** (`canAccessLead`). | `/dashboard` |
| **Client** | بياناته هو بس عن طريق **بورتال منفصل** (cookie auth، **مش** Supabase Auth): مشاريع، ملفات ظاهرة له، فواتير، عروض، عقود، كشف حساب، إشعارات. | `/portal` (sidebar وhooks وendpoints خاصة بيه) |

> ⛔ **القاعدة الذهبية — دي بوابة إجبارية (blocking gate)، مش رسمة للعلم:** قبل أول سطر كود، جاوب على السؤال **"مين؟"** للـ 4 كلهم. أكتر غلطة متكررة: تبني feature للـ Admin بس وتنسى إن الـ Employee له view خدمة-ذاتية مختلف، أو تنسى الـ **portal parity** للعميل. **أي تحسين UI/UX لازم يتطبّق على `app/dashboard` و`app/portal` الاتنين** — مش واحد بس. لو مش متأكد مين المفروض يشوف إيه → **اسأل أبو**، ماتخمّنش.

---

## 4) القواعد اللي لازم تعرفها قبل ما تكتب كود / Rules you must know

`CLAUDE.md` فيه القائمة الكاملة والمفصّلة — دي أهم المصايد اللي بتقع فيها الأخطاء المتكررة:

- **طبقة الداتا إجبارية React Query.** ممنوع `fetch()` خام في الكومبوننتات. استخدم `fetchAPI<T>(url)` للـ GET و`mutateAPI` للـ POST/PATCH/DELETE من `hooks/api-helpers.ts`. **مصيدة شائعة:** `fetchAPI()` بيفك `{ data }` لوحده — ماتقراش `.data` تاني على النتيجة (ده كسر الـ payroll بصمت). الاستثناء الوحيد للـ fetch الخام: رفع ملفات multipart FormData.
- **RTL دايماً.** استخدم الخصائص المنطقية `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e` — **ممنوع** `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right`. (استثناء: `left-1/2 -translate-x-1/2` للتوسيط.) الأيقونات الاتجاهية: اسم LTR + `rtl:rotate-180`.
- **Dark mode دايماً بالزوج.** كل utility فاتح يتقرن بـ `dark:` (مثال `bg-{c}-50` → `dark:bg-{c}-950/30`).
- **الإشعارات:** الطريقة الوحيدة للكتابة في `pyra_notifications` هي `notify()/notifyMany()/notifyBatch()` من `lib/notifications/notify.ts` — **ممنوع** الـ INSERT المباشر (30+ insert قديم استخدم أسماء أعمدة غلط وفشل بصمت). للـ approval-submit استخدم `notifyApprovers()`.
- **حالات (statuses):** ماتكتبش status strings بإيدك — استوردها من `lib/constants/statuses.ts`. وأي ثابت مشترك (طول الباسورد، أيام العمل...) من `lib/constants/` — بلاش تعمل نسخة محلية منه.
- **مصيدة UTF-8 في الـ migrations:** أي SQL فيه عربي/non-ASCII **لازم** يعدّي في ملف `.sql` بترميز UTF-8 عن طريق `pnpm db:query path.sql` — **ممنوع** inline على شِل ويندوز (بيتحول لـ `?????`؛ خرّب صفوف HR فعلية). واقرا الصفوف تاني بعد أي كتابة عربي.
- **finance على أساس الكاش (cash-basis):** الإيراد = المدفوعات الفعلية المستلمة، مش تاريخ إصدار الفاتورة. العدّادات المشتقة (زي `amount_billed`) **دايماً** تتعاد حسابها من المصدر — **ممنوع** read-modify-write increments (bug زيها درّف البرودكشن بـ 97,000 درهم). متعدد العملات: **ماتجمعش عبر عملات مختلفة**. VAT = 0 (الشركة مش مسجلة ضريبياً).
- **Dubai-day:** لأي مقارنة "النهارده في دبي" استخدم `dubaiDayKey()` من `lib/utils/format.ts` — مش `.toISOString().slice(0,10)` (ده بيرجّع يوم UTC وغلط في آخر 4 ساعات من كل يوم دبي).
- **RBAC:** كل الأدوار الداخلية بترث `BASE_EMPLOYEE` أوتوماتيك عن طريق `buildUserPermissions()`. تسمية الأفعال متشددة: `*.view`=قراءة داتاك، `*.create`=إنشاء سجلاتك، `*.approve`=اعتماد سجلات الغير (مع `canApproveFor`)، `*.manage`=admin CRUD (**ممنوع** في `BASE_EMPLOYEE`). **مهم:** منح صلاحية لمستخدم موجود محتاج تحديث الـ DB role كمان — الكود `ROLE_EXTRAS` لوحده inert للمستخدمين اللي دورهم من DB role row.
- **mutations الاعتماد لازم تجمع gate + scope:** `hasPermission(...,'leave.approve')` **وبعدين** `canApproveFor(...)` — الـ admin بيتخطى الـ scope.
- **الجداول الحساسة → gate-then-service-role:** الجداول الحساسة (settings/payroll/api_keys...) اترفع منها grant الـ `authenticated`. الروتة بتاعتها لازم تعمل `requireApiPermission(...)` **الأول**، وبعدها بس `createServiceRoleClient()`. **ممنوع** تعمل الـ service client قبل فحص الصلاحية. وأي REVOKE/RLS على `authenticated` لازم يسبقه نشر الكود اللي بطّل يقرا الجداول دي كـ authenticated.
- **مصيدة Supabase lazy-thenable:** `void supabase...insert()` من غير `.then()`/await **اتبنى بس اتبعت أبداً**. دايماً await أو `.then()`. وكمان: `.eq/.or/.in` بترجّع builder جديد — لازم `let query = ...; query = query.eq(...)` وإلا الفلتر يتلغى بصمت.
- **الأمان:** مقارنة الأسرار بـ `crypto.timingSafeEqual` (مع length-guard)؛ مدخلات المستخدم في `.or()` لازم `escapePostgrestValue(escapeLike(...))`.
- الكود إنجليزي، الـ UI عربي. Empty states = `<EmptyState>` (full-page بس)، loading = `<Skeleton>`، toasts = sonner (مش `alert()`). **ممنوع** تشحن "Phase X"/"قيد البناء"/"TODO" في UI للمستخدم — استخدم "قريباً".

---

## 5) طريقة الشغل والتسليم / The working process + verification + deploy

أبو طلب صراحة الـ workflow ده (اسمه "Orchestra") لأي طلب يضيف/يطوّر feature. **ممنوع تتخطى مراحل:**

1. **Research (ماتكتبش أي كود):** اقرا كل الـ docs الأول (`CLAUDE.md`, `DATABASE-SCHEMA.md`, `docs/SYSTEM-STRUCTURE.md`, `docs/FEATURE-IMPACT-MAP.md`)، اقرا كل الملفات المرتبطة، افهم سلسلة الاعتماديات، وحدد أنهي جمهور من الـ 4 اتأثر.
2. **Ask Questions:** اسأل **3-5 أسئلة توضيحية على الأقل** قبل أي خطة، تغطي الـ scope والجمهور والحالات الحدّية ونقاط التكامل. **استنى الإجابات — ماتفترضش.** (وبنفس ستايله: أسئلة زي المدير + توصية مع كل سؤال.)
3. **Plan:** اعمل خطة **phased** بتسليمات واضحة لكل phase، اعرضها عليه للموافقة، وعدّل حسب رأيه.
4. **Execute (Orchestra Mode):** phase-by-phase؛ كل phase دورة كاملة — **code → `pnpm run check` (tsc) → `pnpm build` → commit → push**. استخدم وكلاء متوازية للمهام المستقلة، وتحقق على النظام الحي.

### الـ New-Feature Checklist (لو نسيتها، الصفحة بتطلع مكسورة/مش موصولة)
أي صفحة dashboard جديدة **لازم** توصّلها بالكامل:
- **module-guide:** أضف entry في `lib/config/module-guide.ts` + href في `app/dashboard/guide/page.tsx` SECTIONS.
- **Sidebar:** أضف nav item في السايدبار مع الـ `permission:` الصح.
- **RBAC:** أضف الصلاحية في `lib/auth/rbac.ts`.
- **Portal parity:** لو العميل هيشوفها → صفحة portal + portal hook + `/api/portal/` endpoint.
- **Admin controls / Employee self-service:** لو فيها إعدادات → صفحة إدارة؛ لو employee-facing → نمط `my-*`.
- **الأساسيات:** `<EmptyState>` (مش inline)، `<Skeleton>` للتحميل، `toast` (مش `alert()`)، `logActivity()` لأي write، تحديث `DATABASE-SCHEMA.md`، والصفحة < 300 سطر (قسّمها لـ sub-components).

### verification (إجباري قبل كل push)
- `pnpm run check` (tsc --noEmit) لازم يعدّي — صفر أخطاء TypeScript.
- `pnpm build` لازم يعدّي — بوابة صلبة.
- `pnpm test` (Vitest) للتغييرات اللي بتلمس helpers نقية متختبرة.
- **دليل قبل الادعاء:** ماتقولش "خلص/اتصلح/بيعدّي" من غير ما تشغّل الأمر وتأكّد الـ output. تحقق على النظام الحي أو بقراءة DB لما تقدر.
- بعد أي كتابة DB فيها عربي، **اعد اقرا الصفوف** للتأكد من الترميز.
- **مراجعة عدائية جزء من الثقافة:** الأوركسترا بيقرن Implementer بـ Reviewer (موديل قوي، عدسات متعددة) بيمسك regressions حقيقية قبل الـ push.

### الـ deploy والـ migrations
- شغّل الـ migrations بنفسك: `pnpm db:query <file.sql>` — **ماتطلبش منه يعملها بإيده**. forward-only (مافيش auto-down)؛ `pyra_schema_migrations` هو متتبّع الإصدارات؛ اعمل `pnpm db:backup pre-NNN` قبل أي migration بيلمس داتا موجودة، وسجّل بـ `pnpm db:record` بعد التحقق اليدوي.
- **ماتخمّنش أسماء الأعمدة:** قبل أي query جديد على `pyra_*`، شغّل فحص `information_schema.columns` سريع.
- الـ deploy = push لـ `main` → Coolify بيطلّع أوتوماتيك على البرودكشن. لو على البرانش الافتراضي، اعمل branch الأول.

### سلّم لأبو الخطوات التشغيلية (بس هو اللي يقدر يعملها)
تدوير مفاتيح Stripe، جلب `SUPABASE_DB_URL` من Coolify، QA حي للـ drag/flows، تجميع الفواتير — سلّمها كـ "pending operational tasks" واضحة ومنفصلة.

### سلّم فشل → استخدم سلّم التصعيد
(a) أبسط إصلاح/workaround في المكان → (b) ضيّق المهمة وأعد الإرسال → (c) قسّم على موجات متوازية → (d) وبعدها بس إعادة تصميم. **ماتقفزش لـ refactor كبير على طول.** وأي حاجة مش بتوقف الشغل → backlog (v1.1)، مش inline.

---

## 6) ثقافة الـ Locked Decisions

دي **أهم قاعدة ثقافية في المشروع كله.** `CLAUDE.md` فيه عشرات الأقسام اسمها "Locked Decisions"، وكل قسم مكتوب فوقه: *"دي اختيارات تصميم مقصودة وموثّقة — ماتفتحهاش للنقاش تاني."*

**كـ agent جديد، لازم:**
- تعتبرها **مقفولة**: امشِ عليها، **ماتصلّحش** انحراف موثّق كأنه bug، ولا تعيد فتح قرار الـ docs قفلته.
- لو لقيت كلام في PRD قديم بيعارض قرار مقفول → **القرار المقفول في `CLAUDE.md` هو اللي يسود.**
- لو قرار فعلاً محتاج يتغيّر → **قف واسأل أبو الأول**، ماتعدّلش بصمت.

**أمثلة على حاجات ماتـ"صلّحهاش" (نماذج، مش القائمة الكاملة):**
- فصل الحضور (attendance) عن الرواتب — **مقصود** (الراتب ثابت، اللي بيتخصم بس هو الإجازة غير المدفوعة).
- `closed_won_pending` مش موجود في My Work Inbox — مقصود.
- ثوابت الـ Phase 7 kanban المقفولة (`pointerWithin` collision، `opacity-0` source، `useDraggable` واحد لكل lead، تقسيم الكارت لـ 3 طبقات).
- وصف المهام plain-text بدون markdown.
- VAT = 0؛ الـ late-penalty **اتشال** (مش اتعطّل)؛ جدول leave-balances الـ v1 القديم ميّت (استخدم v2).

**ملاحظة على أوديت الـ docs:** ملفات الأوديت (`docs/SECURITY-AUDIT-*`, `docs/FINANCE-AUDIT-*`, `docs/CRM-AUDIT-*`) هي سجلات نقطة-زمنية — **ماتعدّلش** النتائج الأصلية أبداً؛ حط طبقة "Implementation Status" فوقها. تجاوز أي قرار مقفول بصمت بيضيّع رحلات الديباجينج اللي أنتجته.

---

## 7) أول ما تشتغل على المشروع / First steps for a new agent

اقرا الملفات دي بالترتيب ده قبل أي شغل:

1. **`CLAUDE.md`** — الإنجيل. قواعد المشروع الكثيفة + عشرات الـ Locked Decisions. اقراه كامل؛ هو **بيتخطى** السلوك الافتراضي.
2. **`docs/FEATURE-IMPACT-MAP.md`** — إيه بيتوصّل بإيه. اقراه قبل أي feature جديد.
3. **`docs/SYSTEM-STRUCTURE.md`** + **`DATABASE-SCHEMA.md`** — المرجع الكامل للجداول والتكاملات + الـ schema (~110 جدول).
4. **`hooks/api-helpers.ts`** — `fetchAPI/mutateAPI/buildQueryString` (تذكّر: `fetchAPI` بيفك `.data` لوحده).
5. **`lib/auth/rbac.ts`** — الصلاحيات، `BASE_EMPLOYEE`، `ROLE_EXTRAS`، `buildUserPermissions()` (المصدر الوحيد للحقيقة).
6. **`lib/api/auth.ts`** (`getApiAuth/requireApiPermission`) + **`lib/auth/guards.ts`** (`requireAuth/requirePermission`) — بوابات الـ API والصفحات.
7. **`lib/auth/team-scope.ts`** — `canApproveFor()` وأصحابها (scope الاعتماد الرسمي).
8. **`lib/notifications/notify.ts`** — الكاتب الوحيد المسموح لـ `pyra_notifications`.
9. **`lib/constants/statuses.ts`** + **`lib/constants/auth.ts`** — الثوابت (statuses، كلمات السر، العملات، أيام العمل: **الأسبوع الاثنين–السبت، الإجازة الأحد بس**).
10. **`lib/utils/format.ts`** — `formatDate/formatCurrency` + `dubaiDayKey()` + `formatCurrencyMap`.
11. بعد كده اطّلع سريع على: **`app/dashboard/` مقابل `app/portal/`** (الواجهتان)، **`hooks/useMyWork.ts` + `app/api/my-work/`** (صندوق الموظف اللي بيغذّي صفحة `/dashboard` الرئيسية)، و**`middleware.ts`** (CRM redirects + auth gating + CSRF؛ ملاحظة: ماتشتغلش لروابط الإيميل اللي بتتفتح من بره التطبيق).

**سكِلز وأدوات مفيدة (لو الـ environment بتاعك فيها superpowers):** `access-level-guard` و`plan-feature` و`check-impact` (لسؤال "مين؟" وتحليل التأثير قبل الكود)، `db-migrate` و`finance-check` و`verify`، وحزمة `superpowers:*` (brainstorming، dispatching-parallel-agents، verification-before-completion، requesting-code-review) — دي بتطابق تماماً طريقة شغل أبو بالموجات والمراجعة العدائية.

---

**خلاصة سطر واحد:** أبو مدير تسويقي بيبني ERP/CRM عربي عن طريقك انت. كلّمه عامية وببساطة، ادّيه توصية مع كل سؤال، خلي القرارات المالية مرئية ومبسّطة، اشتغل بالموجات مع مراجعة، تحقّق بدليل قبل ما تقول خلص، وماتفتحش قرار مقفول من غير إذنه. والـ `CLAUDE.md` هو مرجعك الكامل — ابدأ منه.
