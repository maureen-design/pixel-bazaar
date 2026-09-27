import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('=== AUDIT: NexaMart AI Homepage & Dashboard ===\n');

  // 1. VISITOR HOMEPAGE (not logged in)
  console.log('1. VISITOR HOMEPAGE');
  console.log('='.repeat(50));
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const visitorData = await page.evaluate(() => {
    const sections = [];
    const main = document.querySelector('main') || document.querySelector('#main-content');
    if (main) {
      const children = main.querySelectorAll('section, [class*="mb-"], [class*="py-"]');
      children.forEach((child, i) => {
        if (i < 15) {
          const style = window.getComputedStyle(child);
          sections.push({
            tag: child.tagName,
            class: (child.className || '').substring(0, 80),
            bg: style.backgroundColor,
            text: child.textContent?.substring(0, 100)?.trim() || '',
          });
        }
      });
    }

    // Check hero
    const hero = document.querySelector('[class*="bg-gradient-to-br"][class*="from-background"]');
    const heroText = hero ? {
      bg: window.getComputedStyle(hero).backgroundColor,
      headline: hero.querySelector('h1')?.textContent?.trim() || '',
      hasHowItWorks: !!hero.textContent?.includes('How It Works') || !!hero.textContent?.includes('Browse'),
      hasTrustStats: !!hero.querySelector('[class*="border-t"]'),
      hasProductCluster: hero.querySelectorAll('[class*="bg-card"][class*="rounded-2xl"]').length,
    } : null;

    // Check navbar
    const nav = document.querySelector('nav');
    const navStyle = nav ? window.getComputedStyle(nav) : null;

    // Check footer
    const footer = document.querySelector('footer');
    const footerStyle = footer ? window.getComputedStyle(footer) : null;

    // Count sections
    const allSections = main?.querySelectorAll('section, [class*="mb-16"]') || [];

    return {
      hero: heroText,
      sectionCount: allSections.length,
      navBg: navStyle?.backgroundColor || 'none',
      footerBg: footerStyle?.backgroundColor || 'none',
      bodyBg: window.getComputedStyle(document.body).backgroundColor,
      bodyColor: window.getComputedStyle(document.body).color,
    };
  });

  console.log(`Body: bg=${visitorData.bodyBg}, color=${visitorData.bodyColor}`);
  console.log(`Navbar: bg=${visitorData.navBg}`);
  console.log(`Footer: bg=${visitorData.footerBg}`);
  console.log(`Total sections: ${visitorData.sectionCount}`);
  console.log('\nHero:');
  console.log(`  Headline: "${visitorData.hero?.headline || 'none'}"`);
  console.log(`  Has How It Works: ${visitorData.hero?.hasHowItWorks}`);
  console.log(`  Has Trust Stats: ${visitorData.hero?.hasTrustStats}`);
  console.log(`  Product Cluster Cards: ${visitorData.hero?.hasProductCluster || 0}`);

  await page.screenshot({ path: 'C:\\Projects\\E-commerce\\nexamart-ai\\audit-visitor-home.png', fullPage: true });
  console.log('Screenshot: audit-visitor-home.png\n');

  // 2. LOGGED-IN HOMEPAGE
  console.log('2. LOGGED-IN HOMEPAGE');
  console.log('='.repeat(50));
  
  // Navigate to login
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check if login form exists
  const loginForm = await page.evaluate(() => {
    const emailInput = document.querySelector('input[type="email"]');
    const passwordInput = document.querySelector('input[type="password"]');
    const submitButton = document.querySelector('button[type="submit"]');
    return {
      hasEmail: !!emailInput,
      hasPassword: !!passwordInput,
      hasSubmit: !!submitButton,
    };
  });

  console.log('Login page found:', loginForm.hasEmail && loginForm.hasPassword ? 'Yes' : 'No');
  console.log('Note: Cannot test logged-in state without credentials');
  
  await page.screenshot({ path: 'C:\\Projects\\E-commerce\\nexamart-ai\\audit-login.png', fullPage: true });
  console.log('Screenshot: audit-login.png\n');

  // 3. VENDOR DASHBOARD
  console.log('3. VENDOR DASHBOARD');
  console.log('='.repeat(50));
  await page.goto('http://localhost:5173/vendor/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const vendorData = await page.evaluate(() => {
    const main = document.querySelector('main');
    const cards = main?.querySelectorAll('[class*="bg-card"], [class*="border-border"]') || [];
    return {
      hasRedirect: window.location.href.includes('login'),
      currentUrl: window.location.href,
      cardCount: cards.length,
    };
  });

  console.log(`Redirected to login: ${vendorData.hasRedirect}`);
  console.log(`Current URL: ${vendorData.currentUrl}`);
  console.log(`Dashboard cards visible: ${vendorData.cardCount}`);
  
  await page.screenshot({ path: 'C:\\Projects\\E-commerce\\nexamart-ai\\audit-vendor.png', fullPage: true });
  console.log('Screenshot: audit-vendor.png\n');

  // 4. ADMIN DASHBOARD
  console.log('4. ADMIN DASHBOARD');
  console.log('='.repeat(50));
  await page.goto('http://localhost:5173/admin/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const adminData = await page.evaluate(() => {
    const main = document.querySelector('main');
    const cards = main?.querySelectorAll('[class*="bg-card"], [class*="border-border"]') || [];
    return {
      hasRedirect: window.location.href.includes('login'),
      currentUrl: window.location.href,
      cardCount: cards.length,
    };
  });

  console.log(`Redirected to login: ${adminData.hasRedirect}`);
  console.log(`Current URL: ${adminData.currentUrl}`);
  console.log(`Dashboard cards visible: ${adminData.cardCount}`);
  
  await page.screenshot({ path: 'C:\\Projects\\E-commerce\\nexamart-ai\\audit-admin.png', fullPage: true });
  console.log('Screenshot: audit-admin.png\n');

  // 5. CSS ANALYSIS
  console.log('5. CSS & THEME ANALYSIS');
  console.log('='.repeat(50));
  const cssData = await page.evaluate(() => {
    const root = document.documentElement;
    const style = window.getComputedStyle(root);
    return {
      isDark: root.classList.contains('dark'),
      bg: style.getPropertyValue('--background'),
      fg: style.getPropertyValue('--foreground'),
      card: style.getPropertyValue('--card'),
      primary: style.getPropertyValue('--primary'),
      border: style.getPropertyValue('--border'),
    };
  });

  console.log(`Dark mode: ${cssData.isDark}`);
  console.log(`--background: ${cssData.bg}`);
  console.log(`--foreground: ${cssData.fg}`);
  console.log(`--card: ${cssData.card}`);
  console.log(`--primary: ${cssData.primary}`);
  console.log(`--border: ${cssData.border}`);

  // 6. CHECK ALL ROUTES
  console.log('\n6. ROUTE MAP');
  console.log('='.repeat(50));
  const routes = [
    '/', '/login', '/signup', '/cart', '/checkout',
    '/about', '/contact', '/privacy', '/terms',
    '/vendor/dashboard', '/vendor/products', '/vendor/orders',
    '/admin/dashboard', '/admin/products', '/admin/orders',
  ];

  for (const route of routes) {
    try {
      await page.goto(`http://localhost:5173${route}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(500);
      const status = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        return {
          title: h1?.textContent?.trim()?.substring(0, 40) || 'no h1',
          url: window.location.href,
        };
      });
      const redirected = !status.url.includes(route);
      console.log(`${route} → ${redirected ? 'REDIRECTED to ' + new URL(status.url).pathname : status.title}`);
    } catch (e) {
      console.log(`${route} → ERROR: ${e.message.substring(0, 50)}`);
    }
  }

  await browser.close();
  console.log('\n=== AUDIT COMPLETE ===');
})();
