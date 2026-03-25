const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1080 });
  await page.goto('file:///home/node/openclaw/ad-design.html');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/home/node/openclaw/pyra-ad.png', type: 'png' });
  await browser.close();
  console.log('Screenshot saved!');
})();
