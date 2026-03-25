# Arabic PDF Generation Research — Node.js

**Date:** 2026-02-21  
**Status:** ✅ TESTED & CONFIRMED WORKING  
**Recommendation:** Puppeteer (HTML→PDF) — already installed!

---

## Executive Summary

We tested and researched multiple approaches for generating Arabic PDFs with proper RTL text (connected letters) in Node.js. **Puppeteer HTML→PDF is the clear winner** — it's already installed on our system, renders Arabic perfectly with connected letters, supports Google Fonts (Cairo), handles BiDi text, and produces professional-quality PDFs.

---

## Approaches Ranked by Quality

### 🥇 1. Puppeteer/Chromium HTML→PDF (⭐ RECOMMENDED)

**Status:** ✅ TESTED & WORKING  
**Quality:** Excellent  
**Arabic Support:** Perfect connected letters, proper RTL  
**Already Installed:** Yes!

**How it works:** Render HTML in headless Chromium, then print to PDF. Chromium's text shaping engine (HarfBuzz) handles Arabic letter connections perfectly.

**Pros:**
- ✅ Perfect Arabic text shaping (connected letters, ligatures)
- ✅ Full CSS support (flexbox, grid, gradients, shadows)
- ✅ Google Fonts via `<link>` tag (Cairo, Tajawal, Amiri, etc.)
- ✅ RTL layout works natively with `dir="rtl"`
- ✅ BiDi text (mixed Arabic/English) handled automatically
- ✅ Tables, charts, images — everything HTML can do
- ✅ Already installed on our system!
- ✅ Easy to maintain — just edit HTML/CSS templates

**Cons:**
- ⚠️ Emojis render as boxes (no emoji font installed) — fixable by installing `fonts-noto-color-emoji` or using SVG icons instead
- ⚠️ Slower than pure PDF libraries (~2-5 seconds per PDF)
- ⚠️ Higher memory usage (launches browser)
- ⚠️ Requires Chromium binary

**Our Test Results:**
- PDF generated: 117KB (A4, with Cairo font)
- Arabic letters: ✅ Perfectly connected
- RTL direction: ✅ Correct
- Table layout: ✅ Professional
- Mixed Arabic/English: ✅ BiDi correct
- Cairo Google Font: ✅ Loaded and rendered
- Emojis: ❌ Tofu boxes (fixable)

---

### 🥈 2. PDFKit (Available in our system)

**Status:** Available in `node_modules/pdfkit`  
**Quality:** Good, but requires manual RTL handling  
**Arabic Support:** Requires Arabic font file + manual text reshaping

**How it works:** Low-level PDF generation. You manually position text, draw shapes, etc.

**Pros:**
- ✅ Fast, lightweight, no browser needed
- ✅ Supports custom TTF/OTF fonts
- ✅ Good for simple documents

**Cons:**
- ❌ No built-in RTL support — need `arabic-reshaper` + `bidi` libraries
- ❌ Must manually reshape Arabic letters (connect them)
- ❌ No CSS — manual layout positioning
- ❌ Complex table creation (manual drawing)
- ❌ Much more code for same result

**Verdict:** Too much manual work for Arabic. Not recommended.

---

### 🥉 3. pdfmake (Not installed, would need to add)

**Status:** Not installed  
**Quality:** Good for structured documents  
**Arabic Support:** Possible with custom Arabic font (VFS or URL)

**How it works:** Declarative document definition (JSON-like). Handles layout automatically.

**Pros:**
- ✅ Declarative API — easy to create tables, lists
- ✅ Custom fonts supported (VFS or URL method)
- ✅ Auto page breaks, headers/footers
- ✅ No browser needed

**Cons:**
- ❌ RTL support is limited/buggy (GitHub issues report problems)
- ❌ Arabic letter reshaping may not work correctly without hacks
- ❌ Need to embed entire Arabic font file (adds ~1-5MB to bundle)
- ❌ Not as flexible as HTML/CSS for complex layouts

**Verdict:** Possible but risky for Arabic. HTML→PDF is more reliable.

---

### 4. jsPDF (Not recommended for Arabic)

**Status:** Not installed  
**Quality:** Poor for Arabic  
**Arabic Support:** Very problematic

**Cons:**
- ❌ Arabic letters appear disconnected by default
- ❌ Requires `jspdf-autotable` + manual reshaping
- ❌ RTL is poorly supported
- ❌ Many open issues about Arabic text on GitHub

**Verdict:** Not recommended for Arabic at all.

---

### 5. WeasyPrint (Python, not Node.js)

**Status:** Not applicable (Python)  
**Quality:** Excellent for HTML→PDF  
**Arabic Support:** Good

Alternative if we were using Python, but we're in Node.js ecosystem.

---

### 6. pdf-lib (Not recommended for Arabic)

**Status:** Not installed  
**Quality:** Good for PDF manipulation, poor for Arabic generation  

**Cons:**
- ❌ No built-in text shaping
- ❌ Arabic letters won't connect
- ❌ Designed more for PDF editing than generation

---

## Our Setup Details

### Chrome/Chromium Binary
```
Path: /home/node/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome
Version: Google Chrome for Testing 145.0.7632.6
Requires: LD_LIBRARY_PATH="/home/node/.local/lib/chromium-deps"
```

