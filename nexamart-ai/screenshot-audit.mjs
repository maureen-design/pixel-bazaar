import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Visit homepage as visitor first
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Take visitor screenshot
  await page.screenshot({ path: 'C:\\Projects\\E-commerce\\nexamart-ai\\audit-visitor-homepage.png', fullPage: true });
  console.log('Visitor homepage screenshot saved.');

  // Navigate to login
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Take login page screenshot
  await page.screenshot({ path: 'C:\\Projects\\E-commerce\\nexamart-ai\\audit-login-page.png', fullPage: true });
  console.log('Login page screenshot saved.');

  await browser.close();
  console.log('Done.');
})();
