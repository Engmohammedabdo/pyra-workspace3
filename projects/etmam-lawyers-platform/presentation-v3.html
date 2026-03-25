<?php
// Eitmam Lawyers Platform Presentation
// Built for Enjazat
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>منصة محامين إتمام | العرض التقديمي</title>
    
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
    
    <!-- Icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <!-- Chart.js -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

    <style>
        :root {
            --primary: #1B2838;
            --primary-dark: #0f1722;
            --gold: #C5A572;
            --gold-light: #e8d0a5;
            --white: #ffffff;
            --text-gray: #d1d5db;
            --glass-bg: rgba(255, 255, 255, 0.03);
            --glass-border: rgba(197, 165, 114, 0.2);
            --transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Cairo', sans-serif;
            background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
            color: var(--white);
            overflow: hidden;
            height: 100vh;
            width: 100vw;
        }

        h1, h2, h3, h4, .logo-text {
            font-family: 'Tajawal', sans-serif;
        }

        .gold-gradient {
            background: linear-gradient(45deg, var(--gold), var(--gold-light), var(--gold));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-size: 200% auto;
            animation: shine 3s linear infinite;
        }

        @keyframes shine {
            to { background-position: 200% center; }
        }

        /* Particles Background */
        #particles {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            pointer-events: none;
        }

        /* Progress Bar */
        .progress-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            z-index: 100;
        }
        .progress-bar {
            height: 100%;
            background: var(--gold);
            width: 0%;
            transition: width 0.3s ease;
            box-shadow: 0 0 10px var(--gold);
        }

        /* Slides Container */
        .slides-container {
            position: relative;
            width: 100%;
            height: 100%;
            z-index: 10;
        }

        .slide {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            padding: 4% 8%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            opacity: 0;
            visibility: hidden;
            transform: translateY(30px) scale(0.95);
            transition: opacity 0.6s ease, transform 0.6s ease, visibility 0.6s;
        }

        .slide.active {
            opacity: 1;
            visibility: visible;
            transform: translateY(0) scale(1);
        }

        /* Typography */
        .slide-title {
            font-size: 2.8rem;
            margin-bottom: 2rem;
            text-align: center;
            font-weight: 800;
            position: relative;
            padding-bottom: 15px;
        }
        .slide-title::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 100px;
            height: 3px;
            background: var(--gold);
            border-radius: 2px;
        }

        /* Glassmorphism Components */
        .glass-card {
            background: var(--glass-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--glass-border);
            border-radius: 20px;
            padding: 2rem;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
            transition: var(--transition);
        }
        .glass-card:hover {
            transform: translateY(-5px);
            border-color: var(--gold);
            box-shadow: 0 12px 40px 0 rgba(197, 165, 114, 0.15);
        }

        /* Grid Layouts */
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; width: 100%; }
        .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; width: 100%; }
        .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; width: 100%; }

        /* Specific Slide Styles */
        .logo-main {
            font-size: 6rem;
            font-weight: 800;
            margin-bottom: 1rem;
            letter-spacing: 2px;
        }
        .subtitle-main {
            font-size: 2rem;
            color: var(--text-gray);
            margin-bottom: 2rem;
        }
        
        .icon-box {
            font-size: 3rem;
            color: var(--gold);
            margin-bottom: 1rem;
            text-align: center;
        }

        .list-item {
            display: flex;
            align-items: flex-start;
            margin-bottom: 1.2rem;
            font-size: 1.2rem;
        }
        .list-item i {
            color: var(--gold);
            margin-top: 5px;
            margin-left: 15px;
            font-size: 1.2rem;
        }

        /* Roadmap */
        .timeline {
            display: flex;
            justify-content: space-between;
            position: relative;
            width: 100%;
            margin-top: 2rem;
        }
        .timeline::before {
            content: '';
            position: absolute;
            top: 30px;
            left: 0;
            right: 0;
            height: 2px;
            background: var(--glass-border);
            z-index: 1;
        }
        .timeline-item {
            position: relative;
            z-index: 2;
            text-align: center;
            width: 22%;
        }
        .timeline-dot {
            width: 60px;
            height: 60px;
            background: var(--primary);
            border: 2px solid var(--gold);
            border-radius: 50%;
            margin: 0 auto 1rem;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            color: var(--gold);
            box-shadow: 0 0 15px rgba(197, 165, 114, 0.3);
        }

        /* Stats & Counters */
        .stat-card { text-align: center; }
        .stat-number {
            font-size: 3.5rem;
            font-weight: 700;
            color: var(--gold);
            font-family: 'Tajawal', sans-serif;
            margin: 1rem 0;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 5px;
            direction: ltr;
        }
        .stat-label { font-size: 1.2rem; color: var(--text-gray); }

        /* Charts Container */
        .chart-container {
            width: 100%;
            height: 400px;
            position: relative;
        }

        /* Navigation Controls */
        .controls {
            position: fixed;
            bottom: 30px;
            left: 0;
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 5%;
            z-index: 100;
        }
        .nav-btn {
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            color: var(--gold);
            width: 50px;
            height: 50px;
            border-radius: 50%;
            font-size: 1.2rem;
            cursor: pointer;
            backdrop-filter: blur(5px);
            transition: var(--transition);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .nav-btn:hover {
            background: var(--gold);
            color: var(--primary);
            transform: scale(1.1);
        }
        .dots {
            display: flex;
            gap: 8px;
        }
        .dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.2);
            cursor: pointer;
            transition: var(--transition);
        }
        .dot.active {
            background: var(--gold);
            transform: scale(1.3);
            box-shadow: 0 0 10px var(--gold);
        }

        /* Animations for elements inside active slide */
        .slide.active .anim-up {
            animation: fadeInUp 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            opacity: 0;
            transform: translateY(20px);
        }
        .delay-1 { animation-delay: 0.2s !important; }
        .delay-2 { animation-delay: 0.4s !important; }
        .delay-3 { animation-delay: 0.6s !important; }
        .delay-4 { animation-delay: 0.8s !important; }

        @keyframes fadeInUp {
            to { opacity: 1; transform: translateY(0); }
        }

        /* Responsive */
        @media (max-width: 992px) {
            .grid-3, .grid-4 { grid-template-columns: 1fr 1fr; }
            .slide-title { font-size: 2.2rem; }
            .timeline { flex-direction: column; gap: 2rem; }
            .timeline::before { left: 30px; top: 0; height: 100%; width: 2px; }
            .timeline-item { width: 100%; display: flex; align-items: center; text-align: right; }
            .timeline-dot { margin: 0 0 0 1.5rem; }
        }
        @media (max-width: 768px) {
            .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
            .logo-main { font-size: 4rem; }
            .slide { padding: 15% 5% 20%; overflow-y: auto; display: block; }
            .slide.active { display: block; }
            .chart-container { height: 250px; }
            .controls { bottom: 15px; }
        }
    </style>
