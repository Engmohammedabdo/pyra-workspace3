const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080 });
  await page.goto('file:///home/node/openclaw/ad-design.html', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: '/home/node/openclaw/pyra-ad.png', type: 'png' });
  await browser.close();
  console.log('Screenshot saved to pyra-ad.png');
})();
