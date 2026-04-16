import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
page.on('console', msg => console.log('console:', msg.type(), msg.text()));
page.on('pageerror', err => console.log('pageerror:', err.stack || err.message));
page.on('response', async res => {
  const url = res.url();
  if (url.includes('supabase.co')) console.log('response:', res.status(), url);
});
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 15000 }).catch(err => console.log('goto-error:', err.message));
console.log('body:', JSON.stringify(await page.locator('body').innerText().catch(() => '')));
await browser.close();