</head>
<body>

    <!-- Particles Background -->
    <canvas id="particles"></canvas>

    <!-- Progress Bar -->
    <div class="progress-container">
        <div class="progress-bar" id="progressBar"></div>
    </div>

    <!-- Slides -->
    <div class="slides-container" id="slidesContainer">

        <!-- Slide 1: Cover -->
        <div class="slide">
            <div class="logo-main gold-gradient anim-up">إتمام</div>
            <h2 class="subtitle-main anim-up delay-1">المنصة القانونية الأولى في الإمارات</h2>
            <div class="glass-card anim-up delay-2" style="max-width: 600px; text-align: center; margin-top: 2rem;">
                <h3 style="font-size: 1.8rem; margin-bottom: 1rem;"><i class="fa-solid fa-scale-balanced" style="color: var(--gold); margin-left: 10px;"></i>نربط العميل بالمحامي المناسب</h3>
                <p style="font-size: 1.2rem; color: var(--text-gray);">بالشراكة الاستراتيجية مع محاكم الشارقة</p>
            </div>
        </div>

        <!-- Slide 2: The Problem -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">المشكلة الحالية في السوق</h2>
            <div class="grid-3 anim-up delay-1">
                <div class="glass-card">
                    <div class="icon-box"><i class="fa-solid fa-user-injured"></i></div>
                    <h3 style="text-align: center; margin-bottom: 1rem; color: var(--gold);">معاناة العميل</h3>
                    <div class="list-item"><i class="fa-solid fa-xmark"></i> صعوبة إيجاد محامي متخصص وموثوق</div>
                    <div class="list-item"><i class="fa-solid fa-xmark"></i> ضبابية في التكاليف والأسعار</div>
                    <div class="list-item"><i class="fa-solid fa-xmark"></i> عدم القدرة على تقييم جودة المحامي مسبقاً</div>
                </div>
                <div class="glass-card">
                    <div class="icon-box"><i class="fa-solid fa-briefcase"></i></div>
                    <h3 style="text-align: center; margin-bottom: 1rem; color: var(--gold);">معاناة المحامي</h3>
                    <div class="list-item"><i class="fa-solid fa-xmark"></i> تكلفة عالية جداً لاكتساب عملاء جدد</div>
                    <div class="list-item"><i class="fa-solid fa-xmark"></i> منافسة غير عادلة مع المكاتب الكبرى</div>
                    <div class="list-item"><i class="fa-solid fa-xmark"></i> غياب منصة تسويق محلية متخصصة</div>
                </div>
                <div class="glass-card" style="display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
                    <div class="icon-box"><i class="fa-solid fa-chart-pie"></i></div>
                    <h3 style="margin-bottom: 1rem; color: var(--gold);">إحصائية صادمة</h3>
                    <div class="stat-number">1M+</div>
                    <p style="font-size: 1.1rem;">قضية سنوياً في الإمارات</p>
                    <div style="margin-top: 1rem; padding: 10px; background: rgba(255,0,0,0.1); border-radius: 10px; color: #ff6b6b;">
                        أقل من 10% من الخدمات القانونية مرقمنة!
                    </div>
                </div>
            </div>
        </div>

        <!-- Slide 3: The Opportunity -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">حجم الفرصة والفجوة</h2>
            <div class="grid-2 anim-up delay-1">
                <div class="glass-card">
                    <h3 style="color: var(--gold); margin-bottom: 1.5rem; font-size: 1.5rem;"><i class="fa-solid fa-earth-americas" style="margin-left: 10px;"></i>السوق الإماراتي</h3>
                    <div class="list-item"><i class="fa-solid fa-check"></i> <strong>حجم السوق:</strong> 2 إلى 3 مليار دولار سنوياً</div>
                    <div class="list-item"><i class="fa-solid fa-check"></i> <strong>المحامين:</strong> 8,000 إلى 11,000 محامي مرخص</div>
                    <div class="list-item"><i class="fa-solid fa-check"></i> <strong>الوضع الحالي:</strong> الاعتماد الكلي على WhatsApp و Word of Mouth</div>
                </div>
                <div class="glass-card" style="border-color: rgba(255,0,0,0.3);">
                    <h3 style="color: var(--gold); margin-bottom: 1.5rem; font-size: 1.5rem;"><i class="fa-solid fa-bolt" style="margin-left: 10px;"></i>فجوة المنافسة</h3>
                    <div class="list-item"><i class="fa-solid fa-exclamation-triangle" style="color: #ff6b6b;"></i> لا يوجد Legal Marketplace حقيقي وفعال في الإمارات</div>
                    <div class="list-item"><i class="fa-solid fa-exclamation-triangle" style="color: #ff6b6b;"></i> أقرب منافس (mohamie-uae.com) متوقف عن العمل!</div>
                    <div class="list-item"><i class="fa-solid fa-star" style="color: var(--gold);"></i> <strong>الفرصة:</strong> السيطرة على السوق كأول منصة متكاملة</div>
                </div>
            </div>
        </div>

        <!-- Slide 4: The Solution -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">الحل: كيف تعمل منصة إتمام؟</h2>
            <div class="grid-4 anim-up delay-1" style="margin-top: 2rem;">
                <div class="glass-card stat-card">
                    <div class="icon-box"><i class="fa-solid fa-comment-dots"></i></div>
                    <h3 style="color: var(--gold); margin-bottom: 10px;">1. الطلب</h3>
                    <p>العميل يصف مشكلته القانونية ببساطة عبر المنصة</p>
                </div>
                <div class="glass-card stat-card">
                    <div class="icon-box"><i class="fa-solid fa-microchip"></i></div>
                    <h3 style="color: var(--gold); margin-bottom: 10px;">2. التحليل</h3>
                    <p>الذكاء الاصطناعي يحلل الطلب ويحدد التخصص المطلوب</p>
                </div>
                <div class="glass-card stat-card">
                    <div class="icon-box"><i class="fa-solid fa-users-viewfinder"></i></div>
                    <h3 style="color: var(--gold); margin-bottom: 10px;">3. الترشيح</h3>
                    <p>عرض أفضل المحامين تقييماً مع أسعار واضحة وشفافة</p>
                </div>
                <div class="glass-card stat-card">
                    <div class="icon-box"><i class="fa-solid fa-handshake"></i></div>
                    <h3 style="color: var(--gold); margin-bottom: 10px;">4. التوكيل</h3>
                    <p>المحامي يحصل على عميل مؤهل بتكلفة أقل من إعلانات جوجل</p>
                </div>
            </div>
        </div>

        <!-- Slide 5: Why Eitmam? -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">لماذا إتمام؟ (الميزة التنافسية)</h2>
            <div class="grid-2 anim-up delay-1">
                <div class="glass-card" style="display: flex; align-items: center; gap: 20px;">
                    <div class="icon-box" style="margin: 0; font-size: 4rem;"><i class="fa-solid fa-building-columns"></i></div>
                    <div>
                        <h3 style="color: var(--gold); margin-bottom: 5px; font-size: 1.5rem;">شراكة مع محاكم الشارقة</h3>
                        <p>تمنحنا مصداقية فورية وثقة مطلقة من المحامين والعملاء (Unfair Advantage).</p>
                    </div>
                </div>
                <div class="glass-card" style="display: flex; align-items: center; gap: 20px;">
                    <div class="icon-box" style="margin: 0; font-size: 4rem;"><i class="fa-solid fa-store"></i></div>
                    <div>
                        <h3 style="color: var(--gold); margin-bottom: 5px; font-size: 1.5rem;">مركز خدمات فعلي</h3>
                        <p>لسنا مجرد موقع إلكتروني، بل كيان ملموس يقدم خدمات على أرض الواقع.</p>
                    </div>
                </div>
                <div class="glass-card" style="display: flex; align-items: center; gap: 20px;">
                    <div class="icon-box" style="margin: 0; font-size: 4rem;"><i class="fa-solid fa-database"></i></div>
                    <div>
                        <h3 style="color: var(--gold); margin-bottom: 5px; font-size: 1.5rem;">قاعدة بيانات جاهزة</h3>
                        <p>من خلال عملنا اليومي، نملك وصولاً مباشراً لشبكة واسعة من المحامين.</p>
                    </div>
                </div>
                <div class="glass-card" style="display: flex; align-items: center; gap: 20px;">
                    <div class="icon-box" style="margin: 0; font-size: 4rem;"><i class="fa-solid fa-shield-halved"></i></div>
                    <div>
                        <h3 style="color: var(--gold); margin-bottom: 5px; font-size: 1.5rem;">دعم شركة إنجازات</h3>
                        <p>ثقة مؤسسية، بنية تحتية قوية، وخبرة إدارية تضمن استدامة المشروع.</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Slide 6: Global Models -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">نماذج نجاح عالمية (Proof of Concept)</h2>
            <div class="grid-4 anim-up delay-1">
                <div class="glass-card stat-card">
                    <h3 style="font-size: 1.5rem; margin-bottom: 10px;">LegalZoom 🇺🇸</h3>
                    <div class="stat-number" style="font-size: 2.5rem;">$681M</div>
                    <p style="color: var(--gold);">إيرادات سنوية</p>
                    <p style="font-size: 0.9rem; margin-top: 10px;">أكثر من 5 مليون عميل</p>
                </div>
                <div class="glass-card stat-card">
                    <h3 style="font-size: 1.5rem; margin-bottom: 10px;">Avvo 🇺🇸</h3>
                    <div class="stat-number" style="font-size: 2.5rem;">$650M</div>
                    <p style="color: var(--gold);">التقييم السوقي</p>
                    <p style="font-size: 0.9rem; margin-top: 10px;">جمعوا 97% من المحامين من السجلات العامة</p>
                </div>
                <div class="glass-card stat-card">
                    <h3 style="font-size: 1.5rem; margin-bottom: 10px;">Rocket Lawyer</h3>
                    <div class="stat-number" style="font-size: 2.5rem;">5x</div>
                    <p style="color: var(--gold);">نمو في سنة واحدة</p>
                    <p style="font-size: 0.9rem; margin-top: 10px;">بفضل نموذج Freemium</p>
                </div>
                <div class="glass-card stat-card">
                    <h3 style="font-size: 1.5rem; margin-bottom: 10px;">LawRato 🇮🇳</h3>
                    <div class="stat-number" style="font-size: 2.5rem;"><i class="fa-solid fa-arrow-trend-up"></i></div>
                    <p style="color: var(--gold);">سوق ناشئ مشابه</p>
                    <p style="font-size: 0.9rem; margin-top: 10px;">نجاح باهر بنموذج "اسأل محامي مجاناً"</p>
                </div>
            </div>
            <div class="glass-card anim-up delay-2" style="margin-top: 2rem; width: 100%; text-align: center; background: rgba(197, 165, 114, 0.1);">
                <h3 style="color: var(--gold);"><i class="fa-solid fa-lightbulb"></i> الدرس المستفاد:</h3>
                <p style="font-size: 1.2rem;">ابدأ مجاناً للمحامين -> ابني قاعدة بيانات قوية -> حوّل المنصة لنظام الاشتراكات المتميزة.</p>
            </div>
        </div>

        <!-- Slide 7: Roadmap -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">خارطة الطريق (التنفيذ)</h2>
            <div class="timeline anim-up delay-1">
                <div class="timeline-item">
                    <div class="timeline-dot"><i class="fa-solid fa-seedling"></i></div>
                    <h3 style="color: var(--gold); margin-bottom: 10px;">المرحلة 0</h3>
                    <p style="color: var(--text-gray); font-size: 0.9rem; margin-bottom: 5px;">(شهر 1 - 3)</p>
                    <p><strong>الاستحواذ:</strong> مجاني 100%<br>الهدف: تسجيل 50 محامي</p>
                </div>
                <div class="timeline-item">
                    <div class="timeline-dot"><i class="fa-solid fa-rocket"></i></div>
                    <h3 style="color: var(--gold); margin-bottom: 10px;">المرحلة 1</h3>
                    <p style="color: var(--text-gray); font-size: 0.9rem; margin-bottom: 5px;">(شهر 4 - 6)</p>
                    <p><strong>الإطلاق:</strong> خدمات مميزة بـ 500 درهم<br>الهدف: 10 محامين يدفعون</p>
                </div>
                <div class="timeline-item">
                    <div class="timeline-dot"><i class="fa-solid fa-chart-line"></i></div>
                    <h3 style="color: var(--gold); margin-bottom: 10px;">المرحلة 2</h3>
                    <p style="color: var(--text-gray); font-size: 0.9rem; margin-bottom: 5px;">(شهر 7 - 12)</p>
                    <p><strong>التوسع:</strong> إطلاق 3 باقات اشتراك<br>الهدف: 40 محامي (نقطة التعادل)</p>
                </div>
                <div class="timeline-item">
                    <div class="timeline-dot"><i class="fa-solid fa-crown"></i></div>
                    <h3 style="color: var(--gold); margin-bottom: 10px;">المرحلة 3</h3>
                    <p style="color: var(--text-gray); font-size: 0.9rem; margin-bottom: 5px;">(السنة الثانية +)</p>
                    <p><strong>الربحية:</strong> 5 مصادر إيراد<br>الربح المستهدف: 58K درهم/شهر</p>
                </div>
            </div>
        </div>

        <!-- Slide 8: Revenue Model -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">نموذج الإيرادات والتكاليف</h2>
            <div class="glass-card anim-up delay-1" style="width: 100%; max-width: 900px;">
                <div class="chart-container">
                    <canvas id="revenueChart"></canvas>
                </div>
                <p style="text-align: center; margin-top: 15px; color: var(--gold); font-size: 1.2rem; font-weight: bold;">
                    نقطة التعادل (Break-even): الشهر 11 إلى 13
                </p>
            </div>
        </div>

        <!-- Slide 9: Unit Economics -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">اقتصاديات الوحدة (Unit Economics)</h2>
            <div class="grid-2 anim-up delay-1" style="align-items: center;">
                <div class="glass-card">
                    <div class="list-item" style="margin-bottom: 2rem;">
                        <div style="width: 100%;">
                            <h3 style="color: var(--gold); font-size: 1.5rem;">CAC (تكلفة اكتساب المحامي)</h3>
                            <div class="stat-number" style="font-size: 2.5rem; justify-content: flex-start; direction: rtl;">120 - 200 درهم</div>
                        </div>
                    </div>
                    <div class="list-item" style="margin-bottom: 2rem;">
                        <div style="width: 100%;">
                            <h3 style="color: var(--gold); font-size: 1.5rem;">LTV (قيمة المحامي للمنصة)</h3>
                            <div class="stat-number" style="font-size: 2.5rem; justify-content: flex-start; direction: rtl;">6,400 درهم</div>
                        </div>
                    </div>
                    <div class="list-item">
                        <div style="width: 100%; padding: 15px; background: rgba(197, 165, 114, 0.1); border-radius: 10px; border: 1px solid var(--gold);">
                            <h3 style="color: var(--white); font-size: 1.5rem; text-align: center;">نسبة LTV : CAC</h3>
                            <div class="stat-number" style="font-size: 3rem; color: #4ade80;">8 : 1</div>
                            <p style="text-align: center; color: var(--text-gray);">مؤشر ممتاز جداً لنمو صحي ومربح</p>
                        </div>
                    </div>
                </div>
                <div class="glass-card" style="display: flex; justify-content: center;">
                    <div class="chart-container" style="height: 350px; width: 350px;">
                        <canvas id="unitChart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <!-- Slide 10: Lawyer Acquisition -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">استراتيجية اكتساب المحامين</h2>
            <div class="grid-2 anim-up delay-1">
                <div class="glass-card">
                    <div class="icon-box"><i class="fa-solid fa-user-tie"></i></div>
                    <h3 style="text-align: center; color: var(--gold); margin-bottom: 1.5rem; font-size: 1.5rem;">أول 50 محامي (البداية)</h3>
                    <div class="list-item"><i class="fa-solid fa-check-circle"></i> زيارات ميدانية مباشرة للمكاتب</div>
                    <div class="list-item"><i class="fa-solid fa-check-circle"></i> استغلال علاقات مركز إتمام المباشرة</div>
                    <div class="list-item"><i class="fa-solid fa-check-circle"></i> تنظيم حدث إطلاق حصري للمحامين</div>
                    <div style="margin-top: 1.5rem; border-top: 1px solid var(--glass-border); padding-top: 1rem;">
                        <strong style="color: var(--gold);">الحوافز:</strong> شارة "عضو مؤسس"، أولوية ظهور دائمة، وباقة مجانية لـ 6 أشهر.
                    </div>
                </div>
                <div class="glass-card">
                    <div class="icon-box"><i class="fa-solid fa-users"></i></div>
                    <h3 style="text-align: center; color: var(--gold); margin-bottom: 1.5rem; font-size: 1.5rem;">من 50 إلى 200 محامي</h3>
                    <div class="list-item"><i class="fa-solid fa-check-circle"></i> برنامج الإحالات (محامي يدعو محامي)</div>
                    <div class="list-item"><i class="fa-solid fa-check-circle"></i> حملات استهداف عبر LinkedIn</div>
                    <div class="list-item"><i class="fa-solid fa-check-circle"></i> تحسين محركات البحث (SEO) B2B</div>
                    <div class="list-item"><i class="fa-solid fa-check-circle"></i> التسويق الشفهي (Word of Mouth) بعد إثبات النجاح</div>
                </div>
            </div>
        </div>

        <!-- Slide 11: Customer Acquisition -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">استراتيجية اكتساب العملاء</h2>
            <div class="grid-3 anim-up delay-1">
                <div class="glass-card">
                    <div class="icon-box"><i class="fa-brands fa-google"></i></div>
                    <h3 style="text-align: center; color: var(--gold); margin-bottom: 1rem;">SEO & Google Ads</h3>
                    <p style="text-align: center; color: var(--text-gray); margin-bottom: 1rem;">ميزانية ذكية (CPC: 8-25 درهم)</p>
                    <p>نشر محتوى قانوني مبسط يجيب على أسئلة الناس الشائعة لتصدر نتائج البحث مجاناً.</p>
                </div>
                <div class="glass-card">
                    <div class="icon-box"><i class="fa-solid fa-hashtag"></i></div>
                    <h3 style="text-align: center; color: var(--gold); margin-bottom: 1rem;">السوشيال ميديا</h3>
                    <p style="text-align: center; color: var(--text-gray); margin-bottom: 1rem;">فيديوهات قصيرة</p>
                    <p>سلسلة فيديوهات "اعرف حقوقك" لبناء الوعي وجذب الجمهور المستهدف للمنصة.</p>
                </div>
                <div class="glass-card">
                    <div class="icon-box"><i class="fa-solid fa-handshake-angle"></i></div>
                    <h3 style="text-align: center; color: var(--gold); margin-bottom: 1rem;">إحالات إتمام</h3>
                    <p style="text-align: center; color: var(--text-gray); margin-bottom: 1rem;">قناة مجانية 100%</p>
                    <p>تحويل عملاء مركز إتمام الحاليين الذين يحتاجون استشارات قانونية إلى المنصة، بالإضافة للشراكات الحكومية.</p>
                </div>
            </div>
        </div>

        <!-- Slide 12: Risks & Solutions -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">المخاطر والحلول</h2>
            <div class="grid-3 anim-up delay-1" style="gap: 1rem;">
                <div class="glass-card" style="padding: 1.5rem;">
                    <h4 style="color: #ff6b6b; margin-bottom: 10px;"><i class="fa-solid fa-triangle-exclamation"></i> المحامين لا يسجلون</h4>
                    <p style="font-size: 0.9rem;"><strong style="color: var(--gold);">الحل:</strong> زيارات ميدانية، تسجيل فوري نيابة عنهم، والبدء مجاناً.</p>
                </div>
                <div class="glass-card" style="padding: 1.5rem;">
                    <h4 style="color: #ff6b6b; margin-bottom: 10px;"><i class="fa-solid fa-triangle-exclamation"></i> ترافيك ضعيف للمنصة</h4>
                    <p style="font-size: 0.9rem;"><strong style="color: var(--gold);">الحل:</strong> تكثيف الـ SEO، واستغلال إحالات مركز إتمام الفورية.</p>
                </div>
                <div class="glass-card" style="padding: 1.5rem;">
                    <h4 style="color: #ff6b6b; margin-bottom: 10px;"><i class="fa-solid fa-triangle-exclamation"></i> تسرب خارج المنصة</h4>
                    <p style="font-size: 0.9rem;"><strong style="color: var(--gold);">الحل:</strong> نموذج العمل يعتمد على الاشتراكات (SaaS) وليس العمولات.</p>
                </div>
                <div class="glass-card" style="padding: 1.5rem;">
                    <h4 style="color: #ff6b6b; margin-bottom: 10px;"><i class="fa-solid fa-triangle-exclamation"></i> دخول منافس جديد</h4>
                    <p style="font-size: 0.9rem;"><strong style="color: var(--gold);">الحل:</strong> شراكة محاكم الشارقة تشكل خندقاً دفاعياً (Moat) يصعب اختراقه.</p>
                </div>
                <div class="glass-card" style="padding: 1.5rem;">
                    <h4 style="color: #ff6b6b; margin-bottom: 10px;"><i class="fa-solid fa-triangle-exclamation"></i> تغييرات تنظيمية</h4>
                    <p style="font-size: 0.9rem;"><strong style="color: var(--gold);">الحل:</strong> علاقة مستمرة وقوية مع الجهات الحكومية للتكيف السريع.</p>
                </div>
            </div>
        </div>

        <!-- Slide 13: Summary Numbers -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">الأرقام باختصار</h2>
            <div class="grid-2 anim-up delay-1" style="gap: 3rem; margin-top: 2rem;">
                <div class="glass-card stat-card">
                    <div class="icon-box"><i class="fa-solid fa-coins"></i></div>
                    <div class="stat-number"><span class="counter" data-target="270">0</span>K</div>
                    <p class="stat-label">إجمالي الاستثمار (السنة الأولى)</p>
                </div>
                <div class="glass-card stat-card">
                    <div class="icon-box"><i class="fa-solid fa-sack-dollar"></i></div>
                    <div class="stat-number"><span class="counter" data-target="696">0</span>K</div>
                    <p class="stat-label">الربح الصافي (السنة الثانية)</p>
                </div>
                <div class="glass-card stat-card">
                    <div class="icon-box"><i class="fa-solid fa-calendar-check"></i></div>
                    <div class="stat-number" style="direction: rtl;">شهر <span class="counter" data-target="11">0</span></div>
                    <p class="stat-label">الوصول لنقطة التعادل</p>
                </div>
                <div class="glass-card stat-card">
                    <div class="icon-box"><i class="fa-solid fa-arrow-up-right-dots"></i></div>
                    <div class="stat-number"><span class="counter" data-target="258">0</span>%</div>
                    <p class="stat-label">العائد على الاستثمار (ROI)</p>
                </div>
            </div>
        </div>

        <!-- Slide 14: Next Steps -->
        <div class="slide">
            <h2 class="slide-title gold-gradient anim-up">الخطوات التالية (Call to Action)</h2>
            <div class="glass-card anim-up delay-1" style="max-width: 800px; width: 100%;">
                <div class="list-item" style="font-size: 1.5rem; margin-bottom: 1.5rem;">
                    <i class="fa-solid fa-1" style="color: var(--gold); font-size: 2rem;"></i> 
                    <span style="margin-right: 20px;">اعتماد خطة العمل والميزانية</span>
                </div>
                <div class="list-item" style="font-size: 1.5rem; margin-bottom: 1.5rem;">
                    <i class="fa-solid fa-2" style="color: var(--gold); font-size: 2rem;"></i> 
                    <span style="margin-right: 20px;">البدء الفوري بتطوير المنصة (MVP)</span>
                </div>
                <div class="list-item" style="font-size: 1.5rem; margin-bottom: 1.5rem;">
                    <i class="fa-solid fa-3" style="color: var(--gold); font-size: 2rem;"></i> 
                    <span style="margin-right: 20px;">تجهيز قائمة أول 200 محامي مستهدف</span>
                </div>
                <div class="list-item" style="font-size: 1.5rem; margin-bottom: 1.5rem;">
                    <i class="fa-solid fa-4" style="color: var(--gold); font-size: 2rem;"></i> 
                    <span style="margin-right: 20px;">إطلاق حملة الـ SEO مبكراً</span>
                </div>
                <div class="list-item" style="font-size: 1.5rem;">
                    <i class="fa-solid fa-5" style="color: var(--gold); font-size: 2rem;"></i> 
                    <span style="margin-right: 20px;">تحديد موعد حدث الإطلاق (الأسبوع 6-8)</span>
                </div>
            </div>
        </div>

        <!-- Slide 15: Thank You -->
        <div class="slide">
            <div class="anim-up" style="text-align: center;">
                <div class="logo-main gold-gradient" style="font-size: 5rem;">إتمام</div>
                <h2 style="font-size: 2rem; margin-bottom: 3rem; font-weight: 300;">لأن كل شخص يستحق محامي مناسب</h2>
                
                <div class="glass-card" style="display: inline-block; padding: 2rem 4rem; margin-bottom: 3rem;">
                    <h3 style="color: var(--gold); margin-bottom: 1rem; font-size: 2rem;">شكراً لوقتكم</h3>
                    <p style="font-size: 1.2rem; margin-bottom: 10px;"><i class="fa-solid fa-envelope" style="margin-left: 10px; color: var(--gold);"></i> info@eitmam.ae</p>
                    <p style="font-size: 1.2rem;"><i class="fa-solid fa-phone" style="margin-left: 10px; color: var(--gold);"></i> +971 50 000 0000</p>
                </div>

                <div style="display: flex; justify-content: center; align-items: center; gap: 40px; border-top: 1px solid var(--glass-border); padding-top: 2rem;">
                    <h3 style="font-family: 'Tajawal'; font-size: 1.5rem; color: var(--text-gray);">إنجازات <span style="color: var(--gold);">|</span> ENJAZAT</h3>
                    <h3 style="font-family: 'Tajawal'; font-size: 1.5rem; color: var(--text-gray);">إتمام <span style="color: var(--gold);">|</span> EITMAM</h3>
                </div>
            </div>
        </div>

    </div>

    <!-- Navigation Controls -->
    <div class="controls">
        <button class="nav-btn" id="nextBtn" title="التالي"><i class="fa-solid fa-chevron-right"></i></button>
        <div class="dots" id="dotsContainer"></div>
        <button class="nav-btn" id="prevBtn" title="السابق"><i class="fa-solid fa-chevron-left"></i></button>
    </div>

    <script>
        // Presentation Logic
        const slides = document.querySelectorAll('.slide');
        const totalSlides = slides.length;
        let currentSlide = 0;
        
        const nextBtn = document.getElementById('nextBtn');
        const prevBtn = document.getElementById('prevBtn');
        const dotsContainer = document.getElementById('dotsContainer');
        const progressBar = document.getElementById('progressBar');

        // Create Dots
        for (let i = 0; i < totalSlides; i++) {
            const dot = document.createElement('div');
            dot.classList.add('dot');
            dot.addEventListener('click', () => goToSlide(i));
            dotsContainer.appendChild(dot);
        }
        const dots = document.querySelectorAll('.dot');

        function updateProgress() {
            const progress = ((currentSlide) / (totalSlides - 1)) * 100;
            progressBar.style.width = `${progress}%`;
        }

        function goToSlide(index) {
            if (index < 0 || index >= totalSlides) return;
            
            slides[currentSlide].classList.remove('active');
            dots[currentSlide].classList.remove('active');
            
            currentSlide = index;
            
            slides[currentSlide].classList.add('active');
            dots[currentSlide].classList.add('active');
            
            updateProgress();
            checkAnimations();
            initCharts();
        }

        nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));
        prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));

        // Keyboard Navigation (RTL logic: Right arrow goes to Prev, Left goes to Next)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') goToSlide(currentSlide + 1);
            if (e.key === 'ArrowRight') goToSlide(currentSlide - 1);
        });

        // Swipe Navigation
        let touchStartX = 0;
        let touchEndX = 0;
        document.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; });
        document.addEventListener('touchend', e => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        });

        function handleSwipe() {
            if (touchEndX < touchStartX - 50) goToSlide(currentSlide + 1); // Swipe left
            if (touchEndX > touchStartX + 50) goToSlide(currentSlide - 1); // Swipe right
        }

        // Animated Counters
        function checkAnimations() {
            if (currentSlide === 12) { // Slide 13 (index 12)
                const counters = document.querySelectorAll('.counter');
                counters.forEach(counter => {
                    counter.innerText = '0';
                    const target = +counter.getAttribute('data-target');
                    const duration = 2000;
                    const step = target / (duration / 16);
                    let current = 0;
                    
                    const updateCounter = () => {
                        current += step;
                        if (current < target) {
                            counter.innerText = Math.ceil(current);
                            requestAnimationFrame(updateCounter);
                        } else {
                            counter.innerText = target;
                        }
                    };
                    updateCounter();
                });
            }
        }

        // Charts Logic
        let revChartInit = false;
        let unitChartInit = false;

        function initCharts() {
            Chart.defaults.color = '#d1d5db';
            Chart.defaults.font.family = "'Cairo', sans-serif";

            // Revenue Chart (Slide 8 - index 7)
            if (currentSlide === 7 && !revChartInit) {
                const ctxRev = document.getElementById('revenueChart').getContext('2d');
                new Chart(ctxRev, {
                    type: 'bar',
                    data: {
                        labels: ['المرحلة 0', 'المرحلة 1', 'المرحلة 2', 'السنة الثانية'],
                        datasets: [
                            {
                                label: 'الإيرادات (بالدرهم)',
                                data: [0, 28500, 258000, 1836000],
                                backgroundColor: '#C5A572',
                                borderRadius: 5
                            },
                            {
                                label: 'التكاليف (بالدرهم)',
                                data: [76500, 83400, 273000, 1140000],
                                backgroundColor: 'rgba(255, 107, 107, 0.8)',
                                borderRadius: 5
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top', labels: { font: { size: 14 } } }
                        },
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
                            x: { grid: { display: false } }
                        },
                        animation: { duration: 2000, easing: 'easeOutQuart' }
                    }
                });
                revChartInit = true;
            }

            // Unit Economics Chart (Slide 9 - index 8)
            if (currentSlide === 8 && !unitChartInit) {
                const ctxUnit = document.getElementById('unitChart').getContext('2d');
                new Chart(ctxUnit, {
                    type: 'doughnut',
                    data: {
                        labels: ['LTV (قيمة العميل)', 'CAC (تكلفة الاكتساب)'],
                        datasets: [{
                            data: [6400, 160], // 160 is avg of 120-200
                            backgroundColor: ['#C5A572', '#ff6b6b'],
                            borderWidth: 0,
                            hoverOffset: 10
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'bottom', labels: { font: { size: 14 } } }
                        },
                        animation: { animateScale: true, animateRotate: true, duration: 2000 }
                    }
                });
                unitChartInit = true;
            }
        }

        // Particles Background Logic
        const canvas = document.getElementById('particles');
        const ctx = canvas.getContext('2d');
        let particlesArray = [];

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 3 + 1;
                this.speedX = Math.random() * 1 - 0.5;
                this.speedY = Math.random() * 1 - 0.5;
                this.color = `rgba(197, 165, 114, ${Math.random() * 0.3})`;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                if (this.x > canvas.width) this.x = 0;
                if (this.x < 0) this.x = canvas.width;
                if (this.y > canvas.height) this.y = 0;
                if (this.y < 0) this.y = canvas.height;
            }
            draw() {
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function initParticles() {
            particlesArray = [];
            for (let i = 0; i < 70; i++) {
                particlesArray.push(new Particle());
            }
        }

        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < particlesArray.length; i++) {
                particlesArray[i].update();
                particlesArray[i].draw();
            }
            requestAnimationFrame(animateParticles);
        }

        // Initialize Everything
        initParticles();
        animateParticles();
        goToSlide(0);

    </script>
</body>
</html>