### Puppeteer
```
Package: puppeteer-core (in /home/node/openclaw/node_modules/)
Usage: require('puppeteer-core') with executablePath
```

### Available Arabic Google Fonts (load via CSS `<link>`)
| Font | Style | Best For |
|------|-------|----------|
| **Cairo** ⭐ | Modern, geometric | Reports, dashboards |
| **Tajawal** | Clean, rounded | UI text, documents |
| **Amiri** | Traditional, serif | Formal documents |
| **Noto Kufi Arabic** | Kufi style | Headers, titles |
| **IBM Plex Sans Arabic** | Professional | Business docs |
| **Almarai** | Friendly | Marketing materials |

---

## Production-Ready Code Example

```javascript
const puppeteerCore = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = '/home/node/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';

async function generateArabicPDF(htmlContent, outputPath, options = {}) {
  // Must set LD_LIBRARY_PATH before launching
  // process.env.LD_LIBRARY_PATH = '/home/node/.local/lib/chromium-deps';
  
  const browser = await puppeteerCore.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
  
  const pdf = await page.pdf({
    format: options.format || 'A4',
    printBackground: true,
    margin: options.margin || { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    displayHeaderFooter: options.headerFooter || false,
    headerTemplate: options.headerTemplate || '',
    footerTemplate: options.footerTemplate || '',
  });
  
  if (outputPath) {
    fs.writeFileSync(outputPath, pdf);
  }
  
  await browser.close();
  return pdf; // Returns Buffer
}

// HTML Template for Arabic reports
function arabicReportHTML({ title, date, sections, font = 'Cairo' }) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=${font}:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { 
    font-family: '${font}', sans-serif; 
    direction: rtl; 
    padding: 40px; 
    font-size: 14px;
    color: #333;
    line-height: 1.8;
  }
  h1 { color: #6C5CE7; border-bottom: 2px solid #6C5CE7; padding-bottom: 10px; }
  h2 { color: #6C5CE7; margin-top: 30px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th, td { border: 1px solid #ddd; padding: 10px 12px; text-align: right; }
  th { background: #6C5CE7; color: white; font-weight: 700; }
  tr:nth-child(even) { background: #f9f9f9; }
  .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddd; color: #888; font-size: 12px; }
</style>
</head>
<body>
  <h1>${title}</h1>
  <p>تاريخ: ${date}</p>
  ${sections}
  <div class="footer">تم إنشاء هذا التقرير تلقائياً بواسطة PyraAI</div>
</body>
</html>`;
}

module.exports = { generateArabicPDF, arabicReportHTML };
```

### Usage in n8n Code Node:
```javascript
// In n8n Execute Code node
const puppeteerCore = require('puppeteer-core');

// Set env before anything
process.env.LD_LIBRARY_PATH = '/home/node/.local/lib/chromium-deps';

const html = `<html lang="ar" dir="rtl">...your Arabic HTML...</html>`;

const browser = await puppeteerCore.launch({
  executablePath: '/home/node/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0' });
const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
await browser.close();

// Return as binary for n8n
return [{ json: { success: true }, binary: { data: { data: pdfBuffer.toString('base64'), mimeType: 'application/pdf', fileName: 'report.pdf' } } }];
```

---

## Fixing the Emoji Issue

The only issue found: emojis render as boxes because no emoji font is installed.

### Option A: Install Noto Color Emoji font
```bash
# If apt is available:
apt-get install fonts-noto-color-emoji

# Or download manually:
mkdir -p ~/.local/share/fonts
curl -L -o ~/.local/share/fonts/NotoColorEmoji.ttf \
  "https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf"
fc-cache -f -v
```

### Option B: Use text/SVG instead of emojis (simpler)
Replace `✅` with styled HTML like `<span style="color:green">●</span>` or inline SVG.

### Option C: Use CSS to map emojis to a web font
```css
@font-face {
  font-family: 'Noto Color Emoji';
  src: url('https://cdn.jsdelivr.net/gh/nicholasgasior/fonts@master/NotoColorEmoji.ttf');
}
body { font-family: 'Cairo', 'Noto Color Emoji', sans-serif; }
```

---

## Key Findings

1. **Puppeteer HTML→PDF is the BEST approach for Arabic** — Chromium's HarfBuzz handles Arabic shaping perfectly
2. **We already have everything needed** — puppeteer-core + Playwright's Chromium
3. **Google Fonts work** — Cairo font loads via `<link>` tag, renders beautifully
4. **RTL is automatic** — just use `dir="rtl"` on the HTML element
5. **BiDi text works** — mixed Arabic/English handled correctly
6. **Only issue: emojis** — easily fixable with emoji font or SVG replacement
7. **PDFKit/jsPDF/pdfmake are NOT recommended** for Arabic — too many letter connection issues

---

## Performance Notes

- PDF generation time: ~3-5 seconds (includes browser launch)
- Can optimize by keeping browser instance alive (browser pool)
- PDF size: ~30-120KB depending on fonts loaded
- Google Fonts add ~80KB (cached after first load)

---

## Files Generated During Testing

- `/tmp/test-arabic-report.pdf` — Basic test (Arial font, 31KB)
- `/tmp/test-arabic-screenshot.png` — Screenshot of basic test
- `/tmp/test-arabic-cairo.pdf` — Cairo font test (117KB)  
- `/tmp/test-arabic-cairo.png` — Screenshot of Cairo font test
