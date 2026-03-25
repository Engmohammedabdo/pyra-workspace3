<?php // Eitmam Lawyers Platform Presentation v5 — PyramediaX ?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>محامين مركز إتمام | الخطة الشاملة</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800;900&family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        :root {
            --bg-dark: #0a0a1a;
            --bg-card: rgba(255,255,255,0.03);
            --gold: #c5a572;
            --gold-light: #d4b896;
            --gold-dark: #a08050;
            --text-white: #f0f0f0;
            --text-gray: #a0a0b0;
            --glass-border: rgba(197,165,114,0.15);
            --glass-bg: rgba(255,255,255,0.04);
            --accent-green: #4ecdc4;
            --accent-red: #ff6b6b;
            --accent-blue: #45b7d1;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Cairo', 'Tajawal', sans-serif;
            background: var(--bg-dark);
            color: var(--text-white);
            overflow: hidden;
            height: 100vh;
            width: 100vw;
        }
        /* Progress Bar */
        .progress-bar {
            position: fixed; top: 0; left: 0; height: 4px;
            background: linear-gradient(90deg, var(--gold), var(--gold-light));
            z-index: 1000; transition: width 0.5s ease;
        }
        /* Slide Counter */
        .slide-counter {
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            font-size: 0.85rem; color: var(--text-gray); z-index: 100;
            background: rgba(0,0,0,0.5); padding: 5px 15px; border-radius: 20px;
        }
        /* Particles Canvas */
        #particles {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            z-index: 0; pointer-events: none;
        }
        /* Slides Container */
        .slides-container {
            position: relative; width: 100%; height: 100vh; z-index: 1;
        }
        .slide {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            padding: 40px 60px; opacity: 0; transform: translateY(30px);
            transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: none; overflow-y: auto;
        }
        .slide.active {
            opacity: 1; transform: translateY(0); pointer-events: auto;
        }
        /* Typography */
        .slide-title {
            font-size: 2.8rem; font-weight: 800; margin-bottom: 1rem;
            background: linear-gradient(135deg, var(--gold), var(--gold-light));
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .slide-subtitle { font-size: 1.4rem; color: var(--text-gray); margin-bottom: 2rem; font-weight: 300; }
        /* Glass Cards */
        .glass-card {
            background: var(--glass-bg); border: 1px solid var(--glass-border);
            border-radius: 16px; padding: 2rem; backdrop-filter: blur(10px);
            transition: transform 0.3s, box-shadow 0.3s;
        }
        .glass-card:hover { transform: translateY(-5px); box-shadow: 0 10px 40px rgba(197,165,114,0.1); }
        /* Grid */
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; width: 100%; max-width: 1100px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem; width: 100%; max-width: 1100px; }
        .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; width: 100%; max-width: 1100px; }
        /* Stats */
        .stat-number {
            font-size: 3rem; font-weight: 900; color: var(--gold);
            font-family: 'Tajawal', sans-serif;
        }
        .stat-label { font-size: 0.95rem; color: var(--text-gray); margin-top: 5px; }
        /* Counter Animation */
        .counter { display: inline-block; }
        /* List Items */
        .list-item {
            display: flex; align-items: center; gap: 12px;
            padding: 10px 0; font-size: 1.05rem; color: var(--text-gray);
        }
        .list-item i { color: var(--gold); min-width: 20px; }
        /* Table */
        .styled-table { width: 100%; border-collapse: collapse; max-width: 1100px; }
        .styled-table th {
            background: rgba(197,165,114,0.15); color: var(--gold);
            padding: 12px 16px; text-align: right; font-weight: 700;
        }
        .styled-table td {
            padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.05);
            color: var(--text-gray); text-align: right;
        }
        .styled-table tr:hover td { background: rgba(197,165,114,0.05); }
        /* Recommended badge */
        .badge-recommended {
            background: linear-gradient(135deg, var(--gold), var(--gold-dark));
            color: #000; padding: 4px 12px; border-radius: 20px;
            font-size: 0.75rem; font-weight: 700;
        }
        /* Flow diagram */
        .flow-step {
            text-align: center; padding: 1.5rem;
        }
        .flow-icon {
            width: 70px; height: 70px; border-radius: 50%;
            background: linear-gradient(135deg, var(--gold), var(--gold-dark));
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 1rem; font-size: 1.8rem; color: #000;
        }
        .flow-arrow { color: var(--gold); font-size: 2rem; display: flex; align-items: center; }
        /* Timeline */
        .timeline-item {
            position: relative; padding: 1.5rem; padding-right: 3rem;
            border-right: 2px solid var(--gold);
        }
        .timeline-item::before {
            content: ''; position: absolute; right: -8px; top: 1.8rem;
            width: 14px; height: 14px; border-radius: 50%;
            background: var(--gold); border: 3px solid var(--bg-dark);
        }
        /* Chart container */
        .chart-container { width: 100%; max-width: 500px; margin: 0 auto; }
        /* Navigation */
        .nav-btn {
            position: fixed; top: 50%; z-index: 100;
            background: rgba(197,165,114,0.15); border: 1px solid var(--glass-border);
            color: var(--gold); width: 50px; height: 50px; border-radius: 50%;
            cursor: pointer; font-size: 1.2rem; transition: all 0.3s;
            display: flex; align-items: center; justify-content: center;
        }
        .nav-btn:hover { background: rgba(197,165,114,0.3); }
        #prevBtn { right: 20px; }
        #nextBtn { left: 20px; }
        /* PyramediaX special */
        .pyramediax-logo {
            font-size: 4rem; font-weight: 900;
            background: linear-gradient(135deg, #c5a572, #f0d9a0, #c5a572);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text; letter-spacing: 2px;
        }
        .pyramediax-glow {
            text-shadow: 0 0 40px rgba(197,165,114,0.3);
            animation: glow 2s ease-in-out infinite alternate;
        }
        @keyframes glow {
            from { filter: drop-shadow(0 0 20px rgba(197,165,114,0.2)); }
            to { filter: drop-shadow(0 0 40px rgba(197,165,114,0.5)); }
        }
        /* Animations */
        .anim-up { opacity: 0; transform: translateY(30px); transition: all 0.6s ease; }
        .anim-up.visible { opacity: 1; transform: translateY(0); }
        .delay-1 { transition-delay: 0.1s; }
        .delay-2 { transition-delay: 0.2s; }
        .delay-3 { transition-delay: 0.3s; }
        .delay-4 { transition-delay: 0.4s; }
        /* Responsive */
        @media (max-width: 768px) {
            .slide { padding: 20px; }
            .slide-title { font-size: 1.8rem; }
            .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
            .stat-number { font-size: 2rem; }
            .nav-btn { width: 40px; height: 40px; }
        }
    </style>
</head>
<body>
    <div class="progress-bar" id="progressBar"></div>
    <canvas id="particles"></canvas>
    <div class="slide-counter"><span id="currentSlide">1</span> / <span id="totalSlides">12</span></div>

    <button class="nav-btn" id="prevBtn"><i class="fa-solid fa-chevron-right"></i></button>
    <button class="nav-btn" id="nextBtn"><i class="fa-solid fa-chevron-left"></i></button>

    <div class="slides-container">

<!-- ===== سلايد 1 — الغلاف ===== -->
<div class="slide" id="slide-1">
  <div class="slide-content anim-up">
    <h1 class="slide-title anim-up delay-1">محامين مركز إتمام</h1>
    <p class="slide-subtitle anim-up delay-2">أول منصة قانونية ذكية في الإمارات</p>
    <div class="glass-card anim-up delay-3">
      <p class="slide-tagline">المحامي المناسب... بضغطة زر</p>
      <p class="slide-partnership">بشراكة استراتيجية حصرية مع محاكم الشارقة</p>
    </div>
  </div>
</div>

<!-- ===== سلايد 2 — المشكلة ===== -->
<div class="slide" id="slide-2">
  <div class="slide-content">
    <h2 class="slide-title anim-up">سوق بـ 18.4 مليار درهم... بدون منصة!</h2>

    <div class="grid-2">
      <!-- بطاقة العميل -->
      <div class="glass-card anim-up delay-1">
        <h3><i class="fa-solid fa-user-xmark"></i> العميل تائه</h3>
        <ul>
          <li class="list-item"><i class="fa-solid fa-xmark"></i> يبحث ساعات عن محامي مناسب</li>
          <li class="list-item"><i class="fa-solid fa-xmark"></i> لا يعرف التكلفة مسبقاً</li>
          <li class="list-item"><i class="fa-solid fa-xmark"></i> صفر تقييمات أو مراجعات موثوقة</li>
        </ul>
      </div>

      <!-- بطاقة المحامي -->
      <div class="glass-card anim-up delay-2">
        <h3><i class="fa-solid fa-user-tie"></i> المحامي يخسر</h3>
        <ul>
          <li class="list-item"><i class="fa-solid fa-xmark"></i> يدفع آلاف على إعلانات بلا عائد</li>
          <li class="list-item"><i class="fa-solid fa-xmark"></i> المكاتب الكبيرة تسحب السوق</li>
          <li class="list-item"><i class="fa-solid fa-xmark"></i> لا قناة متخصصة لجذب العملاء</li>
        </ul>
      </div>
    </div>

    <div class="stat-highlight anim-up delay-3">
      <p class="stat-number">أقل من 10%</p>
      <p class="stat-label">من الخدمات القانونية في الإمارات رقمية</p>
    </div>
  </div>
</div>

<!-- ===== سلايد 3 — الحل (العقد الثلاثي) ===== -->
<div class="slide" id="slide-3">
  <div class="slide-content">
    <h2 class="slide-title anim-up">الحل: وسيط مفاوض... مش مجرد دليل</h2>

    <div class="grid-3">
      <!-- العميل -->
      <div class="glass-card anim-up delay-1">
        <div class="card-icon"><i class="fa-solid fa-user"></i></div>
        <h3>العميل</h3>
        <p>يوصف مشكلته القانونية</p>
        <p>يحصل على محامي مؤهل ومناسب</p>
      </div>

      <!-- إتمام -->
      <div class="glass-card anim-up delay-2">
        <div class="card-icon"><i class="fa-solid fa-handshake"></i></div>
        <h3>إتمام</h3>
        <p>يفاوض نيابة عن العميل</p>
        <p>يتابع سير القضية</p>
        <p>يحمي حق العميل بالعقد الثلاثي</p>
      </div>

      <!-- المحامي -->
      <div class="glass-card anim-up delay-3">
        <div class="card-icon"><i class="fa-solid fa-scale-balanced"></i></div>
        <h3>المحامي</h3>
        <p>يحصل على عملاء مؤهلين جاهزين</p>
        <p>بدون تكلفة تسويق</p>
      </div>
    </div>

    <div class="analogy anim-up delay-3">
      <i class="fa-solid fa-lightbulb"></i>
      <p>زي الاستشاري الهندسي في عقود البناء — يحمي المالك ويراقب المقاول</p>
    </div>
  </div>
</div>

<!-- ===== سلايد 4 — حجم الفرصة ===== -->
<div class="slide" id="slide-4">
  <div class="slide-content">
    <h2 class="slide-title anim-up">فرصة بمليارات... والميدان فارغ</h2>

    <div class="grid-4">
      <div class="glass-card stat-card anim-up delay-1">
        <p class="stat-number counter" data-target="18.4">0</p>
        <p class="stat-unit">مليار درهم</p>
        <p class="stat-label">حجم السوق</p>
      </div>

      <div class="glass-card stat-card anim-up delay-2">
        <p class="stat-number counter" data-target="7.2">0</p>
        <p class="stat-unit">%</p>
        <p class="stat-label">نمو سنوي</p>
      </div>

      <div class="glass-card stat-card anim-up delay-3">
        <p class="stat-number counter" data-target="1710">0</p>
        <p class="stat-unit">محامي</p>
        <p class="stat-label">محامي مرخص</p>
      </div>

      <div class="glass-card stat-card anim-up delay-3">
        <p class="stat-number counter" data-target="0">0</p>
        <p class="stat-unit">منصة</p>
        <p class="stat-label">منصات منافسة</p>
      </div>
    </div>
  </div>
</div>

<!-- ===== سلايد 5 — كيف تعمل المنصة ===== -->
<div class="slide" id="slide-5">
  <div class="slide-content">
    <h2 class="slide-title anim-up">4 خطوات تربط العميل بمحاميه</h2>

    <div class="grid-4">
      <div class="flow-step anim-up delay-1">
        <div class="flow-icon"><i class="fa-solid fa-pen"></i></div>
        <div class="flow-number">1</div>
        <h3>وصف المشكلة</h3>
        <p>العميل يوصف مشكلته القانونية</p>
      </div>

      <div class="flow-step anim-up delay-2">
        <div class="flow-icon"><i class="fa-solid fa-robot"></i></div>
        <div class="flow-number">2</div>
        <h3>ترشيح ذكي</h3>
        <p>المنصة ترشح محامين متخصصين</p>
      </div>

      <div class="flow-step anim-up delay-3">
        <div class="flow-icon"><i class="fa-solid fa-handshake"></i></div>
        <div class="flow-number">3</div>
        <h3>العقد الثلاثي</h3>
        <p>إتمام يتفاوض ويكتب العقد الثلاثي</p>
      </div>

      <div class="flow-step anim-up delay-3">
        <div class="flow-icon"><i class="fa-solid fa-gavel"></i></div>
        <div class="flow-number">4</div>
        <h3>تنفيذ ومتابعة</h3>
        <p>المحامي يبدأ القضية + إتمام يتابع</p>
      </div>
    </div>
  </div>
</div>

<!-- ===== سلايد 6 — نموذج الإيرادات ===== -->
<div class="slide" id="slide-6">
  <div class="slide-content">
    <h2 class="slide-title anim-up">إيرادات مزدوجة — العقد الثلاثي</h2>

    <div class="grid-2">
      <!-- رسوم العميل -->
      <div class="glass-card anim-up delay-1">
        <h3><i class="fa-solid fa-user"></i> رسوم العميل</h3>
        <p class="stat-number">750 درهم</p>
        <p class="stat-label">رسوم إحالة ومتابعة لكل قضية</p>
      </div>

      <!-- رسوم المحامي -->
      <div class="glass-card anim-up delay-2">
        <h3><i class="fa-solid fa-scale-balanced"></i> رسوم المحامي</h3>
        <p class="stat-number">500 درهم</p>
        <p class="stat-label">اشتراك شهري</p>
        <p class="stat-number">750 درهم</p>
        <p class="stat-label">عمولة لكل قضية</p>
      </div>
    </div>

    <div class="revenue-highlight anim-up delay-3">
      <div class="badge-recommended">العقد الثلاثي</div>
      <p class="stat-number big">270,000 درهم</p>
      <p class="stat-label">إيراد متوقع — السنة الأولى</p>
    </div>
  </div>
</div>


<!-- slides-part2.html — Slides 7-12 — HTML Only -->

<!-- ==================== سلايد 7 — الفرضيات الهيكلية ==================== -->
<div class="slide" id="slide-7">
  <div class="slide-header">
    <span class="slide-number">07</span>
    <h1 class="slide-title">3 فرضيات... أيها الأنسب؟</h1>
    <p class="slide-subtitle">مقارنة الخيارات الهيكلية لإطلاق خدمة المحاماة</p>
  </div>

  <div class="slide-body">
    <table class="styled-table">
      <thead>
        <tr>
          <th>الفرضية</th>
          <th>الاسم</th>
          <th>التكلفة</th>
          <th>المزايا</th>
          <th>المخاطر</th>
        </tr>
      </thead>
      <tbody>
        <tr class="row-recommended">
          <td>
            <span class="hypothesis-label">A</span>
            <span>مدمجة مع إتمام</span>
            <span class="badge-recommended">✦ الموصى</span>
          </td>
          <td><strong>محامين مركز إتمام</strong></td>
          <td><span class="cost-value">10 - 22K</span> <span class="cost-unit">درهم</span></td>
          <td>
            <span class="advantage-icon">⚡</span> أسرع وأرخص
          </td>
          <td>
            <span class="risk-icon">⚠️</span> محدودية النمو
          </td>
        </tr>
        <tr>
          <td>
            <span class="hypothesis-label">B</span>
            <span>كيان تابع لإتمام</span>
          </td>
          <td><strong>إتمام للمحامين</strong></td>
          <td><span class="cost-value">45 - 90K</span> <span class="cost-unit">درهم</span></td>
          <td>
            <span class="advantage-icon">🔓</span> مرونة أكبر
          </td>
          <td>
            <span class="risk-icon">⚠️</span> تكلفة أعلى
          </td>
        </tr>
        <tr>
          <td>
            <span class="hypothesis-label">C</span>
            <span>كيان تابع لإنجازات</span>
          </td>
          <td><strong>محاماة إنجازات</strong></td>
          <td><span class="cost-value">205 - 405K</span> <span class="cost-unit">درهم</span></td>
          <td>
            <span class="advantage-icon">🏛️</span> استقلالية كاملة
          </td>
          <td>
            <span class="risk-icon">🔴</span> تكلفة عالية جداً
          </td>
        </tr>
      </tbody>
    </table>

    <div class="recommendation-box">
      <span class="recommendation-icon">💡</span>
      <p><strong>التوصية:</strong> الفرضية A — البدء كخدمة مدمجة داخل إتمام، مع خطة تطوير تدريجية حسب النتائج.</p>
    </div>
  </div>
</div>

<!-- ==================== سلايد 8 — خارطة الطريق ==================== -->
<div class="slide" id="slide-8">
  <div class="slide-header">
    <span class="slide-number">08</span>
    <h1 class="slide-title">من انستجرام... للتطبيق</h1>
    <p class="slide-subtitle">خارطة طريق تدريجية — 12 شهر</p>
  </div>

  <div class="slide-body">
    <div class="timeline">

      <!-- المرحلة 0 -->
      <div class="timeline-item phase-0">
        <div class="timeline-marker">
          <span class="phase-number">0</span>
        </div>
        <div class="timeline-content">
          <div class="phase-header">
            <h3>المرحلة التأسيسية</h3>
            <span class="phase-duration">0 — 3 شهور</span>
          </div>
          <div class="phase-icon">📱</div>
          <h4>حساب انستجرام</h4>
          <div class="phase-metrics">
            <div class="metric">
              <span class="metric-label">التكلفة</span>
              <span class="metric-value">19K درهم</span>
            </div>
            <div class="metric">
              <span class="metric-label">المحامين</span>
              <span class="metric-value">3 محامين</span>
            </div>
            <div class="metric">
              <span class="metric-label">الاستفسارات</span>
              <span class="metric-value">30 / شهر</span>
            </div>
          </div>
        </div>
      </div>

      <!-- المرحلة 1 -->
      <div class="timeline-item phase-1">
        <div class="timeline-marker">
          <span class="phase-number">1</span>
        </div>
        <div class="timeline-content">
          <div class="phase-header">
            <h3>مرحلة التوسع</h3>
            <span class="phase-duration">3 — 6 شهور</span>
          </div>
          <div class="phase-icon">🌐</div>
          <h4>موقع ويب</h4>
          <div class="phase-metrics">
            <div class="metric">
              <span class="metric-label">التكلفة</span>
              <span class="metric-value">65K درهم</span>
            </div>
            <div class="metric">
              <span class="metric-label">المحامين</span>
              <span class="metric-value">10 محامين</span>
            </div>
            <div class="metric">
              <span class="metric-label">الاستفسارات</span>
              <span class="metric-value">100 / شهر</span>
            </div>
          </div>
        </div>
      </div>

      <!-- المرحلة 2 -->
      <div class="timeline-item phase-2">
        <div class="timeline-marker">
          <span class="phase-number">2</span>
        </div>
        <div class="timeline-content">
          <div class="phase-header">
            <h3>مرحلة النضج</h3>
            <span class="phase-duration">6 — 12 شهر</span>
          </div>
          <div class="phase-icon">📲</div>
          <h4>تطبيق موبايل</h4>
          <div class="phase-metrics">
            <div class="metric">
              <span class="metric-label">التكلفة</span>
              <span class="metric-value">150K درهم</span>
            </div>
            <div class="metric">
              <span class="metric-label">المحامين</span>
              <span class="metric-value">30 محامي</span>
            </div>
            <div class="metric">
              <span class="metric-label">الاستفسارات</span>
              <span class="metric-value">500 / شهر</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>

<!-- ==================== سلايد 9 — التحليل المالي ==================== -->
<div class="slide" id="slide-9">
  <div class="slide-header">
    <span class="slide-number">09</span>
    <h1 class="slide-title">Break-even في 5-7 أشهر</h1>
    <p class="slide-subtitle">التحليل المالي — الفرضية A</p>
  </div>

  <div class="slide-body">
    <div class="grid-2">

      <!-- يسار: الرسم البياني -->
      <div class="chart-container">
        <h3 class="chart-title">نقطة التعادل</h3>
        <canvas id="breakEvenChart"></canvas>
      </div>

      <!-- يمين: الأرقام الرئيسية -->
      <div class="key-numbers">
        <h3 class="section-title">الأرقام الرئيسية</h3>

        <div class="number-card">
          <span class="number-icon">💰</span>
          <div class="number-content">
            <span class="number-label">تكلفة البداية</span>
            <span class="number-value">19,000 درهم</span>
          </div>
        </div>

        <div class="number-card">
          <span class="number-icon">⚖️</span>
          <div class="number-content">
            <span class="number-label">Break-even</span>
            <span class="number-value">شهر 5 — 7</span>
          </div>
        </div>

        <div class="number-card">
          <span class="number-icon">📋</span>
          <div class="number-content">
            <span class="number-label">يحتاج فقط</span>
            <span class="number-value">8 قضايا / شهر</span>
          </div>
        </div>

        <div class="number-card highlight-card">
          <span class="number-icon">🚀</span>
          <div class="number-content">
            <span class="number-label">إيراد السنة 3</span>
            <span class="number-value">2.4 مليون درهم</span>
          </div>
        </div>
      </div>

    </div>

    <!-- الرسم البياني السفلي -->
    <div class="chart-container full-width">
      <h3 class="chart-title">نمو الإيرادات المتوقع — 3 سنوات</h3>
      <canvas id="revenueChart"></canvas>
    </div>
  </div>
</div>

<!-- ==================== سلايد 10 — الميزة التنافسية ==================== -->
<div class="slide" id="slide-10">
  <div class="slide-header">
    <span class="slide-number">10</span>
    <h1 class="slide-title">لماذا إتمام... ولماذا الآن؟</h1>
    <p class="slide-subtitle">ميزة تنافسية لا تتكرر</p>
  </div>

  <div class="slide-body">
    <div class="grid-2">

      <!-- بطاقة الميزات -->
      <div class="advantage-card">
        <div class="card-header">
          <span class="card-icon">🏆</span>
          <h3>ميزات لا تُكرر</h3>
        </div>
        <ul class="advantage-list">
          <li>
            <span class="check-icon">✅</span>
            <div>
              <strong>شراكة محاكم الشارقة</strong>
              <p>وصول مباشر وحصري لإحالات المحاكم</p>
            </div>
          </li>
          <li>
            <span class="check-icon">✅</span>
            <div>
              <strong>مركز فيزيائي قائم</strong>
              <p>مقر إتمام جاهز — لا حاجة لاستثمار جديد</p>
            </div>
          </li>
          <li>
            <span class="check-icon">✅</span>
            <div>
              <strong>قاعدة بيانات جاهزة</strong>
              <p>آلاف العملاء الحاليين لإتمام وإنجازات</p>
            </div>
          </li>
          <li>
            <span class="check-icon">✅</span>
            <div>
              <strong>ثقة إنجازات</strong>
              <p>علامة تجارية موثوقة في الشارقة منذ سنوات</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- بطاقة المنافسة -->
      <div class="advantage-card competition-card">
        <div class="card-header">
          <span class="card-icon">🎯</span>
          <h3>المنافسة = صفر</h3>
        </div>
        <ul class="advantage-list">
          <li>
            <span class="zero-icon">0️⃣</span>
            <div>
              <strong>لا منصة محامين في الإمارات</strong>
              <p>السوق فارغ تماماً — لا منصة رقمية متخصصة</p>
            </div>
          </li>
          <li>
            <span class="zero-icon">❌</span>
            <div>
              <strong>أقرب منافس أغلق</strong>
              <p>المنصات السابقة فشلت — الفرصة مفتوحة</p>
            </div>
          </li>
          <li>
            <span class="zero-icon">🥇</span>
            <div>
              <strong>من يدخل أولاً يملك السوق</strong>
              <p>First-mover advantage — بناء الثقة والقاعدة قبل أي منافس</p>
            </div>
          </li>
        </ul>

        <div class="urgency-box">
          <span class="urgency-icon">⏰</span>
          <p><strong>النافذة مفتوحة الآن</strong> — كل يوم تأخير = فرصة لمنافس جديد</p>
        </div>
      </div>

    </div>
  </div>
</div>

<!-- ==================== سلايد 11 — خطة 30 يوم ==================== -->
<div class="slide" id="slide-11">
  <div class="slide-header">
    <span class="slide-number">11</span>
    <h1 class="slide-title">أول 30 يوم — خطة فورية</h1>
    <p class="slide-subtitle">من القرار إلى أول نتائج في شهر واحد</p>
  </div>

  <div class="slide-body">
    <div class="grid-2 action-grid">

      <!-- الأسبوع 1 -->
      <div class="week-card week-1">
        <div class="week-header">
          <span class="week-badge">الأسبوع 1</span>
          <span class="week-dates">اليوم 1 — 7</span>
        </div>
        <div class="week-icon">🤝</div>
        <h4>التأسيس</h4>
        <ul class="week-tasks">
          <li>اختيار 3 محامين متخصصين</li>
          <li>توقيع اتفاقيات التعاون</li>
          <li>تحديد التسعير والعمولات</li>
        </ul>
        <div class="week-output">
          <span class="output-label">المخرج:</span>
          <span>3 محامين جاهزين للعمل</span>
        </div>
      </div>

      <!-- الأسبوع 2 -->
      <div class="week-card week-2">
        <div class="week-header">
          <span class="week-badge">الأسبوع 2</span>
          <span class="week-dates">اليوم 8 — 14</span>
        </div>
        <div class="week-icon">📱</div>
        <h4>التواجد الرقمي</h4>
        <ul class="week-tasks">
          <li>إنشاء حساب انستجرام احترافي</li>
          <li>تصميم ونشر أول 10 منشورات</li>
          <li>إعداد الهوية البصرية</li>
        </ul>
        <div class="week-output">
          <span class="output-label">المخرج:</span>
          <span>حساب نشط بـ 10 منشورات</span>
        </div>
      </div>

      <!-- الأسبوع 3 -->
      <div class="week-card week-3">
        <div class="week-header">
          <span class="week-badge">الأسبوع 3</span>
          <span class="week-dates">اليوم 15 — 21</span>
        </div>
        <div class="week-icon">📣</div>
        <h4>الإعلان</h4>
        <ul class="week-tasks">
          <li>إطلاق أول حملة إعلانية</li>
          <li>ميزانية: 5,000 درهم</li>
          <li>استهداف الشارقة + عجمان</li>
        </ul>
        <div class="week-output">
          <span class="output-label">المخرج:</span>
          <span>أول استفسارات واردة</span>
        </div>
      </div>

      <!-- الأسبوع 4 -->
      <div class="week-card week-4">
        <div class="week-header">
          <span class="week-badge">الأسبوع 4</span>
          <span class="week-dates">اليوم 22 — 30</span>
        </div>
        <div class="week-icon">📊</div>
        <h4>القياس</h4>
        <ul class="week-tasks">
          <li>تحقيق أول 10 إحالات</li>
          <li>قياس النتائج والتكلفة</li>
          <li>تحسين وتعديل الاستراتيجية</li>
        </ul>
        <div class="week-output">
          <span class="output-label">المخرج:</span>
          <span>تقرير أداء + خطة الشهر 2</span>
        </div>
      </div>

    </div>

    <div class="action-cta">
      <span class="cta-icon">🚀</span>
      <p><strong>النتيجة بعد 30 يوم:</strong> 3 محامين + حساب نشط + أول عملاء + بيانات حقيقية للقرار</p>
    </div>
  </div>
</div>

<!-- ==================== سلايد 12 — بصمة PyramediaX ==================== -->
<div class="slide slide-pyramediax" id="slide-12">

  <div class="pyramediax-backdrop">
    <div class="backdrop-shape shape-1"></div>
    <div class="backdrop-shape shape-2"></div>
    <div class="backdrop-shape shape-3"></div>
  </div>

  <div class="slide-body pyramediax-center">

    <!-- الشعار الكبير -->
    <div class="pyramediax-brand">
      <div class="pyramediax-icon">△</div>
      <h1 class="pyramediax-logo">PyramediaX</h1>
      <p class="pyramediax-glow">شريككم الاستراتيجي في التسويق والذكاء الاصطناعي</p>
    </div>

    <!-- الزخرفة -->
    <div class="pyramediax-divider">
      <span class="divider-dot"></span>
      <span class="divider-line"></span>
      <span class="divider-dot"></span>
    </div>

    <!-- بطاقة الإعداد -->
    <div class="glass-card pyramediax-card">
      <p class="card-line card-main">تم إعداد هذه الدراسة بواسطة <strong>PyramediaX</strong></p>
      <p class="card-line card-client">لصالح <strong>إنجازات</strong> | <strong>إتمام</strong></p>
      <div class="card-divider"></div>
      <p class="card-line card-services">البحث &bull; الاستراتيجية &bull; التحليل المالي &bull; العرض التقديمي</p>
    </div>

    <!-- خدمات إضافية -->
    <div class="pyramediax-services">
      <div class="service-tag">🎯 تسويق رقمي</div>
      <div class="service-tag">🤖 ذكاء اصطناعي</div>
      <div class="service-tag">📊 تحليل بيانات</div>
      <div class="service-tag">🎨 هوية بصرية</div>
      <div class="service-tag">📱 تطوير تطبيقات</div>
    </div>

    <!-- التواصل -->
    <div class="pyramediax-contact">
      <span class="contact-item">🌐 pyramedia.info</span>
      <span class="contact-separator">|</span>
      <span class="contact-item">📸 @pyramediax</span>
    </div>

    <!-- السنة -->
    <div class="pyramediax-year">
      <p>© 2025 PyramediaX — جميع الحقوق محفوظة</p>
    </div>

  </div>
</div>


    </div>

    <script>
        // Slide Navigation
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');
        const totalSlides = slides.length;
        document.getElementById('totalSlides').textContent = totalSlides;

        function goToSlide(n) {
            slides.forEach(s => { s.classList.remove('active'); });
            currentSlide = Math.max(0, Math.min(n, totalSlides - 1));
            slides[currentSlide].classList.add('active');
            document.getElementById('currentSlide').textContent = currentSlide + 1;
            document.getElementById('progressBar').style.width = ((currentSlide + 1) / totalSlides * 100) + '%';
            // Trigger animations
            slides[currentSlide].querySelectorAll('.anim-up').forEach((el, i) => {
                setTimeout(() => el.classList.add('visible'), i * 100);
            });
            // Trigger counters
            slides[currentSlide].querySelectorAll('.counter').forEach(el => animateCounter(el));
            // Init charts
            if (typeof initCharts === 'function') initCharts(currentSlide);
        }

        function animateCounter(el) {
            if (el.dataset.animated === 'true') return;
            const target = parseFloat(el.dataset.target);
            const suffix = el.dataset.suffix || '';
            const prefix = el.dataset.prefix || '';
            const duration = 1500;
            const start = performance.now();
            el.dataset.animated = 'true';
            function update(now) {
                const progress = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = Math.round(target * eased * 10) / 10;
                el.textContent = prefix + (Number.isInteger(target) ? Math.round(target * eased) : current) + suffix;
                if (progress < 1) requestAnimationFrame(update);
            }
            requestAnimationFrame(update);
        }

        // Keyboard
        document.addEventListener('keydown', e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') goToSlide(currentSlide + 1);
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') goToSlide(currentSlide - 1);
        });

        // Buttons
        document.getElementById('nextBtn').addEventListener('click', () => goToSlide(currentSlide + 1));
        document.getElementById('prevBtn').addEventListener('click', () => goToSlide(currentSlide - 1));

        // Touch
        let touchStartX = 0;
        document.addEventListener('touchstart', e => touchStartX = e.touches[0].clientX);
        document.addEventListener('touchend', e => {
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) { diff > 0 ? goToSlide(currentSlide + 1) : goToSlide(currentSlide - 1); }
        });

        // Particles
        const canvas = document.getElementById('particles');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
        let particles = [];
        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2.5 + 0.5;
                this.speedX = (Math.random() - 0.5) * 0.8;
                this.speedY = (Math.random() - 0.5) * 0.8;
                this.color = `rgba(197, 165, 114, ${Math.random() * 0.25})`;
            }
            update() {
                this.x += this.speedX; this.y += this.speedY;
                if (this.x > canvas.width) this.x = 0; if (this.x < 0) this.x = canvas.width;
                if (this.y > canvas.height) this.y = 0; if (this.y < 0) this.y = canvas.height;
            }
            draw() { ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); }
        }
        for (let i = 0; i < 80; i++) particles.push(new Particle());
        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => { p.update(); p.draw(); });
            requestAnimationFrame(animateParticles);
        }
        animateParticles();

        // Charts
        let chartsInitialized = {};
        function initCharts(slideIdx) {
            if (chartsInitialized[slideIdx]) return;
            // Revenue chart on slide 8 (index 8)
            const revenueCanvas = slides[slideIdx]?.querySelector('#revenueChart');
            if (revenueCanvas) {
                chartsInitialized[slideIdx] = true;
                new Chart(revenueCanvas, {
                    type: 'bar',
                    data: {
                        labels: ['السنة 1', 'السنة 2', 'السنة 3'],
                        datasets: [{
                            label: 'الإيرادات (ألف درهم)',
                            data: [270, 960, 2400],
                            backgroundColor: ['rgba(197,165,114,0.6)', 'rgba(197,165,114,0.75)', 'rgba(197,165,114,0.9)'],
                            borderColor: 'rgba(197,165,114,1)', borderWidth: 1, borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { ticks: { color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                            x: { ticks: { color: '#a0a0b0' }, grid: { display: false } }
                        }
                    }
                });
            }
            // Break-even chart
            const breakCanvas = slides[slideIdx]?.querySelector('#breakEvenChart');
            if (breakCanvas) {
                chartsInitialized[slideIdx] = true;
                new Chart(breakCanvas, {
                    type: 'line',
                    data: {
                        labels: ['شهر 1', 'شهر 2', 'شهر 3', 'شهر 4', 'شهر 5', 'شهر 6', 'شهر 7', 'شهر 8', 'شهر 9', 'شهر 10', 'شهر 11', 'شهر 12'],
                        datasets: [
                            { label: 'الإيرادات', data: [5, 12, 18, 25, 35, 42, 55, 65, 78, 90, 105, 120], borderColor: '#4ecdc4', backgroundColor: 'rgba(78,205,196,0.1)', fill: true, tension: 0.4 },
                            { label: 'التكاليف', data: [19, 22, 25, 28, 30, 32, 34, 35, 36, 37, 38, 39], borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,0.1)', fill: true, tension: 0.4 }
                        ]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { labels: { color: '#a0a0b0' } } },
                        scales: {
                            y: { ticks: { color: '#a0a0b0', callback: v => v + 'K' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                            x: { ticks: { color: '#a0a0b0' }, grid: { display: false } }
                        }
                    }
                });
            }
        }

        // Init
        goToSlide(0);
    </script>
</body>
</html>
