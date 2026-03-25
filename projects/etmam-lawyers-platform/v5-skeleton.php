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

<!-- SLIDES_PART1_START -->
<!-- Will be filled by Agent 1: Slides 1-6 -->
<!-- SLIDES_PART1_END -->

<!-- SLIDES_PART2_START -->
<!-- Will be filled by Agent 2: Slides 7-12 -->
<!-- SLIDES_PART2_END -->

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
