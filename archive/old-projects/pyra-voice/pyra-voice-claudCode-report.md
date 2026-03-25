تم فحص كل سطر في المشروع. هذا التقرير الشامل بالأخطاء:

تقرير الأخطاء في مشروع Pyra Voice
خطأ حرج #1: useEffect cleanup يدمر الجلسة عند تشغيل الصوت
الملف: hooks/useVoiceSession.ts سطر 69 و 173-175

هذا أخطر خطأ في المشروع بالكامل. السلسلة:

playback = useAudioPlayback()  →  يرجع object جديد كل render
cleanup = useCallback(..., [playback])  →  يتغير كل ما playback يتغير
useEffect(() => { return () => { cleanup(); }; }, [cleanup]);  →  ينفذ cleanup كل ما يتغير

ماذا يحصل؟ لما Gemini يرجع صوت → isPlaying يتغير لـ true → كائن playback يتغير → cleanup يتغير → الـ useEffect يعيد التشغيل → يستدعي cleanup() القديم → يقفل الـ WebSocket ويوقف الميكروفون ويدمر الجلسة!

المفروض يكون:

// الحل: لا تعتمد على playback object كله
const flushRef = useRef(playback.flush);
useEffect(() => { flushRef.current = playback.flush; }, [playback.flush]);

const cleanup = useCallback(() => {
  // استخدم ref بدل playback مباشرة
  flushRef.current();
  // ...
}, []); // بدون dependency على playback

خطأ حرج #2: Header عنده state منفصل عن الأب (Duplicate State)
الملف: components/Header.tsx سطر 10 + app/page.tsx سطر 13

// page.tsx
const [lang, setLang] = useState<'en' | 'ar'>('en');

// Header.tsx (داخلياً)
const [lang, setLang] = useState<'en' | 'ar'>('en');

الـ Header يدير state لغة خاص به منفصل تماماً عن الأب. يعني لو الأب حاول يغير اللغة برمجياً، الـ Header مش هيتحدث. الحل: الـ Header لازم يستقبل lang كـ prop ويكون controlled component.

خطأ حرج #3: WebSocket لا يعمل في وضع التطوير (Dev Mode)
الملف: next.config.js + package.json

npm run dev يشغل Next.js فقط على port 3000
npm run server يشغل Backend فقط على port 3001
Next.js rewrites لا تدعم WebSocket upgrades
الـ WS_URL الافتراضي هو ws://localhost:3000/ws (نفس host الصفحة)
النتيجة: WebSocket يفشل في dev mode لأن Next.js dev server لا يستطيع proxy WebSocket. لازم المطور يضبط NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws يدوياً، لكن هذا غير موثق.

خطأ حرج #4: server.js يعتمد على setTimeout(2000) بدون تحقق
الملف: server.js سطر 20

setTimeout(async () => {
  // start frontend...
}, 2000);

يفترض أن Backend جاهز بعد 2 ثانية. لو بطيء (cold start, شبكة بطيئة)، الـ proxy هيفشل. لا يوجد health check أو retry mechanism.

خطأ متوسط #5: ScriptProcessorNode deprecated
الملف: hooks/useAudioCapture.ts سطر 42

const processor = context.createScriptProcessor(4096, 1, 1);

ScriptProcessorNode deprecated رسمياً ويعمل على الـ main thread. يسبب تقطيع في الصوت (audio glitches) لأنه يتنافس مع UI rendering. البديل الحديث هو AudioWorkletNode.

خطأ متوسط #6: CSS transition-colors على كل العناصر
الملف: app/globals.css سطر 56-58

@layer base {
  * {
    @apply transition-colors duration-200;
  }
}

يطبق transition على كل عنصر في الصفحة بما فيها <canvas>, <svg>, pseudo-elements. هذا يسبب:

استهلاك ذاكرة وأداء GPU زائد
تداخل مع Canvas animations (الجزيئات والـ waveform)
بطء محتمل على الأجهزة الضعيفة
خطأ متوسط #7: Google Fonts محمّلة بـ @import تمنع الرندر
الملف: app/globals.css سطر 5

