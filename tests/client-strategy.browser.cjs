const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let failed = true, admin = false, posts = 0;
    let result = { currentId: null, busyUntil: null, versions: [], aiReady: true };
    const version = { id: '11111111-1111-4111-8111-111111111111', kind: 'initial', base_id: null, content: 'Shared strategy <script>unsafe</script>', citations: [], created_at: new Date().toISOString(), created_by: 'Joe', submission_id: '123' };
    await page.route('https://strategy.test/**', route => {
      if (!route.request().url().includes('/api/')) return route.fulfill({ body: '<button data-build-strategy="123">Open strategy</button>' });
      if (failed) return route.fulfill({ status: 503, json: { message: 'Storage unavailable' } });
      if (route.request().method() === 'POST') { posts++; result.versions = [version]; }
      return route.fulfill({ json: { ...result, canApprove: admin } });
    });
    await page.goto('https://strategy.test');
    await page.evaluate(() => {
      window.state = { clients: [{ id: 'client1', name: 'Test Artist' }] };
      window.escapeHtml = v => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
      window.getRequestHeaders = () => ({ 'Content-Type': 'application/json' });
      window.parseJsonResponse = r => r.json();
    });
    await page.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../portal.css'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../client-strategy.js'), 'utf8') });
    await page.getByText('Open strategy').click();
    await page.locator('[data-strategy-client]').selectOption('client1');
    await page.getByText('Storage unavailable', { exact: true }).waitFor();
    failed = false;
    await page.getByText('Retry loading shared plan').click();
    await page.getByText('Build Client Strategy', { exact: true }).click();
    await page.getByText('Shared strategy <script>unsafe</script>', { exact: true }).waitFor();
    assert.equal(posts, 1);
    assert.equal(await page.locator('[data-strategy-approve]').count(), 0);
    assert.equal(await page.locator('[data-strategy-action="initial"]').count(), 0);
    assert.equal(await page.locator('.strategy-copy script').count(), 0);
    admin = true;
    await page.getByText('Refresh shared plan', { exact: true }).click();
    await page.getByText('Approve as Current Plan', { exact: true }).waitFor();
    result.currentId = version.id; version.approved_at = new Date().toISOString(); version.approved_by = 'Max';
    await page.getByText('Refresh shared plan', { exact: true }).click();
    await page.getByText('Create client-facing draft', { exact: true }).waitFor();
    await page.getByText('Explore another approach', { exact: true }).click();
    assert.equal(posts, 1, 'empty direction must not generate');
    result.busyUntil = new Date(Date.now() + 180000).toISOString();
    await page.getByText('Refresh shared plan', { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-strategy-action="alternative"]').disabled);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await page.evaluate(() => { const d = document.querySelector('dialog'); return d.scrollWidth <= d.clientWidth + 1; }), `${theme} dialog overflow`);
    }
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    assert(await page.getByText('Open strategy').evaluate(el => document.activeElement === el));
    assert.deepEqual(errors, []);
    console.log('PASS: retry, one shared draft, role controls, escaped output, approval state, required direction, busy state, mobile themes, focus return.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
