import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const siteDir = path.join(root, 'site');
const dataDir = path.join(root, 'test/e2e/data');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let server, base, browser;

before(async () => {
  server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const isData = pathname.startsWith('/data/');
    const dir = isData ? dataDir : siteDir;
    const rel = isData ? pathname.slice(6) : (pathname === '/' ? 'index.html' : pathname.slice(1));
    const file = path.join(dir, rel);
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {};
  browser = await chromium.launch(opts);
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

async function openPage({ width = 1280, colorScheme = 'light', routes = {} } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await context.route(/facebook\.(com|net)/, (r) => r.abort());
  for (const [pattern, handler] of Object.entries(routes)) await page.route(new RegExp(pattern), handler);
  await page.goto(base);
  await page.waitForSelector('#h-events'); // the list cards are rendered together after all data loads
  return { context, page, requests, errors };
}

test('shows six Finnish cards in order', async () => {
  const { context, page } = await openPage();
  const headings = await page.locator('h2').allTextContents();
  assert.deepEqual(headings, ['Kuulutukset', 'Uutiset', 'Tapahtumat', 'Facebook', 'Instagram', 'LinkedIn']);
  assert.equal(await page.getAttribute('html', 'lang'), 'fi');
  await context.close();
});

test('list card shows 5 items and expands to the real count', async () => {
  const { context, page } = await openPage();
  const card = page.locator('section.card', { has: page.locator('#h-notices') });
  assert.equal(await card.locator('li.item:visible').count(), 5);
  const button = card.locator('button.expand');
  assert.equal((await button.textContent()).trim(), 'Näytä lisää (10)');
  await button.click();
  assert.equal(await card.locator('li.item:visible').count(), 10);
  assert.equal(await button.getAttribute('aria-expanded'), 'true');
  await button.click();
  assert.equal(await card.locator('li.item:visible').count(), 5);
  await context.close();
});

test('real count is shown when fewer than 10 exist', async () => {
  const { context, page } = await openPage();
  const card = page.locator('section.card', { has: page.locator('#h-events') });
  assert.equal((await card.locator('button.expand').textContent()).trim(), 'Näytä lisää (8)');
  await card.locator('button.expand').click();
  assert.equal(await card.locator('li.item:visible').count(), 8);
  await context.close();
});

test('no button when 5 or fewer items', async () => {
  const { context, page } = await openPage();
  const card = page.locator('section.card', { has: page.locator('#h-news') });
  assert.equal(await card.locator('button.expand').count(), 0);
  assert.equal(await card.locator('li.item').count(), 5);
  await context.close();
});

test('dates use Finnish format and events show the venue', async () => {
  const { context, page } = await openPage();
  const first = page.locator('section.card', { has: page.locator('#h-events') }).locator('li.item').first();
  assert.match(await first.locator('.meta').textContent(), /^\d{1,2}\.\d{1,2}\.\d{4} · Kuopion tori$/);
  await context.close();
});

test('source text is never executed as html', async () => {
  const { context, page } = await openPage();
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('img[src="x"]').count(), 0);
  const text = await page.locator('section.card', { has: page.locator('#h-notices') }).locator('li.item a').first().textContent();
  assert.ok(text.startsWith('<img src=x'));
  await context.close();
});

test('every card links to its source', async () => {
  const { context, page } = await openPage();
  const hrefs = await page.locator('a.source-link').evaluateAll((as) => as.map((a) => a.href));
  assert.deepEqual(hrefs, [
    'https://www.kuopio.fi/kuopionkaupunki/paatoksenteko/ilmoitustaulu/',
    'https://www.kuopio.fi/uutisarkisto/',
    'https://www.hellokuopio.fi/tapahtumat/tapahtumakalenteri/',
  ]);
  await context.close();
});

test('stale data shows a warning and keeps the items', async () => {
  const stale = JSON.parse(await readFile(path.join(dataDir, 'news.json'), 'utf8'));
  stale.stale = true;
  const { context, page } = await openPage({
    routes: { 'data/news\\.json': (r) => r.fulfill({ json: stale }) },
  });
  const card = page.locator('section.card', { has: page.locator('#h-news') });
  assert.match(await card.locator('.notice-stale').textContent(), /^Tiedot voivat olla vanhentuneita, viimeksi päivitetty \d{1,2}\.\d{1,2}\.\d{4} klo \d{2}\.\d{2}\.$/);
  assert.equal(await card.locator('li.item').count(), 5);
  await context.close();
});

test('a failed source shows the fallback and does not affect others', async () => {
  const { context, page } = await openPage({
    routes: { 'data/events\\.json': (r) => r.abort() },
  });
  const events = page.locator('section.card', { has: page.locator('#h-events') });
  assert.match(await events.locator('.notice-empty').textContent(), /^Tietoja ei saatu haettua\./);
  assert.equal(await events.locator('.notice-empty a').getAttribute('href'), 'https://www.hellokuopio.fi/tapahtumat/tapahtumakalenteri/');
  const news = page.locator('section.card', { has: page.locator('#h-news') });
  assert.equal(await news.locator('li.item').count(), 5);
  await context.close();
});

test('facebook is not contacted before the click', async () => {
  const { context, page, requests } = await openPage();
  assert.equal(requests.filter((u) => /facebook/.test(u)).length, 0);
  assert.equal(await page.locator('iframe').count(), 0);
  await page.click('#fb-load');
  const src = await page.locator('iframe.fb-frame').getAttribute('src');
  assert.match(src, /^https:\/\/www\.facebook\.com\/plugins\/page\.php\?/);
  assert.ok(src.includes('tabs=timeline'));
  assert.ok(src.includes('locale=fi_FI'));
  await context.close();
});

test('instagram and linkedin are plain links', async () => {
  const { context, page } = await openPage();
  const hrefs = await page.locator('a.profile-link').evaluateAll((as) => as.map((a) => a.href));
  assert.ok(hrefs.includes('https://www.instagram.com/kuopionkaupunki/'));
  assert.ok(hrefs.includes('https://fi.linkedin.com/company/city-of-kuopio'));
  await context.close();
});

test('footer carries the unofficial disclaimer', async () => {
  const { context, page } = await openPage();
  const text = await page.locator('footer.site-footer').textContent();
  assert.ok(text.includes('Epävirallinen palvelu. Tiedot haetaan Kuopion kaupungin julkisilta sivuilta.'));
  await context.close();
});

test('no console errors and no horizontal scroll on a phone', async () => {
  const { context, page, errors } = await openPage({ width: 390 });
  assert.deepEqual(errors.filter((e) => !/facebook|ERR_FAILED/i.test(e)), []);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `horizontal overflow of ${overflow}px`);
  await context.close();
});

test('expand button works from the keyboard', async () => {
  const { context, page } = await openPage();
  const card = page.locator('section.card', { has: page.locator('#h-notices') });
  await card.locator('button.expand').focus();
  await page.keyboard.press('Enter');
  assert.equal(await card.locator('li.item:visible').count(), 10);
  await context.close();
});

test('list items carry their stable id', async () => {
  const { context, page } = await openPage();
  const ids = await page.locator('li.item').evaluateAll((lis) => lis.map((li) => li.dataset.itemId));
  assert.equal(ids.length, 23);
  assert.ok(ids.every(Boolean));
  assert.equal(new Set(ids).size, ids.length);
  await context.close();
});

test('stores no personal data in the browser', async () => {
  const { context, page } = await openPage();
  assert.deepEqual(await context.cookies(), []);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await context.close();
});

for (const colorScheme of ['light', 'dark']) {
  test(`axe finds no serious or critical issues (${colorScheme})`, async () => {
    const { context, page } = await openPage({ colorScheme });
    const result = await new AxeBuilder({ page }).analyze();
    const bad = result.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    assert.deepEqual(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), []);
    await context.close();
  });
}
