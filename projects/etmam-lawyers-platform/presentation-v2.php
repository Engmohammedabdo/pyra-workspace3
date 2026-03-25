<?php
// إعداد ترويسة الصفحة
header('Content-Type: text/html; charset=utf-8');
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
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
    
    <!-- Icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

    <style>
        :root {
            --navy: #003866;
            --gold: #b89a77;
            --terracotta: #b35434;
            --warm-gray: #e6dfd7;
            --dark-bg: #031b33;
            --glass-bg: rgba(255, 255, 255, 0.03);
            --glass-border: rgba(255, 255, 255, 0.1);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            scroll-behavior: smooth;
        }

        body {
            font-family: 'Tajawal', sans-serif;
            background-color: var(--dark-bg);
            color: #fff;
            line-height: 1.6;
            overflow-x: hidden;
        }

        h1, h2, h3, h4, h5, h6 {
            font-family: 'Cairo', sans-serif;
        }

        /* Progress Bar */
        #progress-bar {
            position: fixed;
            top: 0;
            left: 0;
            height: 4px;
            background: linear-gradient(to right, var(--gold), var(--terracotta));
            width: 0%;
            z-index: 9999;
            transition: width 0.2s ease;
        }

        /* Navbar */
        .navbar {
            position: fixed;
            top: 0;
            width: 100%;
            background: rgba(3, 27, 51, 0.85);
            backdrop-filter: blur(15px);
            z-index: 1000;
            padding: 15px 50px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--glass-border);
        }

        .navbar-brand {
            font-family: 'Cairo', sans-serif;
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--gold);
            text-decoration: none;
        }

        .nav-links {
            display: flex;
            gap: 20px;
        }

        .nav-links a {
            color: var(--warm-gray);
            text-decoration: none;
            font-size: 0.9rem;
            transition: color 0.3s;
        }

        .nav-links a:hover, .nav-links a.active {
            color: var(--gold);
        }

        /* Glassmorphism Classes */
        .glass-card {
            background: var(--glass-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--glass-border);
            border-radius: 16px;
            padding: 30px;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .glass-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            border-color: rgba(184, 154, 119, 0.3);
        }

        /* Layout */
        section {
            padding: 100px 10vw;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            position: relative;
        }

        .section-title {
            text-align: center;
            font-size: 2.5rem;
            color: var(--gold);
            margin-bottom: 50px;
            position: relative;
        }

        .section-title::after {
            content: '';
            position: absolute;
            bottom: -15px;
            left: 50%;
            transform: translateX(-50%);
            width: 80px;
            height: 3px;
            background: var(--terracotta);
            border-radius: 2px;
        }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; }
        .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }

        /* Hero Section */
        #hero {
            position: relative;
            overflow: hidden;
            text-align: center;
            padding-top: 150px;
        }

        #particles-js {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            z-index: -1;
            opacity: 0.5;
        }

        .hero-title {
            font-size: 4rem;
            font-weight: 800;
            background: linear-gradient(45deg, #fff, var(--warm-gray));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
        }

        .hero-subtitle {
            font-size: 1.8rem;
            color: var(--gold);
            margin-bottom: 60px;
            font-family: 'Cairo', sans-serif;
        }

        .stats-container {
            display: flex;
            justify-content: center;
            gap: 30px;
            flex-wrap: wrap;
        }

        .stat-box {
            text-align: center;
            min-width: 250px;
        }

        .stat-number {
            font-size: 3.5rem;
            font-weight: 700;
            color: var(--gold);
            font-family: 'Cairo', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            direction: ltr;
        }

        /* Solution Flow */
        .flow-diagram {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--glass-bg);
            padding: 40px;
            border-radius: 20px;
            border: 1px solid var(--glass-border);
        }

        .flow-step {
            text-align: center;
            flex: 1;
        }

        .flow-step i {
            font-size: 3rem;
            color: var(--gold);
            margin-bottom: 15px;
        }

        .flow-arrow {
            font-size: 2rem;
            color: var(--terracotta);
            animation: pulseArrow 2s infinite;
        }

        @keyframes pulseArrow {
            0% { transform: translateX(0); opacity: 0.5; }
            50% { transform: translateX(-10px); opacity: 1; }
            100% { transform: translateX(0); opacity: 0.5; }
        }

        /* CSS Charts */
        .chart-container {
            margin-top: 30px;
        }

        .bar-chart {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .bar-row {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .bar-label { width: 120px; font-weight: bold; }
        
        .bar-track {
            flex: 1;
            height: 30px;
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            overflow: hidden;
            position: relative;
        }

        .bar-fill {
            height: 100%;
            background: linear-gradient(to left, var(--gold), var(--terracotta));
            border-radius: 15px;
            display: flex;
            align-items: center;
            padding-right: 15px;
            font-weight: bold;
            width: 0; /* Animated via JS */
            transition: width 1.5s ease-out;
        }

        /* Table */
        .glass-table-wrapper {
            overflow-x: auto;
        }
        .glass-table {
            width: 100%;
            border-collapse: collapse;
            text-align: center;
        }

        .glass-table th, .glass-table td {
            padding: 20px;
            border-bottom: 1px solid var(--glass-border);
        }

        .glass-table th {
            background: rgba(184, 154, 119, 0.1);
            color: var(--gold);
            font-family: 'Cairo', sans-serif;
            font-size: 1.2rem;
        }

        .glass-table tr.highlight {
            background: rgba(184, 154, 119, 0.15);
            border: 2px solid var(--gold);
        }

        /* Timeline */
        .timeline {
            position: relative;
            max-width: 800px;
            margin: 0 auto;
        }

        .timeline::before {
            content: '';
            position: absolute;
            top: 0;
            right: 50%;
            width: 2px;
            height: 100%;
            background: var(--glass-border);
        }

        .timeline-item {
            position: relative;
            width: 50%;
            padding: 20px 40px;
            box-sizing: border-box;
        }

        .timeline-item:nth-child(odd) { right: 0; text-align: left; }
        .timeline-item:nth-child(even) { right: 50%; text-align: right; }

        .timeline-dot {
            position: absolute;
            top: 30px;
            width: 20px;
            height: 20px;
            background: var(--gold);
            border-radius: 50%;
            box-shadow: 0 0 10px var(--gold);
        }

        .timeline-item:nth-child(odd) .timeline-dot { left: -10px; }
        .timeline-item:nth-child(even) .timeline-dot { right: -10px; }

        /* Accordion */
        .accordion-item {
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            border-radius: 10px;
            margin-bottom: 15px;
            overflow: hidden;
        }

        .accordion-header {
            padding: 20px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: bold;
            font-size: 1.1rem;
            color: var(--gold);
        }

        .accordion-content {
            padding: 0 20px;
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease, padding 0.3s ease;
            background: rgba(0,0,0,0.2);
        }

        .accordion-item.active .accordion-content {
            padding: 20px;
            max-height: 200px;
        }

        /* Donut Chart */
        .donut-wrapper {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 50px;
        }
        .donut-chart {
            width: 200px;
            height: 200px;
            border-radius: 50%;
            background: conic-gradient(
                var(--gold) 0% 45%, 
                var(--terracotta) 45% 75%, 
                #4CAF50 75% 90%, 
                var(--navy) 90% 100%
            );
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .donut-inner {
            width: 140px;
            height: 140px;
            background: var(--dark-bg);
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
        }
        .donut-legend ul { list-style: none; }
        .donut-legend li { margin-bottom: 10px; display: flex; align-items: center; gap: 10px;}
        .legend-color { width: 15px; height: 15px; border-radius: 3px; }

        /* Animations */
        .fade-in-up {
            opacity: 0;
            transform: translateY(40px);
            transition: opacity 0.8s ease, transform 0.8s ease;
        }
        .fade-in-up.visible {
            opacity: 1;
            transform: translateY(0);
        }

        /* CTA */
        .cta-btn {
            display: inline-block;
            padding: 15px 40px;
            background: linear-gradient(45deg, var(--gold), var(--terracotta));
            color: #fff;
            text-decoration: none;
            font-size: 1.2rem;
            font-weight: bold;
            border-radius: 30px;
            border: none;
            cursor: pointer;
            transition: transform 0.3s, box-shadow 0.3s;
            font-family: 'Cairo', sans-serif;
        }
        .cta-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 10px 20px rgba(184, 154, 119, 0.4);
        }

        /* Responsive */
        @media (max-width: 992px) {
            .grid-3, .grid-4 { grid-template-columns: 1fr 1fr; }
            .flow-diagram { flex-direction: column; gap: 20px; }
            .flow-arrow { transform: rotate(90deg); }
            @keyframes pulseArrow {
                0% { transform: rotate(90deg) translateY(0); opacity: 0.5; }
                50% { transform: rotate(90deg) translateY(-10px); opacity: 1; }
                100% { transform: rotate(90deg) translateY(0); opacity: 0.5; }
            }
            .timeline::before { right: 20px; }
            .timeline-item { width: 100%; padding-right: 50px !important; text-align: right !important; right: 0 !important; }
            .timeline-dot { right: 10px !important; left: auto !important; }
        }
        @media (max-width: 768px) {
            .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
            .navbar { padding: 15px 20px; flex-direction: column; gap: 10px; }
            .nav-links { display: none; } /* Can be toggled with JS in full version */
            .hero-title { font-size: 2.5rem; }
            section { padding: 80px 5vw; }
            .donut-wrapper { flex-direction: column; }
        }
    </style>
</head>
<body>

    <div id="progress-bar"></div>

    <nav class="navbar">
        <a href="#hero" class="navbar-brand">إتمام <span style="color: #fff;">للمحامين</span></a>
        <div class="nav-links">
            <a href="#problem">المشكلة والحل</a>
            <a href="#market">السوق</a>
            <a href="#competitors">المنافسة</a>
            <a href="#revenue">نموذج العمل</a>
            <a href="#strategy">الاستراتيجية</a>
            <a href="#objections">الأسئلة</a>
            <a href="#kpis">المؤشرات</a>
        </div>
    </nav>

    <!-- 1. Hero Section -->
    <section id="hero">
        <canvas id="particles-js"></canvas>
        <div class="fade-in-up">
            <h1 class="hero-title">منصة محامين إتمام</h1>
            <h2 class="hero-subtitle">تحويل المنافسة إلى شراكة استراتيجية</h2>
            
            <div class="stats-container">
                <div class="glass-card stat-box">
                    <div class="stat-number" data-target="5.0" data-suffix="B">0</div>
                    <p>حجم السوق (دولار)</p>
                </div>
                <div class="glass-card stat-box">
                    <div class="stat-number" data-target="1710" data-suffix="">0</div>
                    <p>محامي مرخص بالإمارات</p>
                </div>
                <div class="glass-card stat-box">
                    <div class="stat-number" data-target="0" data-suffix="">-</div>
                    <p>منافسين حقيقيين</p>
                </div>
            </div>
        </div>
    </section>

    <!-- 2 & 3. Problem & Solution -->
    <section id="problem">
        <h2 class="section-title fade-in-up">الفجوة في السوق</h2>
        <div class="grid-3 fade-in-up">
            <div class="glass-card text-center">
                <i class="fas fa-hand-paper fa-3x" style="color: var(--terracotta); margin-bottom: 20px;"></i>
                <h3 style="color: var(--gold); margin-bottom: 10px;">نظرة المنافسة</h3>
                <p>المحامون ينظرون إلى إتمام كمنافس يأخذ حصتهم من السوق بدلاً من شريك.</p>
            </div>
            <div class="glass-card text-center">
                <i class="fas fa-bridge-water fa-3x" style="color: var(--warm-gray); margin-bottom: 20px;"></i>
                <h3 style="color: var(--gold); margin-bottom: 10px;">لا يوجد جسر</h3>
                <p>انعدام الربط التقني الموثوق بين الخدمات القضائية والاستشارات القانونية الخاصة.</p>
            </div>
            <div class="glass-card text-center">
                <i class="fas fa-search fa-3x" style="color: var(--terracotta); margin-bottom: 20px;"></i>
                <h3 style="color: var(--gold); margin-bottom: 10px;">حيرة العميل</h3>
                <p>العميل يواجه صعوبة في إيجاد محامي موثوق، مقيّم، ومناسب لقضيته وميزانيته.</p>
            </div>
        </div>

        <h2 class="section-title fade-in-up" style="margin-top: 80px;">الحـــل: المنصة كجسر</h2>
        <div class="flow-diagram fade-in-up">
            <div class="flow-step">
                <i class="fas fa-building"></i>
                <h3>إتمام</h3>
                <p style="font-size: 0.9rem; color: var(--warm-gray);">خدمات قضائية</p>
            </div>
            <i class="fas fa-chevron-left flow-arrow"></i>
            <div class="flow-step" style="transform: scale(1.1);">
                <i class="fas fa-laptop-code" style="color: #fff;"></i>
                <h3 style="color: var(--gold);">المنصة</h3>
                <p style="font-size: 0.9rem; color: var(--warm-gray);">AI Matching</p>
            </div>
            <i class="fas fa-chevron-left flow-arrow"></i>
            <div class="flow-step">
                <i class="fas fa-balance-scale"></i>
                <h3>المحامين</h3>
                <p style="font-size: 0.9rem; color: var(--warm-gray);">استشارات وتمثيل</p>
            </div>
            <i class="fas fa-chevron-left flow-arrow"></i>
            <div class="flow-step">
                <i class="fas fa-users"></i>
                <h3>العملاء</h3>
                <p style="font-size: 0.9rem; color: var(--warm-gray);">حلول متكاملة</p>
            </div>
        </div>
    </section>

    <!-- 4. Market Size -->
    <section id="market">
        <h2 class="section-title fade-in-up">حجم السوق (الإمارات)</h2>
        <div class="grid-2 fade-in-up">
            <div class="glass-card">
                <h3 style="color: var(--gold); margin-bottom: 20px;">نمو الخدمات القانونية</h3>
                <div class="bar-chart">
                    <div class="bar-row">
                        <div class="bar-label">2024</div>
                        <div class="bar-track">
                            <div class="bar-fill" data-width="65%">$5.0 مليار</div>
                        </div>
                    </div>
                    <div class="bar-row">
                        <div class="bar-label">2030 (متوقع)</div>
                        <div class="bar-track">
                            <div class="bar-fill" data-width="100%">$7.6 مليار (نمو 6.2%)</div>
                        </div>
                    </div>
                </div>
                
                <h3 style="color: var(--gold); margin-bottom: 20px; margin-top: 40px;">سوق التكنولوجيا القانونية (Legal Tech)</h3>
                <div class="bar-chart">
                    <div class="bar-row">
                        <div class="bar-label">2024</div>
                        <div class="bar-track">
                            <div class="bar-fill" style="background: linear-gradient(to left, #4CAF50, #2E7D32);" data-width="52%">$234.6 مليون</div>
                        </div>
                    </div>
                    <div class="bar-row">
                        <div class="bar-label">2030 (متوقع)</div>
                        <div class="bar-track">
                            <div class="bar-fill" style="background: linear-gradient(to left, #4CAF50, #2E7D32);" data-width="100%">$449.3 مليون (نمو 12%)</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="grid-2" style="gap: 20px;">
                <div class="glass-card text-center" style="display: flex; flex-direction: column; justify-content: center;">
                    <i class="fas fa-user-tie fa-3x" style="color: var(--gold); margin-bottom: 15px;"></i>
                    <div class="stat-number" data-target="1710" data-suffix="" style="font-size: 2.5rem;">0</div>
                    <p>محامي مرخص (وزارة العدل)</p>
                </div>
                <div class="glass-card text-center" style="display: flex; flex-direction: column; justify-content: center;">
                    <i class="fas fa-city fa-3x" style="color: var(--gold); margin-bottom: 15px;"></i>
                    <div class="stat-number" data-target="1517" data-suffix="" style="font-size: 2.5rem;">0</div>
                    <p>محامي مسجل في دبي</p>
                </div>
                <div class="glass-card text-center" style="grid-column: span 2;">
                    <i class="fas fa-briefcase fa-2x" style="color: var(--terracotta); margin-bottom: 10px;"></i>
                    <h3 style="color: #fff;">42</h3>
                    <p>مكتب محاماة جديد تم افتتاحه في 2024</p>
                </div>
            </div>
        </div>
    </section>

    <!-- 5. Competitors -->
    <section id="competitors">
        <h2 class="section-title fade-in-up">تحليل المنافسين: لا منافس حقيقي</h2>
        <div class="glass-table-wrapper fade-in-up">
            <table class="glass-table">
                <thead>
                    <tr>
                        <th>المنصة</th>
                        <th>AI Matching</th>
                        <th>محتوى فيديو</th>
                        <th>تقييمات حقيقية</th>
                        <th>عربي أصلي</th>
                        <th>نظام حجز ودفع</th>
                        <th>ملاحظات</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>legalmarketplace.ae</td>
                        <td>❌</td>
                        <td>❌</td>
                        <td>❌</td>
                        <td>❌</td>
                        <td>❌</td>
                        <td style="color: var(--terracotta);">موقع مكسور (يعرض مطاعم!)</td>
                    </tr>
                    <tr>
                        <td>uaelawyer.ae</td>
                        <td>❌</td>
                        <td>❌</td>
                        <td>❌</td>
                        <td>✅</td>
                        <td>❌</td>
                        <td>دليل بسيط جداً</td>
                    </tr>
                    <tr>
                        <td>pathlegal.com</td>
                        <td>❌</td>
                        <td>❌</td>
                        <td>✅</td>
                        <td>❌</td>
                        <td>✅</td>
                        <td>عالمي، إنجليزي فقط</td>
                    </tr>
                    <tr>
                        <td>الدليل الحكومي</td>
                        <td>❌</td>
                        <td>❌</td>
                        <td>❌</td>
                        <td>✅</td>
                        <td>❌</td>
                        <td>مجرد قائمة أسماء PDF</td>
                    </tr>
                    <tr class="highlight">
                        <td style="font-weight: bold; color: var(--gold);">منصة إتمام</td>
                        <td>✅</td>
                        <td>✅</td>
                        <td>✅</td>
                        <td>✅</td>
                        <td>✅</td>
                        <td style="font-weight: bold; color: #4CAF50;">شراكة + استوديو + قاعدة عملاء</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>

    <!-- 6. Revenue Model -->
    <section id="revenue">
        <h2 class="section-title fade-in-up">نموذج الإيرادات</h2>
        <div class="grid-2 fade-in-up">
            <div class="glass-card">
                <h3 style="color: var(--gold); border-bottom: 1px solid var(--glass-border); padding-bottom: 10px; margin-bottom: 20px;">Phase B (قسم مدمج) - السنة الأولى</h3>
                <div class="donut-wrapper">
                    <div class="donut-chart">
                        <div class="donut-inner">
                            <h3 style="color: var(--gold);">1.2M</h3>
                            <p style="font-size: 0.8rem;">درهم / سنوياً</p>
                        </div>
                    </div>
                    <div class="donut-legend">
                        <ul>
                            <li><div class="legend-color" style="background: var(--gold);"></div> رسم ظهور: 18,750 د.إ/شهر</li>
                            <li><div class="legend-color" style="background: var(--terracotta);"></div> عمولة (8-15%): 24,000 د.إ/شهر</li>
                            <li><div class="legend-color" style="background: #4CAF50;"></div> رعاية محتوى: 28,000 د.إ/شهر</li>
                            <li><div class="legend-color" style="background: var(--navy);"></div> إعلان داخلي: 20,000 د.إ/شهر</li>
                        </ul>
                    </div>
                </div>
                <div style="margin-top: 30px; text-align: center; background: rgba(76, 175, 80, 0.1); padding: 15px; border-radius: 10px; border: 1px solid #4CAF50;">
                    <h3 style="color: #4CAF50;">العائد على الاستثمار (ROI): 200% - 350%</h3>
                </div>
            </div>

            <div class="glass-card">
                <h3 style="color: var(--gold); border-bottom: 1px solid var(--glass-border); padding-bottom: 10px; margin-bottom: 20px;">Phase A (منصة مستقلة) - التوسع</h3>
                <ul style="list-style: none; line-height: 2.5;">
                    <li><i class="fas fa-check-circle" style="color: var(--gold); margin-left: 10px;"></i> <strong>اشتراكات محامين:</strong> 85,000 د.إ / شهر</li>
                    <li><i class="fas fa-check-circle" style="color: var(--gold); margin-left: 10px;"></i> <strong>عمولة تحويل:</strong> 20,000 د.إ / شهر</li>
                    <li><i class="fas fa-check-circle" style="color: var(--gold); margin-left: 10px;"></i> <strong>إعلانات:</strong> 15,000 د.إ / شهر</li>
                    <li><i class="fas fa-check-circle" style="color: var(--gold); margin-left: 10px;"></i> <strong>محتوى مدفوع (SaaS):</strong> 40,000 د.إ / شهر</li>
                </ul>
                <div style="margin-top: 30px; text-align: center; background: rgba(184, 154, 119, 0.1); padding: 15px; border-radius: 10px; border: 1px solid var(--gold);">
                    <h3 style="color: var(--gold);">الإجمالي المتوقع: 1.5 - 2.0 مليون د.إ / سنوياً</h3>
                </div>
            </div>
        </div>
    </section>

    <!-- 7. Strategy Timeline -->
    <section id="strategy">
        <h2 class="section-title fade-in-up">الاستراتيجية: ابدأ صغيراً، كبّر بذكاء</h2>
        <div class="timeline fade-in-up">
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="glass-card">
                    <h3 style="color: var(--gold);">الأشهر 1 - 3</h3>
                    <h4>إطلاق "مستشارو إتمام" (Phase B)</h4>
                    <p>دمج قسم داخل موقع إتمام الحالي. استقطاب أول 20 محامي مؤسس. الميزانية: 200K - 310K د.إ.</p>
                </div>
            </div>
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="glass-card">
                    <h3 style="color: var(--gold);">الأشهر 4 - 6</h3>
                    <h4>نمو المحتوى والاستحواذ</h4>
                    <p>إطلاق حملات الفيديو، الوصول إلى 50 محامي، تفعيل نظام التقييمات وبدء تحقيق الإيرادات.</p>
                </div>
            </div>
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="glass-card">
                    <h3 style="color: var(--gold);">الأشهر 7 - 9</h3>
                    <h4>التقييم واتخاذ القرار</h4>
                    <p>مراجعة KPIs، قياس رضا العملاء والمحامين، واتخاذ قرار الاستثمار في المنصة المستقلة.</p>
                </div>
            </div>
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="glass-card">
                    <h3 style="color: var(--terracotta);">الأشهر 10 - 15</h3>
                    <h4>إطلاق المنصة المستقلة (Phase A)</h4>
                    <p>بناء منصة منفصلة بالكامل بهوية بصرية مستقلة تطبيق موبايل، توسيع الخدمات لتشمل SaaS للمحامين.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- 8. Marketing & 9. Competitive Advantage -->
    <section id="marketing">
        <h2 class="section-title fade-in-up">الميزة التنافسية (Unfair Advantage)</h2>
        <div class="grid-4 fade-in-up" style="margin-bottom: 80px;">
            <div class="glass-card text-center" style="padding: 20px;">
                <i class="fas fa-handshake fa-2x" style="color: var(--gold); margin-bottom: 10px;"></i>
                <h4 style="color: #fff;">شراكة القضاء</h4>
                <p style="font-size: 0.8rem;">ميزة حصرية لا يمكن للمنافسين تقليدها</p>
            </div>
            <div class="glass-card text-center" style="padding: 20px;">
                <i class="fas fa-database fa-2x" style="color: var(--gold); margin-bottom: 10px;"></i>
                <h4 style="color: #fff;">قاعدة عملاء</h4>
                <p style="font-size: 0.8rem;">آلاف العملاء الجاهزين من خدمات إتمام</p>
            </div>
            <div class="glass-card text-center" style="padding: 20px;">
                <i class="fas fa-video fa-2x" style="color: var(--gold); margin-bottom: 10px;"></i>
                <h4 style="color: #fff;">استوديو تصوير</h4>
                <p style="font-size: 0.8rem;">إنتاج محتوى قانوني احترافي داخلياً</p>
            </div>
            <div class="glass-card text-center" style="padding: 20px;">
                <i class="fas fa-gavel fa-2x" style="color: var(--gold); margin-bottom: 10px;"></i>
                <h4 style="color: #fff;">خبرة قضائية</h4>
                <p style="font-size: 0.8rem;">فهم عميق لاحتياجات السوق المحلي</p>
            </div>
        </div>

        <h2 class="section-title fade-in-up">خطة التسويق (Go-to-Market)</h2>
        <div class="grid-3 fade-in-up">
            <div class="glass-card">
                <h3 style="color: var(--gold); margin-bottom: 15px;"><i class="fas fa-briefcase"></i> B2B (للمحامين)</h3>
                <ul style="padding-right: 20px;">
                    <li>عروض "المؤسس" لأول 20 محامي</li>
                    <li>تصوير فيديو تعريفي مجاني</li>
                    <li>ندوات وورش عمل مشتركة</li>
                </ul>
            </div>
            <div class="glass-card">
                <h3 style="color: var(--gold); margin-bottom: 15px;"><i class="fas fa-users"></i> B2C (للعملاء)</h3>
                <ul style="padding-right: 20px;">
                    <li>Cross-selling من خدمات إتمام</li>
                    <li>حملات SEO للكلمات القانونية</li>
                    <li>استشارة أولى مخفضة/مجانية</li>
                </ul>
            </div>
            <div class="glass-card">
                <h3 style="color: var(--gold); margin-bottom: 15px;"><i class="fas fa-share-alt"></i> Content Strategy</h3>
                <ul style="padding-right: 20px;">
                    <li>فيديوهات قصيرة (Reels/TikTok)</li>
                    <li>شرح مبسط للقوانين الإماراتية الجديدة</li>
                    <li>قصص نجاح (بدون أسماء)</li>
                </ul>
            </div>
        </div>
    </section>

    <!-- 10. Objections -->
    <section id="objections">
        <h2 class="section-title fade-in-up">الاعتراضات والردود</h2>
        <div class="grid-2 fade-in-up">
            <div>
                <div class="accordion-item">
                    <div class="accordion-header">1. ليش نستثمر في هذا المجال؟ <i class="fas fa-plus"></i></div>
                    <div class="accordion-content">
                        <p>سوق بحجم 5 مليار دولار يفتقر لمنافس تقني حقيقي في الإمارات، مع عائد متوقع (ROI) يتجاوز 200% في السنة الأولى.</p>
                    </div>
                </div>
                <div class="accordion-item">
                    <div class="accordion-header">2. ماذا لو أخطأ المحامي وتأثرت سمعتنا؟ <i class="fas fa-plus"></i></div>
                    <div class="accordion-content">
                        <p>المنصة وسيط وليست مكتب محاماة. لدينا نظام تقييم صارم، حق الرد، وشروط استخدام تخلي مسؤولية المنصة قانونياً.</p>
                    </div>
                </div>
                <div class="accordion-item">
                    <div class="accordion-header">3. هل هذا النموذج ناجح عالمياً؟ <i class="fas fa-plus"></i></div>
                    <div class="accordion-content">
                        <p>نعم، منصة LegalZoom إيراداتها 682 مليون دولار، وAvvo تم الاستحواذ عليها بأكثر من 500 مليون دولار.</p>
                    </div>
                </div>
            </div>
            <div>
                <div class="accordion-item">
                    <div class="accordion-header">4. مين راح يبني ويدير المنصة؟ <i class="fas fa-plus"></i></div>
                    <div class="accordion-content">
                        <p>نحن (Pyramedia X) كشريك تقني وتسويقي، مع فريق مصغر من إتمام للإدارة اليومية.</p>
                    </div>
                </div>
                <div class="accordion-item">
                    <div class="accordion-header">5. هل هناك طلب حقيقي من المحامين؟ <i class="fas fa-plus"></i></div>
                    <div class="accordion-content">
                        <p>يوجد 1,710 محامي مرخص، و60% من محامي الشرق الأوسط يتواجدون في الإمارات. المنافسة بينهم شرسة ويحتاجون لمنصات تسويق.</p>
                    </div>
                </div>
                <div class="accordion-item">
                    <div class="accordion-header">6. ليش ما نكتفي بتسويق مباشر لإتمام؟ <i class="fas fa-plus"></i></div>
                    <div class="accordion-content">
                        <p>التسويق حملة وتنتهي. المنصة هي أصل (Asset) ومصدر إيرادات متكرر (Recurring Revenue) يرفع من تقييم الشركة ككل.</p>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- 11 & 12. KPIs & CTA -->
    <section id="kpis">
        <h2 class="section-title fade-in-up">مؤشرات الأداء (KPIs)</h2>
        <div class="glass-table-wrapper fade-in-up" style="margin-bottom: 60px;">
            <table class="glass-table">
                <thead>
                    <tr>
                        <th>المؤشر</th>
                        <th>الهدف (بعد 6 أشهر)</th>
                        <th>الهدف (بعد 12 شهر)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>عدد المحامين النشطين</td>
                        <td style="color: var(--gold); font-weight: bold;">25</td>
                        <td style="color: var(--gold); font-weight: bold;">50</td>
                    </tr>
                    <tr>
                        <td>الاستشارات المحجوزة / شهر</td>
                        <td style="color: var(--gold); font-weight: bold;">50</td>
                        <td style="color: var(--gold); font-weight: bold;">200</td>
                    </tr>
                    <tr>
                        <td>محتوى الفيديو المنتج</td>
                        <td style="color: var(--gold); font-weight: bold;">30</td>
                        <td style="color: var(--gold); font-weight: bold;">100</td>
                    </tr>
                    <tr>
                        <td>الإيراد الشهري المتوقع</td>
                        <td style="color: #4CAF50; font-weight: bold;">20,000 د.إ</td>
                        <td style="color: #4CAF50; font-weight: bold;">90,000 د.إ</td>
                    </tr>
                    <tr>
                        <td>متوسط رضا المحامين</td>
                        <td>4.0 / 5.0</td>
                        <td>4.5 / 5.0</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="glass-card text-center fade-in-up" style="background: linear-gradient(135deg, rgba(184, 154, 119, 0.1), rgba(0, 56, 102, 0.5)); border: 1px solid var(--gold);">
            <h2 style="font-family: 'Cairo', sans-serif; font-size: 2.5rem; margin-bottom: 20px;">الخطوة القادمة</h2>
            <p style="font-size: 1.2rem; margin-bottom: 30px; color: var(--warm-gray);">
                الموافقة على ميزانية <strong>Phase B</strong> (200K - 310K د.إ)<br>
                للبدء في بناء القسم المدمج واستقطاب أول 20 محامي مؤسس خلال 3 أشهر.
            </p>
            <button class="cta-btn" onclick="alert('تم تسجيل طلب بدء المشروع. سيتم التواصل لتوقيع العقود.')">
                <i class="fas fa-rocket"></i> نبدأ التنفيذ (Phase B)
            </button>
        </div>
    </section>

    <!-- Scripts -->
    <script>
        // 1. Progress Bar
        window.onscroll = function() {
            let winScroll = document.body.scrollTop || document.documentElement.scrollTop;
            let height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            let scrolled = (winScroll / height) * 100;
            document.getElementById("progress-bar").style.width = scrolled + "%";
        };

        // 2. Scroll Spy Navbar
        const sections = document.querySelectorAll("section");
        const navLinks = document.querySelectorAll(".nav-links a");

        window.addEventListener("scroll", () => {
            let current = "";
            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.clientHeight;
                if (pageYOffset >= (sectionTop - sectionHeight / 3)) {
                    current = section.getAttribute("id");
                }
            });

            navLinks.forEach(link => {
                link.classList.remove("active");
                if (link.getAttribute("href").includes(current)) {
                    link.classList.add("active");
                }
            });
        });

        // 3. Intersection Observer for Animations & Counters & Charts
        const observerOptions = {
            threshold: 0.2
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Fade in up
                    if (entry.target.classList.contains('fade-in-up')) {
                        entry.target.classList.add('visible');
                    }
                    
                    // Animate Bar Charts
                    if (entry.target.classList.contains('bar-fill')) {
                        entry.target.style.width = entry.target.getAttribute('data-width');
                    }

                    // Animate Numbers
                    if (entry.target.classList.contains('stat-number') && !entry.target.classList.contains('counted')) {
                        const target = parseFloat(entry.target.getAttribute('data-target'));
                        const suffix = entry.target.getAttribute('data-suffix');
                        const duration = 2000; // 2 seconds
                        const stepTime = Math.abs(Math.floor(duration / target));
                        let current = 0;
                        
                        // Handle decimals for 5.0
                        const isDecimal = target % 1 !== 0 || entry.target.getAttribute('data-target').includes('.');

                        const timer = setInterval(() => {
                            if(target === 0) {
                                entry.target.innerText = "0";
                                clearInterval(timer);
                                return;
                            }
                            
                            current += (target / 50); // 50 steps
                            if (current >= target) {
                                current = target;
                                clearInterval(timer);
                            }
                            
                            entry.target.innerText = (isDecimal ? current.toFixed(1) : Math.floor(current)) + suffix;
                        }, duration / 50);
                        
                        entry.target.classList.add('counted');
                    }
                }
            });
        }, observerOptions);

        document.querySelectorAll('.fade-in-up, .bar-fill, .stat-number').forEach(el => {
            observer.observe(el);
        });

        // 4. Accordion Logic
        document.querySelectorAll('.accordion-header').forEach(button => {
            button.addEventListener('click', () => {
                const accordionItem = button.parentElement;
                const icon = button.querySelector('i');
                
                // Close others
                document.querySelectorAll('.accordion-item').forEach(item => {
                    if (item !== accordionItem) {
                        item.classList.remove('active');
                        item.querySelector('i').classList.remove('fa-minus');
                        item.querySelector('i').classList.add('fa-plus');
                    }
                });

                // Toggle current
                accordionItem.classList.toggle('active');
                if(accordionItem.classList.contains('active')) {
                    icon.classList.remove('fa-plus');
                    icon.classList.add('fa-minus');
                } else {
                    icon.classList.remove('fa-minus');
                    icon.classList.add('fa-plus');
                }
            });
        });

        // 5. Simple Particles JS (Canvas)
        const canvas = document.getElementById('particles-js');
        const ctx = canvas.getContext('2d');
        let width, height, particles;

        function initParticles() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = document.getElementById('hero').offsetHeight;
            particles = [];
            for (let i = 0; i < 50; i++) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    r: Math.random() * 2 + 1,
                    dx: (Math.random() - 0.5) * 0.5,
                    dy: (Math.random() - 0.5) * 0.5,
                    alpha: Math.random() * 0.5 + 0.1
                });
            }
        }

        function drawParticles() {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#b89a77';
            particles.forEach(p => {
                ctx.globalAlpha = p.alpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
                
                p.x += p.dx;
                p.y += p.dy;
                
                if(p.x < 0 || p.x > width) p.dx *= -1;
                if(p.y < 0 || p.y > height) p.dy *= -1;
            });
            requestAnimationFrame(drawParticles);
        }

        window.addEventListener('resize', initParticles);
        initParticles();
        drawParticles();
    </script>
</body>
</html>
?>