@import url('https://fonts.googleapis.com/css2?family=Inter:...');

استخدام @import في CSS يعتبر render-blocking. الحل الأفضل في Next.js هو استخدام next/font في layout.tsx أو <link> tags في الـ HTML head.

خطأ متوسط #8: Race condition في Gemini connect()
الملف: server/websocket/gemini.js سطر 74-83

const setupTimeout = setTimeout(() => {
  if (!this.isSetupComplete) {
    reject(new Error('Gemini setup timeout'));
  }
}, 15000);

this._setupResolve = () => {
  clearTimeout(setupTimeout);
  resolve();
};

إذا فشل WebSocket (error event) وعمل reject أولاً، الـ setupTimeout لا يتم إلغاؤه ويستدعي reject مرة ثانية بعد 15 ثانية. لا يسبب crash لكنه خطأ منطقي.

خطأ متوسط #9: endSession لا ينتظر رد السيرفر
الملف: hooks/useVoiceSession.ts سطر 154-160

const endSession = useCallback(() => {
  if (wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify({ type: 'end' }));
  }
  cleanup();  // يقفل WebSocket فوراً!
  setState('idle');
}, [cleanup]);

يرسل end ثم يقفل WebSocket فوراً قبل ما السيرفر يرد بـ ended. معنى كده إن saveConversation على السيرفر قد لا تكتمل لأن الاتصال أُغلق.

خطأ متوسط #10: WaveForm animation تعمل حتى لما inactive
الملف: components/WaveForm.tsx سطر 32-44

لما isActive === false، الكود لسه بيعمل requestAnimationFrame(draw) في loop مستمر لرسم خطوط مسطحة. هذا يستهلك CPU بلا فائدة. المفروض يوقف الـ animation loop لما يكون inactive.

خطأ بسيط #11: flush() تقفل AudioContext وفيه sources شغالة
الملف: hooks/useAudioPlayback.ts سطر 84-93

flush() تقفل الـ AudioContext بينما فيه AudioBufferSourceNode مجدولة وشغالة. هذا يسبب errors في الـ console لأن callbacks الـ onended تحاول تستخدم context مقفول.

خطأ بسيط #12: Transcript تدمج كل رسائل الـ assistant في رسالة واحدة
الملف: hooks/useVoiceSession.ts سطر 34-52

addTranscript تدمج كل نصوص نفس الـ role في رسالة واحدة. لو Gemini رد أكثر من مرة بدون ما المستخدم يتكلم بينهم، كل الردود تتحول لرسالة واحدة طويلة. turn_complete لا يعمل فاصل.

خطأ بسيط #13: isValidBase64 غير مستخدمة
الملف: server/utils/audio.js سطر 8-14

الدالة معرّفة ومصدّرة لكن لا تُستخدم في أي مكان في المشروع. Dead code.

خطأ بسيط #14: لا يوجد validation على audio data من العميل
الملف: server/websocket/handler.js سطر 58-60

البيانات الصوتية من العميل تُرسل مباشرة لـ Gemini بدون أي تحقق من صحتها أو حجمها.

خطأ بسيط #15: NODE_ENV=production مكرر في Dockerfile
الملف: Dockerfile سطر 13 و 17

ENV NODE_ENV=production   # سطر 13
# ...
ENV NODE_ENV=production   # سطر 17 (مكرر)

ملخص حسب الخطورة
الخطورة	العدد	الأخطاء
حرج	4	cleanup يدمر الجلسة، Header duplicate state، WebSocket لا يعمل في dev، setTimeout بدون تحقق
متوسط	6	ScriptProcessor deprecated، CSS performance، Fonts render-blocking، Race condition، endSession لا ينتظر، WaveForm CPU
بسيط	5	flush AudioContext، Transcript merging، Dead code، No validation، Duplicate ENV
هل تريد أبدأ في إصلاح هذه الأخطاء؟