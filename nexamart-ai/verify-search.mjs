import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('=== SEARCH GUIDANCE VERIFICATION ===\n');

  // 1. Homepage - check search bar in navbar
  console.log('1. HOMEPAGE - Search Bar');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  const searchInput = await page.locator('input[placeholder*="Search products"]').first();
  const placeholder = await searchInput.getAttribute('placeholder');
  console.log(`   Placeholder: "${placeholder}"`);
  
  // Check for example chips
  const exampleChips = await page.locator('button:has-text("Black shoes"), button:has-text("Laptops"), button:has-text("Men\'s jackets")').count();
  console.log(`   Example chips visible: ${exampleChips}`);
  
  await page.screenshot({ path: 'C:\\Projects\\E-commerce\\nexamart-ai\\audit-search-homepage.png', fullPage: false });
  console.log('   Screenshot: audit-search-homepage.png\n');

  // 2. Search page - regular search
  console.log('2. SEARCH PAGE - Regular Search');
  await page.goto('http://localhost:5173/search?q=shoes', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Projects\\E-commerce\\nexamart-ai\\audit-search-regular.png', fullPage: false });
  console.log('   Screenshot: audit-search-regular.png\n');

  // 3. Login page - to test vendor/admin
  console.log('3. LOGIN PAGE');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'C:\\Projects\\E-commerce\\nexamart-ai\\audit-search-login.png', fullPage: false });
  console.log('   Screenshot: audit-search-login.png\n');

  // 4. Vendor products - check placeholder
  console.log('4. VENDOR PRODUCTS - Check Placeholder');
  await page.goto('http://localhost:5173/vendor/products', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  const vendorRedirected = page.url().includes('login');
  console.log(`   Redirected to login: ${vendorRedirected}`);
  if (vendorRedirected) {
    console.log('   (Cannot verify vendor placeholder without login)\n');
  }

  // 5. Admin products - check placeholder
  console.log('5. ADMIN PRODUCTS - Check Placeholder');
  await page.goto('http://localhost:5173/admin/products', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  const adminRedirected = page.url().includes('login');
  console.log(`   Redirected to login: ${adminRedirected}`);
  if (adminRedirected) {
    console.log('   (Cannot verify admin placeholder without login)\n');
  }

  await browser.close();
  console.log('=== VERIFICATION COMPLETE ===');
})();
