# Kuopio Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Finnish-language GitHub Pages dashboard of City of Kuopio notices, news and events, refreshed every 30 minutes by a scheduled GitHub Actions job.

**Architecture:** Node scripts fetch three sources, normalize them to one JSON shape and write `site/data/*.json`. A static page (Bulma plus about 100 lines of CSS, plain JavaScript) fetches those files on every load and renders cards. GitHub Actions tests, builds and deploys `site/` as a Pages artifact. Nothing is committed back.

**Tech Stack:** Node 22 (ES modules, built-in test runner), cheerio, fast-xml-parser, iconv-lite, Bulma, Playwright, @axe-core/playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-05-kuopio-dashboard-design.md`

## Global Constraints

- All visible UI text is Finnish. `<html lang="fi">`.
- Node `>=20`, ES modules (`"type": "module"`). The workflow uses Node 22.
- Runtime dependencies: `cheerio`, `fast-xml-parser`, `iconv-lite` only. No other runtime dependency.
- Maximum 10 items per source file. List cards show 5 items collapsed. The button shows the real item count.
- Allowed link hosts: `kuopio.fi`, `www.kuopio.fi`, `hellokuopio.fi`, `www.hellokuopio.fi`, `kuopio.oncloudos.com`. Protocol must be `https:`.
- User-Agent for all requests: `kuopio-web/1.0 (+https://github.com/klyytine/kuopio-web)`.
- Fetch rules: 20 s timeout, 2 retries, 5 s pause, one request per source per run, sources fetched one after another.
- Source text is inserted into the page with `textContent` only. Never `innerHTML` with source data.
- No city logo. Footer text: `Epävirallinen palvelu. Tiedot haetaan Kuopion kaupungin julkisilta sivuilta.`
- No third-party CDN at runtime. Bulma is copied into `site/vendor/`.
- Third-party GitHub Actions are pinned to a commit SHA. Workflow permissions: `contents: read`, `pages: write`, `id-token: write`.
- Social profile URLs: Facebook `https://www.facebook.com/kuopionkaupunki/`, Instagram `https://www.instagram.com/kuopionkaupunki/`, LinkedIn `https://fi.linkedin.com/company/city-of-kuopio`.
- No dashes (em or en) and no emojis in any file you write, including comments and Finnish copy. Use commas, periods or parentheses.
- Every commit message ends with these two lines, after a blank line:
  ```
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Dp86c5px88KTBjJk7LFMrt
  ```
- Working directory for all tasks: `/home/user/kuopio-web` (git repo, branch `main`, remote `origin` = `https://github.com/klyytine/kuopio-web`, remote is empty at plan time).
- Do not create the GitHub repo or change repo visibility. It exists and is private.

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `package-lock.json`, `.gitignore` | Project metadata, scripts, locked deps |
| `scripts/lib/http.mjs` | `fetchWithRetry`: timeout, retry, user agent |
| `scripts/lib/normalize.mjs` | `stripHtml`, `truncate`, `toIsoDate`, `parseFiDate` |
| `scripts/lib/validate.mjs` | `ALLOWED_HOSTS`, `validateItems` |
| `scripts/lib/merge.mjs` | `mergeResult`: success, stale, empty results |
| `scripts/sources/news.mjs` | RSS to items |
| `scripts/sources/events.mjs` | Tribe Events JSON to items |
| `scripts/sources/notices.mjs` | Cloudos HTML table to items |
| `scripts/build.mjs` | Run all sources, merge with last-good, write JSON, exit code |
| `scripts/audit-data.mjs` | Read-only checks of `site/data/*.json` for the audit phase |
| `site/index.html`, `site/app.js`, `site/styles.css` | The page |
| `site/vendor/bulma.min.css` | Vendored Bulma |
| `test/*.test.mjs`, `test/fixtures/*` | Unit tests and saved real responses |
| `test/e2e/*.spec.mjs`, `test/e2e/data/*.json` | Browser tests with sample data |
| `.github/workflows/deploy.yml` | Test, build, deploy on schedule |
| `README.md`, `docs/audit/README.md` | Short docs, audit handoff |

---

### Task 1: Scaffold, dependencies, first push

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`
- Modify: none

**Interfaces:**
- Produces: npm scripts `test`, `test:e2e`, `build`, `audit:data`; installed dependencies; `origin/main` exists.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "kuopio-web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test test/*.test.mjs",
    "test:e2e": "node --test --test-concurrency=1 test/e2e/*.spec.mjs",
    "build": "node scripts/build.mjs",
    "audit:data": "node scripts/audit-data.mjs"
  }
}
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
site/data/
test-results/
```

- [ ] **Step 3: Write `README.md`**

```markdown
# kuopio-web

Epävirallinen ilmoitustaulu Kuopion kaupungin tiedoista. Tiedot haetaan julkisilta sivuilta GitHub Actionsilla 30 minuutin välein.

Unofficial dashboard of City of Kuopio notices, news and events. Data is fetched from public pages by a scheduled GitHub Actions job and published on GitHub Pages.

## Commands

- `npm ci` install
- `npm test` unit tests
- `npm run test:e2e` browser tests (needs Chromium)
- `npm run build` fetch sources and write `site/data/*.json`

Design: `docs/superpowers/specs/2026-11-05-kuopio-dashboard-design.md`
```

- [ ] **Step 4: Install dependencies**

Run:
```bash
npm install cheerio fast-xml-parser iconv-lite
npm install --save-dev playwright @axe-core/playwright bulma
```
Expected: `package-lock.json` created, no error. Run `npm ls --depth=0` and confirm the six packages are listed.

- [ ] **Step 5: Commit and push**

```bash
git add package.json package-lock.json .gitignore README.md
git commit -m "chore: scaffold project

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dp86c5px88KTBjJk7LFMrt"
git push -u origin main
```
Expected: push succeeds. If it fails with an authentication error, stop and report to the user. Do not try other credentials.

- [ ] **Step 6: Check whether Pages can be enabled for this private repo**

Run:
```bash
gh api -X POST repos/klyytine/kuopio-web/pages -f build_type=workflow 2>&1 | head -20
```
Expected: JSON describing the Pages site, or an error. If the error says Pages is not available for private repositories on the current plan, stop and report it to the user. The options are making the repo public or upgrading the plan. Do not choose for the user. If the error is only authentication, ask the user to open the repo Settings, Pages, Source, and choose GitHub Actions.

---

### Task 2: Library modules (http, normalize, validate, merge)

**Files:**
- Create: `scripts/lib/http.mjs`, `scripts/lib/normalize.mjs`, `scripts/lib/validate.mjs`, `scripts/lib/merge.mjs`
- Test: `test/http.test.mjs`, `test/normalize.test.mjs`, `test/validate.test.mjs`, `test/merge.test.mjs`

**Interfaces:**
- Produces:
  - `fetchWithRetry(url: string, opts?: { as?: 'text'|'json'|'buffer', timeoutMs?: number, retries?: number, pauseMs?: number, fetchImpl?: Function, sleep?: (ms:number)=>Promise<void> }): Promise<string|object|Buffer>` (throws `Error` after all attempts)
  - `stripHtml(html: string): string`
  - `truncate(text: string, max: number): string`
  - `toIsoDate(value: string|Date|undefined): string|null` (date in Europe/Helsinki, `YYYY-MM-DD`)
  - `parseFiDate(text: string): string|null` (first `dd.mm.yyyy` in text, as `YYYY-MM-DD`)
  - `ALLOWED_HOSTS: Set<string>`
  - `validateItems(items: unknown): { ok: boolean, reason?: string }`
  - `mergeResult({ source: {id,title,sourceUrl}, prev: object|null, items?: Item[], error?: Error, now: Date }): SourceFile`
  - `Item = { title: string, url: string, date: string|null, summary?: string, venue?: string }`
  - `SourceFile = { id, title, sourceUrl, updated: string|null, stale: boolean, failures: number, items: Item[] }`

- [ ] **Step 1: Write failing tests**

`test/normalize.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml, truncate, toIsoDate, parseFiDate } from '../scripts/lib/normalize.mjs';

test('stripHtml removes tags and decodes entities', () => {
  assert.equal(stripHtml('<p>Kahvi &amp; <b>pulla</b></p>'), 'Kahvi & pulla');
});
test('stripHtml collapses whitespace', () => {
  assert.equal(stripHtml('a \n\n  b'), 'a b');
});
test('stripHtml handles undefined', () => {
  assert.equal(stripHtml(undefined), '');
});
test('truncate shortens with ellipsis', () => {
  assert.equal(truncate('abcdefghij', 5), 'abcd…');
  assert.equal(truncate('abc', 5), 'abc');
});
test('toIsoDate uses Helsinki time', () => {
  assert.equal(toIsoDate('2026-11-04T23:30:00Z'), '2026-11-05');
  assert.equal(toIsoDate('Wed, 05 Nov 2026 10:00:00 +0000'), '2026-11-05');
});
test('toIsoDate returns null for garbage', () => {
  assert.equal(toIsoDate('not a date'), null);
  assert.equal(toIsoDate(undefined), null);
});
test('parseFiDate reads the first date', () => {
  assert.equal(parseFiDate('05.11.2026 - 14.12.2026'), '2026-11-05');
  assert.equal(parseFiDate('5.1.2026'), '2026-01-05');
  assert.equal(parseFiDate('ei päivää'), null);
});
```

`test/validate.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateItems } from '../scripts/lib/validate.mjs';

const good = { title: 'A', url: 'https://www.kuopio.fi/x', date: '2026-11-05' };

test('accepts valid items', () => {
  assert.deepEqual(validateItems([good]), { ok: true });
});
test('rejects empty or non-array', () => {
  assert.equal(validateItems([]).ok, false);
  assert.equal(validateItems(null).ok, false);
});
test('rejects missing title', () => {
  assert.equal(validateItems([{ ...good, title: '' }]).ok, false);
});
test('rejects http and foreign hosts', () => {
  assert.equal(validateItems([{ ...good, url: 'http://www.kuopio.fi/x' }]).ok, false);
  assert.equal(validateItems([{ ...good, url: 'https://evil.example/x' }]).ok, false);
  assert.equal(validateItems([{ ...good, url: 'not a url' }]).ok, false);
});
test('accepts cloudos host', () => {
  assert.equal(validateItems([{ ...good, url: 'https://kuopio.oncloudos.com/cgi/a' }]).ok, true);
});
```

`test/merge.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeResult } from '../scripts/lib/merge.mjs';

const source = { id: 'news', title: 'Uutiset', sourceUrl: 'https://www.kuopio.fi/uutisarkisto/' };
const now = new Date('2026-11-05T12:00:00Z');
const items = [{ title: 'A', url: 'https://www.kuopio.fi/a', date: '2026-11-05' }];
const prev = { id: 'news', title: 'Uutiset', sourceUrl: source.sourceUrl, updated: '2026-11-05T10:00:00.000Z', stale: false, failures: 0, items };

test('success resets stale and failures', () => {
  const out = mergeResult({ source, prev: { ...prev, failures: 2, stale: true }, items, now });
  assert.equal(out.stale, false);
  assert.equal(out.failures, 0);
  assert.equal(out.updated, now.toISOString());
  assert.deepEqual(out.items, items);
});
test('failure keeps previous items and marks stale', () => {
  const out = mergeResult({ source, prev, error: new Error('x'), now });
  assert.equal(out.stale, true);
  assert.equal(out.failures, 1);
  assert.equal(out.updated, prev.updated);
  assert.deepEqual(out.items, items);
});
test('failure increments existing failures', () => {
  const out = mergeResult({ source, prev: { ...prev, failures: 2, stale: true }, error: new Error('x'), now });
  assert.equal(out.failures, 3);
});
test('failure without previous gives empty stale file', () => {
  const out = mergeResult({ source, prev: null, error: new Error('x'), now });
  assert.deepEqual(out.items, []);
  assert.equal(out.stale, true);
  assert.equal(out.failures, 1);
  assert.equal(out.updated, null);
});
test('corrupt previous is treated as absent', () => {
  for (const bad of [{ id: 'other', items: [] }, { id: 'news', items: 'x' }, 'text', 42]) {
    const out = mergeResult({ source, prev: bad, error: new Error('x'), now });
    assert.deepEqual(out.items, []);
    assert.equal(out.failures, 1);
  }
});
```

`test/http.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry } from '../scripts/lib/http.mjs';

const noSleep = async () => {};

test('returns text body', async () => {
  const fetchImpl = async () => new Response('hei', { status: 200 });
  assert.equal(await fetchWithRetry('https://x.test', { fetchImpl, sleep: noSleep }), 'hei');
});
test('returns parsed json', async () => {
  const fetchImpl = async () => new Response('{"a":1}', { status: 200 });
  assert.deepEqual(await fetchWithRetry('https://x.test', { as: 'json', fetchImpl, sleep: noSleep }), { a: 1 });
});
test('returns buffer', async () => {
  const fetchImpl = async () => new Response(new Uint8Array([0xe4, 0xf6]), { status: 200 });
  const buf = await fetchWithRetry('https://x.test', { as: 'buffer', fetchImpl, sleep: noSleep });
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.length, 2);
});
test('retries then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => (++calls < 3 ? new Response('no', { status: 500 }) : new Response('ok', { status: 200 }));
  assert.equal(await fetchWithRetry('https://x.test', { fetchImpl, sleep: noSleep }), 'ok');
  assert.equal(calls, 3);
});
test('throws after all attempts', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response('no', { status: 500 }); };
  await assert.rejects(fetchWithRetry('https://x.test', { fetchImpl, sleep: noSleep }), /3 attempts/);
  assert.equal(calls, 3);
});
test('aborts on timeout', async () => {
  const fetchImpl = (url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  await assert.rejects(
    fetchWithRetry('https://x.test', { fetchImpl, timeoutMs: 20, retries: 0, sleep: noSleep }),
    /1 attempts/
  );
});
test('sends the user agent', async () => {
  let ua;
  const fetchImpl = async (url, { headers }) => { ua = headers['user-agent']; return new Response('ok'); };
  await fetchWithRetry('https://x.test', { fetchImpl, sleep: noSleep });
  assert.match(ua, /^kuopio-web\/1\.0 \(\+https:\/\/github\.com\/klyytine\/kuopio-web\)$/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the four lib modules.

- [ ] **Step 3: Implement the modules**

`scripts/lib/normalize.mjs`:
```js
import { load } from 'cheerio';

export function stripHtml(html) {
  if (html === undefined || html === null) return '';
  const $ = load(String(html), null, false);
  return $.text().replace(/\s+/g, ' ').trim();
}

export function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

const helsinkiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Helsinki',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function toIsoDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return helsinkiDate.format(d);
}

export function parseFiDate(text) {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(text ?? ''));
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
```

`scripts/lib/validate.mjs`:
```js
export const ALLOWED_HOSTS = new Set([
  'kuopio.fi',
  'www.kuopio.fi',
  'hellokuopio.fi',
  'www.hellokuopio.fi',
  'kuopio.oncloudos.com',
]);

export function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, reason: 'no items' };
  for (const [i, item] of items.entries()) {
    if (!item || typeof item.title !== 'string' || item.title.trim() === '') {
      return { ok: false, reason: `item ${i} has no title` };
    }
    let url;
    try {
      url = new URL(item.url);
    } catch {
      return { ok: false, reason: `item ${i} has an invalid url` };
    }
    if (url.protocol !== 'https:') return { ok: false, reason: `item ${i} is not https` };
    if (!ALLOWED_HOSTS.has(url.hostname)) return { ok: false, reason: `item ${i} host ${url.hostname} not allowed` };
  }
  return { ok: true };
}
```

`scripts/lib/merge.mjs`:
```js
function usable(prev, id) {
  return prev && typeof prev === 'object' && prev.id === id && Array.isArray(prev.items);
}

export function mergeResult({ source, prev, items, error, now }) {
  const base = { id: source.id, title: source.title, sourceUrl: source.sourceUrl };
  if (!error) {
    return { ...base, updated: now.toISOString(), stale: false, failures: 0, items };
  }
  if (usable(prev, source.id)) {
    return {
      ...base,
      updated: prev.updated ?? null,
      stale: true,
      failures: (Number.isInteger(prev.failures) ? prev.failures : 0) + 1,
      items: prev.items,
    };
  }
  return { ...base, updated: null, stale: true, failures: 1, items: [] };
}
```

`scripts/lib/http.mjs`:
```js
const USER_AGENT = 'kuopio-web/1.0 (+https://github.com/klyytine/kuopio-web)';

export async function fetchWithRetry(
  url,
  {
    as = 'text',
    timeoutMs = 20000,
    retries = 2,
    pauseMs = 5000,
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}
) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(pauseMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: '*/*' },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      if (as === 'json') return await res.json();
      if (as === 'buffer') return Buffer.from(await res.arrayBuffer());
      return await res.text();
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`fetch failed after ${retries + 1} attempts: ${lastError.message}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib test/*.test.mjs
git commit -m "feat: add http, normalize, validate and merge libraries

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dp86c5px88KTBjJk7LFMrt"
```

---

### Task 3: Fixtures and the news source

**Files:**
- Create: `test/fixtures/news.xml`, `test/fixtures/events.json`, `test/fixtures/notices.html`, `scripts/sources/news.mjs`
- Test: `test/news.test.mjs`

**Interfaces:**
- Consumes: `fetchWithRetry`, `stripHtml`, `truncate`, `toIsoDate`
- Produces: `scripts/sources/news.mjs` exports `id = 'news'`, `title = 'Uutiset'`, `sourceUrl`, `parseNews(xml: string): Item[]`, `fetchItems({ fetchImpl }): Promise<Item[]>`. The same export shape (`id`, `title`, `sourceUrl`, `fetchItems`) is used by tasks 4 and 5.

- [ ] **Step 1: Capture the three real responses as fixtures**

Run:
```bash
mkdir -p test/fixtures
UA="kuopio-web/1.0 (+https://github.com/klyytine/kuopio-web)"
curl -sS -L -m 30 -A "$UA" -o test/fixtures/news.xml "https://www.kuopio.fi/uutisarkisto/feed/"
curl -sS -L -m 30 -A "$UA" -o test/fixtures/events.json "https://www.hellokuopio.fi/wp-json/tribe/events/v1/events?per_page=10&start_date=now"
curl -sS -L -m 30 -A "$UA" -o test/fixtures/notices.html "https://kuopio.oncloudos.com/cgi/DREQUEST.PHP?alo=1&page=announcement_search&tzo=-180"
ls -l test/fixtures
grep -c "<item>" test/fixtures/news.xml
grep -c "trDat" test/fixtures/notices.html
python3 -I -c "import json;print(len(json.load(open('test/fixtures/events.json'))['events']))"
```
Expected: three non-empty files; at least 1 `<item>`, at least 1 `trDat`, at least 1 event. If a fetch is blocked by the network policy, stop and report the host.

- [ ] **Step 2: Write the failing test**

`test/news.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNews, fetchItems } from '../scripts/sources/news.mjs';
import { validateItems } from '../scripts/lib/validate.mjs';

const xml = readFileSync(new URL('./fixtures/news.xml', import.meta.url), 'utf8');

test('parses the fixture into valid items', () => {
  const items = parseNews(xml);
  assert.ok(items.length >= 1 && items.length <= 10);
  assert.deepEqual(validateItems(items), { ok: true });
  for (const item of items) {
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!/[<>]/.test(item.title));
    assert.ok(item.summary.length <= 200);
  }
});
test('handles a single item (parser returns object, not array)', () => {
  const one = `<rss><channel><item><title>A</title><link>https://www.kuopio.fi/a</link><pubDate>Wed, 05 Nov 2026 10:00:00 +0000</pubDate><description><![CDATA[<p>x</p>]]></description></item></channel></rss>`;
  const items = parseNews(one);
  assert.equal(items.length, 1);
  assert.equal(items[0].summary, 'x');
});
test('empty or broken xml gives no items', () => {
  assert.deepEqual(parseNews('<rss><channel></channel></rss>'), []);
  assert.deepEqual(parseNews('not xml'), []);
});
test('fetchItems uses the feed url', async () => {
  let requested;
  const fetchImpl = async (url) => { requested = url; return new Response(xml); };
  const items = await fetchItems({ fetchImpl });
  assert.equal(requested, 'https://www.kuopio.fi/uutisarkisto/feed/');
  assert.ok(items.length >= 1);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test test/news.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `scripts/sources/news.mjs`**

```js
import { XMLParser } from 'fast-xml-parser';
import { fetchWithRetry } from '../lib/http.mjs';
import { stripHtml, truncate, toIsoDate } from '../lib/normalize.mjs';

export const id = 'news';
export const title = 'Uutiset';
export const sourceUrl = 'https://www.kuopio.fi/uutisarkisto/';
const FEED_URL = 'https://www.kuopio.fi/uutisarkisto/feed/';

export function parseNews(xml) {
  let doc;
  try {
    doc = new XMLParser({ ignoreAttributes: true }).parse(xml);
  } catch {
    return [];
  }
  const raw = doc?.rss?.channel?.item ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.slice(0, 10).map((i) => ({
    title: stripHtml(String(i.title ?? '')),
    url: String(i.link ?? '').trim(),
    date: toIsoDate(i.pubDate),
    summary: truncate(stripHtml(String(i.description ?? '')), 200),
  }));
}

export async function fetchItems({ fetchImpl } = {}) {
  const xml = await fetchWithRetry(FEED_URL, { fetchImpl });
  return parseNews(xml);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `node --test test/news.test.mjs`
Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add test/fixtures scripts/sources/news.mjs test/news.test.mjs
git commit -m "feat: add news source and capture fixtures

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dp86c5px88KTBjJk7LFMrt"
```

---

### Task 4: Events source

**Files:**
- Create: `scripts/sources/events.mjs`
- Test: `test/events.test.mjs`

**Interfaces:**
- Consumes: `fetchWithRetry`, `stripHtml`
- Produces: `scripts/sources/events.mjs` exports `id = 'events'`, `title = 'Tapahtumat'`, `sourceUrl`, `parseEvents(json: object): Item[]`, `fetchItems({ fetchImpl }): Promise<Item[]>`.

- [ ] **Step 1: Write the failing test**

`test/events.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEvents, fetchItems } from '../scripts/sources/events.mjs';
import { validateItems } from '../scripts/lib/validate.mjs';

const json = JSON.parse(readFileSync(new URL('./fixtures/events.json', import.meta.url), 'utf8'));

test('parses the fixture into valid items', () => {
  const items = parseEvents(json);
  assert.ok(items.length >= 1 && items.length <= 10);
  assert.deepEqual(validateItems(items), { ok: true });
  for (const item of items) {
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!/<[a-z]/i.test(item.title));
  }
});
test('dedupes by url', () => {
  const e = { title: 'A', url: 'https://www.hellokuopio.fi/tapahtuma/a/', start_date: '2026-11-05 17:00:00', venue: [] };
  assert.equal(parseEvents({ events: [e, { ...e }] }).length, 1);
});
test('builds venue text and tolerates empty venue', () => {
  const base = { title: 'A', url: 'https://www.hellokuopio.fi/tapahtuma/a/', start_date: '2026-11-05 17:00:00' };
  const withVenue = parseEvents({ events: [{ ...base, venue: { venue: 'Kuopion kaupunginteatteri', city: 'Kuopio' } }] });
  assert.equal(withVenue[0].venue, 'Kuopion kaupunginteatteri, Kuopio');
  const noVenue = parseEvents({ events: [{ ...base, venue: [] }] });
  assert.equal(noVenue[0].venue, undefined);
});
test('decodes entities in titles', () => {
  const e = { title: 'Kahvi &#8211; ja pulla &amp; mehu', url: 'https://www.hellokuopio.fi/tapahtuma/b/', start_date: '2026-11-06 10:00:00', venue: [] };
  assert.equal(parseEvents({ events: [e] })[0].title, 'Kahvi \u2013 ja pulla & mehu');
});
test('missing events key gives no items', () => {
  assert.deepEqual(parseEvents({}), []);
  assert.deepEqual(parseEvents(null), []);
});
test('fetchItems requests ten upcoming events', async () => {
  let requested;
  const fetchImpl = async (url) => { requested = url; return new Response(JSON.stringify(json)); };
  await fetchItems({ fetchImpl });
  assert.equal(requested, 'https://www.hellokuopio.fi/wp-json/tribe/events/v1/events?per_page=10&start_date=now');
});
```

Note: the test input uses the entity `&#8211;` and compares with the JavaScript escape `\u2013`, so no dash character is written to the file.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/events.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `scripts/sources/events.mjs`**

```js
import { fetchWithRetry } from '../lib/http.mjs';
import { stripHtml } from '../lib/normalize.mjs';

export const id = 'events';
export const title = 'Tapahtumat';
export const sourceUrl = 'https://www.hellokuopio.fi/tapahtumat/tapahtumakalenteri/';
const API_URL = 'https://www.hellokuopio.fi/wp-json/tribe/events/v1/events?per_page=10&start_date=now';

function venueText(venue) {
  if (!venue || Array.isArray(venue) || typeof venue !== 'object') return undefined;
  const text = [venue.venue, venue.city].filter(Boolean).map((v) => stripHtml(v)).join(', ');
  return text || undefined;
}

export function parseEvents(json) {
  const events = Array.isArray(json?.events) ? json.events : [];
  const seen = new Set();
  const items = [];
  for (const e of events) {
    const url = String(e.url ?? '').trim();
    if (seen.has(url)) continue;
    seen.add(url);
    const item = {
      title: stripHtml(String(e.title ?? '')),
      url,
      date: String(e.start_date ?? '').slice(0, 10) || null,
    };
    const venue = venueText(e.venue);
    if (venue) item.venue = venue;
    items.push(item);
    if (items.length === 10) break;
  }
  return items;
}

export async function fetchItems({ fetchImpl } = {}) {
  const json = await fetchWithRetry(API_URL, { as: 'json', fetchImpl });
  return parseEvents(json);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/events.test.mjs`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/sources/events.mjs test/events.test.mjs
git commit -m "feat: add events source

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dp86c5px88KTBjJk7LFMrt"
```

---

### Task 5: Notices source (Cloudos HTML, ISO-8859-1)

**Files:**
- Create: `scripts/sources/notices.mjs`
- Test: `test/notices.test.mjs`

**Interfaces:**
- Consumes: `fetchWithRetry` (`as: 'buffer'`), `parseFiDate`, `stripHtml`
- Produces: `scripts/sources/notices.mjs` exports `id = 'notices'`, `title = 'Ilmoitustaulu'`, `sourceUrl` (the kuopio.fi page, used for the "Avaa lähde" link), `parseNotices(buffer: Buffer): Item[]`, `fetchItems({ fetchImpl }): Promise<Item[]>`. The `summary` of an item holds the announcement prefix, for example `Kuulutus 2024/2026`.

- [ ] **Step 1: Write the failing test**

`test/notices.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNotices, fetchItems } from '../scripts/sources/notices.mjs';
import { validateItems } from '../scripts/lib/validate.mjs';

const buffer = readFileSync(new URL('./fixtures/notices.html', import.meta.url));

test('parses the fixture into valid items', () => {
  const items = parseNotices(buffer);
  assert.ok(items.length >= 1 && items.length <= 10);
  assert.deepEqual(validateItems(items), { ok: true });
  for (const item of items) {
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(item.url.startsWith('https://kuopio.oncloudos.com/cgi/DREQUEST.PHP?page=announcement&id='), item.url);
  }
});
test('decodes ISO-8859-1 without mojibake', () => {
  const items = parseNotices(buffer);
  const all = items.map((i) => i.title + ' ' + (i.summary ?? '')).join(' ');
  assert.ok(!all.includes('\u00c3'), 'found \u00c3, charset not decoded');
  assert.ok(!all.includes('\ufffd'), 'found replacement character');
  assert.ok(!all.includes('\u2044'), 'fraction slash not replaced');
});
test('is ordered newest first (display start date)', () => {
  const dates = parseNotices(buffer).map((i) => i.date);
  const sorted = [...dates].sort().reverse();
  assert.deepEqual(dates, sorted);
});
test('decodes a synthetic latin1 page', () => {
  const html = `<table><tr class='trDat '><td class='filetitle'><a href='../cgi/DREQUEST.PHP?page=announcement&id=1'><span class='prefix'>Kuulutus 1/2026</span>Lupapäätös &frasl; Kuopio</a></td><td>05.11.2026 - 14.12.2026</td></tr></table>`;
  const items = parseNotices(Buffer.from(html, 'latin1'));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Lupapäätös / Kuopio');
  assert.equal(items[0].summary, 'Kuulutus 1/2026');
  assert.equal(items[0].date, '2026-11-05');
  assert.equal(items[0].url, 'https://kuopio.oncloudos.com/cgi/DREQUEST.PHP?page=announcement&id=1');
});
test('rows without a link are skipped; empty page gives no items', () => {
  assert.deepEqual(parseNotices(Buffer.from('<table><tr class="trDat"><td>x</td></tr></table>')), []);
  assert.deepEqual(parseNotices(Buffer.from('')), []);
});
test('changed layout (no trDat rows) gives no items', () => {
  assert.deepEqual(parseNotices(Buffer.from('<div class="list"><a href="x">y</a></div>')), []);
});
test('fetchItems requests the announcement search', async () => {
  let requested;
  const fetchImpl = async (url) => { requested = url; return new Response(buffer); };
  const items = await fetchItems({ fetchImpl });
  assert.equal(requested, 'https://kuopio.oncloudos.com/cgi/DREQUEST.PHP?alo=1&page=announcement_search&tzo=-180');
  assert.ok(items.length >= 1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/notices.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `scripts/sources/notices.mjs`**

```js
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { fetchWithRetry } from '../lib/http.mjs';
import { parseFiDate } from '../lib/normalize.mjs';

export const id = 'notices';
export const title = 'Ilmoitustaulu';
export const sourceUrl = 'https://www.kuopio.fi/kuopionkaupunki/paatoksenteko/ilmoitustaulu/';
const LIST_URL = 'https://kuopio.oncloudos.com/cgi/DREQUEST.PHP?alo=1&page=announcement_search&tzo=-180';
const BASE = 'https://kuopio.oncloudos.com/cgi/';

function clean(text) {
  return text.replace(/\u2044/g, '/').replace(/\s+/g, ' ').trim();
}

export function parseNotices(buffer) {
  const html = iconv.decode(Buffer.from(buffer), 'iso-8859-1');
  const $ = cheerio.load(html);
  const items = [];
  $('tr.trDat').each((_, tr) => {
    if (items.length >= 10) return;
    const a = $(tr).find('td.filetitle a').first();
    const href = a.attr('href');
    if (!href) return;
    const prefix = clean(a.find('span.prefix').text());
    const titleText = clean(a.clone().find('span.prefix').remove().end().text());
    if (!titleText) return;
    const dateCell = $(tr).find('td').not('.filetitle').first().text();
    const item = {
      title: titleText,
      url: new URL(href, BASE).href,
      date: parseFiDate(dateCell),
    };
    if (prefix) item.summary = prefix;
    items.push(item);
  });
  return items;
}

export async function fetchItems({ fetchImpl } = {}) {
  const buffer = await fetchWithRetry(LIST_URL, { as: 'buffer', fetchImpl });
  return parseNotices(buffer);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/notices.test.mjs`
Expected: 7 tests PASS.

If the ordering test fails on the real fixture, do not loosen the assertion. Print `parseNotices(buffer).map(i => i.date)`, report the actual order to the user, and stop. The spec lists "newest first" as unverified, and this test is its verification.

- [ ] **Step 5: Commit**

```bash
git add scripts/sources/notices.mjs test/notices.test.mjs
git commit -m "feat: add notices source with latin1 decoding

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dp86c5px88KTBjJk7LFMrt"
```

---

### Task 6: Build script (merge, stale, exit code)

**Files:**
- Create: `scripts/build.mjs`
- Test: `test/build.test.mjs`

**Interfaces:**
- Consumes: source modules (`id`, `title`, `sourceUrl`, `fetchItems`), `validateItems`, `mergeResult`, `fetchWithRetry`
- Produces: `runBuild({ sources, outDir, previousBaseUrl?, fetchImpl?, now? }): Promise<SourceFile[]>` (always writes one `<id>.json` per source). CLI: `node scripts/build.mjs` writes `site/data/*.json`, reads env `PREVIOUS_BASE_URL`, exits 1 if any source has `failures >= 3`, and always writes all files first.

- [ ] **Step 1: Write the failing test**

`test/build.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuild } from '../scripts/build.mjs';

const item = { title: 'A', url: 'https://www.kuopio.fi/a', date: '2026-11-05' };
const mk = (id, fetchItems) => ({ id, title: id, sourceUrl: 'https://www.kuopio.fi/', fetchItems });
const now = new Date('2026-11-05T12:00:00Z');
const read = async (dir, id) => JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8'));

test('writes one file per source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-'));
  await runBuild({ sources: [mk('a', async () => [item]), mk('b', async () => [item])], outDir: dir, now });
  assert.equal((await read(dir, 'a')).items.length, 1);
  assert.equal((await read(dir, 'b')).stale, false);
});
test('a failing source does not stop the others', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-'));
  const failing = mk('bad', async () => { throw new Error('boom'); });
  await runBuild({ sources: [failing, mk('ok', async () => [item])], outDir: dir, now });
  assert.equal((await read(dir, 'bad')).stale, true);
  assert.equal((await read(dir, 'ok')).stale, false);
});
test('validation failure keeps previous local file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-'));
  await runBuild({ sources: [mk('a', async () => [item])], outDir: dir, now });
  await runBuild({ sources: [mk('a', async () => [])], outDir: dir, now: new Date('2026-11-05T13:00:00Z') });
  const out = await read(dir, 'a');
  assert.equal(out.items.length, 1);
  assert.equal(out.stale, true);
  assert.equal(out.failures, 1);
  assert.equal(out.updated, now.toISOString());
});
test('uses previous data from the live site when a base url is given', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-'));
  const prev = { id: 'a', title: 'a', sourceUrl: 'https://www.kuopio.fi/', updated: '2026-11-05T09:00:00.000Z', stale: false, failures: 2, items: [item] };
  let requested;
  const fetchImpl = async (url) => { requested = url; return new Response(JSON.stringify(prev)); };
  const results = await runBuild({
    sources: [mk('a', async () => { throw new Error('x'); })],
    outDir: dir, previousBaseUrl: 'https://example.test/kuopio-web', fetchImpl, now,
  });
  assert.equal(requested, 'https://example.test/kuopio-web/data/a.json');
  assert.equal(results[0].failures, 3);
  assert.deepEqual(results[0].items, [item]);
});
test('missing previous (404) is not an error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-'));
  const fetchImpl = async () => new Response('nope', { status: 404 });
  const results = await runBuild({
    sources: [mk('a', async () => [item])], outDir: dir,
    previousBaseUrl: 'https://example.test/kuopio-web', fetchImpl, now,
  });
  assert.equal(results[0].stale, false);
});
test('corrupt local previous file is ignored', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-'));
  await writeFile(join(dir, 'a.json'), '{not json');
  const results = await runBuild({ sources: [mk('a', async () => { throw new Error('x'); })], outDir: dir, now });
  assert.deepEqual(results[0].items, []);
  assert.equal(results[0].failures, 1);
});
```

Note on the 404 test: `fetchWithRetry` is called with `retries: 0` inside the build, so the test does not wait on the 5 s pause.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/build.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `scripts/build.mjs`**

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchWithRetry } from './lib/http.mjs';
import { validateItems } from './lib/validate.mjs';
import { mergeResult } from './lib/merge.mjs';

async function loadPrevious(id, outDir, previousBaseUrl, fetchImpl) {
  if (previousBaseUrl) {
    try {
      return await fetchWithRetry(`${previousBaseUrl}/data/${id}.json`, {
        as: 'json', retries: 0, timeoutMs: 10000, fetchImpl,
      });
    } catch {
      // first deploy or site unreachable: fall through to the local file
    }
  }
  try {
    return JSON.parse(await readFile(join(outDir, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

export async function runBuild({ sources, outDir, previousBaseUrl, fetchImpl = globalThis.fetch, now = new Date() }) {
  await mkdir(outDir, { recursive: true });
  const results = [];
  for (const source of sources) {
    const prev = await loadPrevious(source.id, outDir, previousBaseUrl, fetchImpl);
    let items;
    let error;
    try {
      items = await source.fetchItems({ fetchImpl });
      const check = validateItems(items);
      if (!check.ok) throw new Error(`validation failed: ${check.reason}`);
    } catch (err) {
      error = err;
      console.error(`[${source.id}] ${err.message}`);
    }
    const merged = mergeResult({ source, prev, items: error ? undefined : items, error, now });
    await writeFile(join(outDir, `${source.id}.json`), JSON.stringify(merged, null, 2) + '\n');
    results.push(merged);
  }
  return results;
}

async function main() {
  const sources = await Promise.all([
    import('./sources/notices.mjs'),
    import('./sources/news.mjs'),
    import('./sources/events.mjs'),
  ]);
  const results = await runBuild({
    sources,
    outDir: 'site/data',
    previousBaseUrl: process.env.PREVIOUS_BASE_URL || undefined,
  });
  for (const r of results) {
    console.log(`${r.id}: ${r.items.length} items, stale=${r.stale}, failures=${r.failures}`);
  }
  if (results.some((r) => r.failures >= 3)) {
    console.error('At least one source has failed 3 or more runs in a row.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/build.test.mjs && npm test`
Expected: all tests PASS.

- [ ] **Step 5: Live run, inspect the output**

Run: `npm run build && ls -l site/data && head -c 600 site/data/notices.json`
Expected: three files, each with items, `stale: false`, `failures: 0`. Open each file and compare the first item's title and URL with the live source page. Record what you saw in the commit message body. If a source is stale, stop and report.

- [ ] **Step 6: Commit**

```bash
git add scripts/build.mjs test/build.test.mjs
git commit -m "feat: add build script with last-good merge

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dp86c5px88KTBjJk7LFMrt"
```

---

### Task 7: Frontend (page, script, theme)

**Files:**
- Create: `site/index.html`, `site/app.js`, `site/styles.css`, `site/vendor/bulma.min.css`
- Modify: `docs/superpowers/specs/2026-11-05-kuopio-dashboard-design.md` (section 6, items 5 and 8)

**Interfaces:**
- Consumes: `site/data/<id>.json` with shape `SourceFile` (ids `notices`, `news`, `events`)
- Produces DOM contract used by task 8 tests:
  - Grid `#cards` (class `columns is-multiline`) with one `.column` per source, then `#social-column`.
  - Per list card: `section.card` containing `h2.card-header-title`, `a.source-link`, `ul.item-list > li.item`, optional `button.expand` (`aria-expanded`, `aria-controls`), optional `p.notice-stale` (`role="status"`), optional `p.notice-empty`, `p.updated`.
  - Items 6 and later carry the `hidden` attribute while collapsed.
  - Social card: `button#fb-load`, container `#fb-slot`, links `a.profile-link` for Instagram and LinkedIn.

- [ ] **Step 1: Vendor Bulma**

Run:
```bash
mkdir -p site/vendor
ls node_modules/bulma/css/
cp node_modules/bulma/css/bulma.min.css site/vendor/bulma.min.css
ls -l site/vendor/bulma.min.css
```
Expected: the file exists and is larger than 100 KB. If `bulma.min.css` is not in `node_modules/bulma/css/`, list the directory and copy the minified full stylesheet that is there, then note the path in the commit message.

- [ ] **Step 2: Read the city's primary color (do not guess it)**

Run:
```bash
curl -sS -L -m 30 -A "kuopio-web/1.0 (+https://github.com/klyytine/kuopio-web)" "https://www.kuopio.fi/app/themes/kuopio/assets/dist/main.css" -o /tmp/kuopio-main.css
grep -o '\.has-background-primary{[^}]*}' /tmp/kuopio-main.css | head -3
grep -o '\.has-text-primary{[^}]*}' /tmp/kuopio-main.css | head -3
grep -o '\-\-[a-z-]*primary[a-z-]*:[^;}]*' /tmp/kuopio-main.css | sort -u | head -10
```
Expected: at least one color value. Pick the hex of `.has-text-primary` (or the primary variable). Save it in a shell variable: `PRIMARY='#xxxxxx'`. If nothing is found or the file cannot be fetched, stop and report to the user. Do not invent a color.

- [ ] **Step 3: Check the color is usable for links**

Run (replace the hex with the value found):
```bash
PRIMARY='#xxxxxx'
node -e "
const hex=process.argv[1];
const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
const L=h=>{const n=parseInt(h.slice(1),16);return 0.2126*lin(n>>16&255)+0.7152*lin(n>>8&255)+0.0722*lin(n&255)};
const ratio=(a,b)=>{const [x,y]=[L(a),L(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05)};
console.log('on white', ratio(hex,'#ffffff').toFixed(2));
" "$PRIMARY"
```
Expected: ratio 4.5 or higher. If lower, use `color-mix(in srgb, var(--primary) 70%, black)` as `--link` in step 4 and keep `--primary` for borders only. Record the ratio in the commit message.

- [ ] **Step 4: Write `site/styles.css`**

Write the file, then replace the token with the color from step 2:
```css
:root {
  --primary: __PRIMARY__;
  --link: var(--primary);
  --bg: #f5f6f8;
  --surface: #ffffff;
  --text: #1c2024;
  --muted: #5a626b;
  --border: #d9dde2;
}
@media (prefers-color-scheme: dark) {
  :root {
    --link: color-mix(in srgb, var(--primary) 55%, white);
    --bg: #14171a;
    --surface: #1d2126;
    --text: #e8eaed;
    --muted: #aab1b9;
    --border: #343a41;
  }
}
html { background: var(--bg); }
body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--link); }
a:focus-visible, button:focus-visible { outline: 3px solid var(--link); outline-offset: 2px; }
.site-header { padding: 1.5rem 0 0.5rem; }
.site-header h1 { font-size: 1.75rem; font-weight: 700; margin: 0; }
.site-header p { color: var(--muted); margin: 0.25rem 0 0; }
.card { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-top: 4px solid var(--primary); box-shadow: none; height: 100%; display: flex; flex-direction: column; }
.card-header { box-shadow: none; border-bottom: 1px solid var(--border); background: transparent; }
.card-header-title { color: var(--text); }
.card-header-icon.source-link { color: var(--link); font-size: 0.9rem; }
.card-content { flex: 1; color: var(--text); }
.item-list { list-style: none; margin: 0; padding: 0; }
.item { padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
.item:last-child { border-bottom: 0; }
.item[hidden] { display: none; }
.item a { display: block; font-weight: 600; overflow-wrap: anywhere; }
.meta { display: block; color: var(--muted); font-size: 0.875rem; }
.notice-stale { color: var(--text); border-left: 4px solid #b26a00; padding-left: 0.5rem; margin-bottom: 0.75rem; font-size: 0.9rem; }
.notice-empty { color: var(--text); }
button.expand { margin-top: 0.75rem; background: transparent; color: var(--link); border: 1px solid var(--link); cursor: pointer; }
.card-footer { border-top: 1px solid var(--border); background: transparent; }
.updated { color: var(--muted); font-size: 0.8rem; padding: 0.6rem 0.75rem; margin: 0; }
.profile-link { display: block; padding: 0.6rem 0; font-weight: 600; }
.fb-frame { width: 100%; max-width: 500px; height: 600px; border: 0; }
button#fb-load { background: transparent; color: var(--link); border: 1px solid var(--link); cursor: pointer; }
.site-footer { padding: 1.5rem 0 2rem; color: var(--muted); font-size: 0.9rem; }
.site-footer a { color: var(--link); }
```
Then run:
```bash
sed -i "s/__PRIMARY__/${PRIMARY}/" site/styles.css
grep -c "__PRIMARY__" site/styles.css
grep -n "^  --primary" site/styles.css
```
Expected: the count is `0` and the `--primary` line shows the real hex.

- [ ] **Step 5: Write `site/index.html`**

```html
<!doctype html>
<html lang="fi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src https://www.facebook.com; base-uri 'none'; form-action 'none'">
  <title>Kuopion ilmoitustaulu</title>
  <meta name="description" content="Epävirallinen kooste Kuopion kaupungin ilmoituksista, uutisista ja tapahtumista.">
  <link rel="stylesheet" href="vendor/bulma.min.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container px-4">
    <header class="site-header">
      <h1>Kuopion ilmoitustaulu</h1>
      <p>Ilmoitukset, uutiset ja tapahtumat yhdellä sivulla.</p>
    </header>
    <main id="main">
      <noscript><p>Sivu tarvitsee JavaScriptin toimiakseen.</p></noscript>
      <div id="cards" class="columns is-multiline">
        <div id="social-column" class="column is-12-mobile is-6-tablet is-4-desktop">
          <section class="card" aria-labelledby="h-social">
            <header class="card-header">
              <h2 id="h-social" class="card-header-title">Sosiaalinen media</h2>
            </header>
            <div class="card-content">
              <div id="fb-slot">
                <p>Facebook-syöte lataa sisältöä Facebookilta vasta, kun painat painiketta.</p>
                <button id="fb-load" class="button" type="button">Näytä Facebook-syöte</button>
                <p><a class="profile-link" href="https://www.facebook.com/kuopionkaupunki/" rel="noopener">Kuopion kaupunki Facebookissa</a></p>
              </div>
              <a class="profile-link" href="https://www.instagram.com/kuopionkaupunki/" rel="noopener">Kuopion kaupunki Instagramissa</a>
              <a class="profile-link" href="https://fi.linkedin.com/company/city-of-kuopio" rel="noopener">City of Kuopio LinkedInissä</a>
            </div>
          </section>
        </div>
      </div>
    </main>
    <footer class="site-footer">
      <p>Epävirallinen palvelu. Tiedot haetaan Kuopion kaupungin julkisilta sivuilta.</p>
      <p>Lähteet:
        <a href="https://www.kuopio.fi/kuopionkaupunki/paatoksenteko/ilmoitustaulu/" rel="noopener">Ilmoitustaulu</a>,
        <a href="https://www.kuopio.fi/uutisarkisto/" rel="noopener">Uutisarkisto</a>,
        <a href="https://www.hellokuopio.fi/tapahtumat/tapahtumakalenteri/" rel="noopener">Tapahtumakalenteri</a>.
      </p>
    </footer>
  </div>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 6: Write `site/app.js`**

```js
const SOURCES = [
  { id: 'notices', title: 'Ilmoitustaulu', sourceUrl: 'https://www.kuopio.fi/kuopionkaupunki/paatoksenteko/ilmoitustaulu/' },
  { id: 'news', title: 'Uutiset', sourceUrl: 'https://www.kuopio.fi/uutisarkisto/' },
  { id: 'events', title: 'Tapahtumat', sourceUrl: 'https://www.hellokuopio.fi/tapahtumat/tapahtumakalenteri/' },
];
const COLLAPSED = 5;
const FACEBOOK_PAGE = 'https://www.facebook.com/kuopionkaupunki/';

function el(tag, opts = {}, kids = []) {
  const node = document.createElement(tag);
  if (opts.cls) node.className = opts.cls;
  if (opts.text !== undefined) node.textContent = opts.text;
  for (const [k, v] of Object.entries(opts.attrs ?? {})) node.setAttribute(k, v);
  for (const kid of kids) node.append(kid);
  return node;
}

function formatDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d}.${m}.${y}`;
}

function formatStamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'tuntematon';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('fi-FI', {
      timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return `${parts.day}.${parts.month}.${parts.year} klo ${parts.hour}.${parts.minute}`;
}

function itemNode(item) {
  const link = el('a', { text: item.title, attrs: { href: item.url, rel: 'noopener' } });
  const meta = [item.date ? formatDate(item.date) : '', item.venue ?? ''].filter(Boolean).join(' \u00b7 ');
  const li = el('li', { cls: 'item' }, [link]);
  if (meta) li.append(el('span', { cls: 'meta', text: meta }));
  return li;
}

function buildCard(cfg, data) {
  const items = (Array.isArray(data?.items) ? data.items : [])
    .filter((i) => i && typeof i.title === 'string' && typeof i.url === 'string' && /^https:\/\//.test(i.url))
    .slice(0, 10);
  const headingId = `h-${cfg.id}`;
  const listId = `list-${cfg.id}`;

  const header = el('header', { cls: 'card-header' }, [
    el('h2', { cls: 'card-header-title', text: cfg.title, attrs: { id: headingId } }),
    el('a', { cls: 'card-header-icon source-link', text: 'Avaa lähde', attrs: { href: cfg.sourceUrl, rel: 'noopener' } }),
  ]);
  const content = el('div', { cls: 'card-content' });

  if (data?.stale && items.length) {
    const when = data.updated ? formatStamp(data.updated) : 'tuntematon';
    content.append(el('p', {
      cls: 'notice-stale', attrs: { role: 'status' },
      text: `Tiedot voivat olla vanhentuneita, viimeksi päivitetty ${when}.`,
    }));
  }

  if (items.length === 0) {
    content.append(el('p', { cls: 'notice-empty', text: 'Tietoja ei saatu haettua. ' }, [
      el('a', { text: 'Avaa lähde', attrs: { href: cfg.sourceUrl, rel: 'noopener' } }),
    ]));
  } else {
    const list = el('ul', { cls: 'item-list', attrs: { id: listId } });
    items.forEach((item, index) => {
      const li = itemNode(item);
      if (index >= COLLAPSED) li.hidden = true;
      list.append(li);
    });
    content.append(list);
    if (items.length > COLLAPSED) {
      const button = el('button', {
        cls: 'button expand', text: `Näytä lisää (${items.length})`,
        attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': listId },
      });
      button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        list.querySelectorAll('.item').forEach((li, index) => {
          if (index >= COLLAPSED) li.hidden = expanded;
        });
        button.setAttribute('aria-expanded', String(!expanded));
        button.textContent = expanded ? `Näytä lisää (${items.length})` : 'Näytä vähemmän';
      });
      content.append(button);
    }
  }

  const section = el('section', { cls: 'card', attrs: { 'aria-labelledby': headingId } }, [header, content]);
  if (data?.updated) {
    section.append(el('footer', { cls: 'card-footer' }, [
      el('p', { cls: 'updated', text: `Päivitetty ${formatStamp(data.updated)}` }),
    ]));
  }
  return el('div', { cls: 'column is-12-mobile is-6-tablet is-4-desktop' }, [section]);
}

async function load(cfg) {
  try {
    const res = await fetch(`data/${cfg.id}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return null;
  }
}

function wireFacebook() {
  const button = document.getElementById('fb-load');
  if (!button) return;
  button.addEventListener('click', () => {
    const params = new URLSearchParams({
      href: FACEBOOK_PAGE, tabs: 'timeline', width: '500', height: '600',
      small_header: 'true', adapt_container_width: 'true', hide_cover: 'true',
      show_facepile: 'false', locale: 'fi_FI',
    });
    const frame = el('iframe', {
      cls: 'fb-frame',
      attrs: {
        src: `https://www.facebook.com/plugins/page.php?${params}`,
        title: 'Kuopion kaupungin Facebook-syöte',
        loading: 'lazy', referrerpolicy: 'no-referrer-when-downgrade',
      },
    });
    document.getElementById('fb-slot').replaceChildren(frame);
  });
}

async function main() {
  const grid = document.getElementById('cards');
  const social = document.getElementById('social-column');
  const results = await Promise.all(SOURCES.map(load));
  SOURCES.forEach((cfg, index) => grid.insertBefore(buildCard(cfg, results[index]), social));
  wireFacebook();
}

main();
```

- [ ] **Step 7: Look at the page with real data**

Run:
```bash
npm run build
cd site && python3 -m http.server 8099 >/tmp/srv.log 2>&1 &
sleep 1
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
  for (const [w, h, name] of [[390, 900, 'phone'], [1280, 900, 'desktop']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    p.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await p.goto('http://localhost:8099/');
    await p.waitForSelector('.item');
    await p.screenshot({ path: '/tmp/claude-0/-home-user/299a8a97-5d91-50f2-8062-b40baa7cd383/scratchpad/shot-' + name + '.png', fullPage: true });
    console.log(name, 'console errors:', errors);
  }
  await b.close();
})();
"
kill %1
```
Note: run `node -e` from `/home/user/kuopio-web` so `require('playwright')` resolves to the project's dev dependency. If Chromium is not found, set `CHROMIUM_PATH=/opt/pw-browsers/chromium`.
Expected: no console errors. Read both screenshots (they are in the scratchpad directory) and check: headings in Finnish, 5 items per list card, no horizontal scroll at 390 px, the social card present. Report anything wrong before continuing.

- [ ] **Step 8: Amend the spec to match the implementation**

The plan uses the Page plugin's iframe form, not the JavaScript SDK. Edit the spec: in section 6 item 5 replace "loads the Facebook Page plugin timeline" with "loads the Facebook Page plugin timeline as an iframe (no Facebook script)". In section 6 item 8 replace "plus Facebook hosts after the click" with "and allowing `frame-src https://www.facebook.com`". Then:
```bash
git add -A
git commit -m "feat: add dashboard page, script and theme

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dp86c5px88KTBjJk7LFMrt"
```
Put the contrast ratio from step 3 and the console error result from step 7 in the commit message body.

---

### Task 8: Browser tests (Playwright and axe)

**Files:**
- Create: `test/e2e/dashboard.spec.mjs`, `test/e2e/data/notices.json`, `test/e2e/data/news.json`, `test/e2e/data/events.json`

**Interfaces:**
- Consumes: DOM contract from task 7.
- Produces: `npm run test:e2e` passing. Tests serve `site/` plus `test/e2e/data/` as `/data/` on a random local port.

- [ ] **Step 1: Write the sample data**

Run this script to generate the three files (no hand-typed JSON):
```bash
mkdir -p test/e2e/data
node -e "
const fs = require('fs');
const mk = (id, title, sourceUrl, items, extra = {}) => ({ id, title, sourceUrl, updated: '2026-11-05T12:30:00.000Z', stale: false, failures: 0, items, ...extra });
const items = (n, prefix, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({
  title: prefix + ' ' + (i + 1), url: 'https://www.kuopio.fi/' + prefix.toLowerCase() + '/' + (i + 1), date: '2026-11-0' + (9 - Math.min(i, 8)), ...extra(i),
}));
const notices = items(10, 'Ilmoitus');
notices[0].title = '<img src=x onerror=\"window.__xss=1\">Vaarallinen otsikko';
fs.writeFileSync('test/e2e/data/notices.json', JSON.stringify(mk('notices', 'Ilmoitustaulu', 'https://www.kuopio.fi/kuopionkaupunki/paatoksenteko/ilmoitustaulu/', notices), null, 2));
fs.writeFileSync('test/e2e/data/news.json', JSON.stringify(mk('news', 'Uutiset', 'https://www.kuopio.fi/uutisarkisto/', items(5, 'Uutinen')), null, 2));
fs.writeFileSync('test/e2e/data/events.json', JSON.stringify(mk('events', 'Tapahtumat', 'https://www.hellokuopio.fi/tapahtumat/tapahtumakalenteri/', items(8, 'Tapahtuma', (i) => ({ url: 'https://www.hellokuopio.fi/tapahtuma/' + (i + 1) + '/', venue: 'Kuopion tori' }))), null, 2));
"
ls -l test/e2e/data
```
Expected: three files.

- [ ] **Step 2: Write the tests**

`test/e2e/dashboard.spec.mjs`:
```js
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
  await page.waitForSelector('.card');
  return { context, page, requests, errors };
}

test('shows four Finnish cards in order', async () => {
  const { context, page } = await openPage();
  const headings = await page.locator('h2').allTextContents();
  assert.deepEqual(headings, ['Ilmoitustaulu', 'Uutiset', 'Tapahtumat', 'Sosiaalinen media']);
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
  assert.match(await first.locator('.meta').textContent(), /^\d{1,2}\.\d{1,2}\.\d{4} \u00b7 Kuopion tori$/);
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

for (const colorScheme of ['light', 'dark']) {
  test(`axe finds no serious or critical issues (${colorScheme})`, async () => {
    const { context, page } = await openPage({ colorScheme });
    const result = await new AxeBuilder({ page }).analyze();
    const bad = result.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    assert.deepEqual(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), []);
    await context.close();
  });
}
```

- [ ] **Step 3: Run the tests**

Run: `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`
(In an environment where Playwright manages its own browser, omit `CHROMIUM_PATH`.)
Expected: all tests PASS.

- [ ] **Step 4: Fix failures at the cause**

If the axe tests fail, read the reported selectors and fix `site/styles.css` or `site/index.html` (for example color contrast of a specific element). Do not add the rule to an ignore list. If another test fails, the fix goes in the page, not in a weakened assertion. Re-run until green. Run `npm test` as well.

- [ ] **Step 5: Commit**

```bash
git add test/e2e site
git commit -m "test: add browser tests with axe checks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dp86c5px88KTBjJk7LFMrt"
```

---

### Task 9: Deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm ci`, `npm test`, `npm run test:e2e`, `npm run build`, env `PREVIOUS_BASE_URL`.
- Produces: a Pages deployment from artifact path `site`. Triggers: `schedule` at minutes 7 and 37 of every hour, `push` to `main`, `workflow_dispatch`.

- [ ] **Step 1: Resolve the commit SHAs for the actions**

Run:
```bash
for r in actions/checkout@v4 actions/setup-node@v4 actions/configure-pages@v5 actions/upload-pages-artifact@v3 actions/deploy-pages@v4; do
  repo=${r%@*}; tag=${r#*@}
  echo "$r $(gh api repos/$repo/commits/$tag --jq .sha)"
done
```
Expected: five lines, each with a 40-character SHA. If `gh` fails with an authentication error, run the same lookups with `git ls-remote https://github.com/$repo refs/tags/$tag` (and `refs/tags/$tag^{}` for annotated tags, which gives the commit). Write down the five SHAs. If a tag does not exist, stop and report which one.

- [ ] **Step 2: Generate the workflow with the SHAs filled in**

Run (this writes the file from the resolved SHAs, so no placeholder reaches the repo):
```bash
sha() { gh api "repos/$1/commits/$2" --jq .sha; }
CHECKOUT=$(sha actions/checkout v4)
SETUP_NODE=$(sha actions/setup-node v4)
CONFIGURE=$(sha actions/configure-pages v5)
UPLOAD=$(sha actions/upload-pages-artifact v3)
DEPLOY=$(sha actions/deploy-pages v4)
for v in CHECKOUT SETUP_NODE CONFIGURE UPLOAD DEPLOY; do eval "test \${#$v} -eq 40" || { echo "bad sha for $v"; exit 1; }; done
mkdir -p .github/workflows
cat > .github/workflows/deploy.yml <<EOF
name: Deploy

on:
  schedule:
    - cron: '7,37 * * * *'
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

env:
  PREVIOUS_BASE_URL: https://klyytine.github.io/kuopio-web

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@${CHECKOUT} # v4
      - uses: actions/setup-node@${SETUP_NODE} # v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - name: Build data
        run: node scripts/build.mjs || echo "BUILD_FAILED=1" >> "\$GITHUB_ENV"
      - uses: actions/configure-pages@${CONFIGURE} # v5
      - uses: actions/upload-pages-artifact@${UPLOAD} # v3
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@${DEPLOY} # v4
      - name: Fail the run if a source has failed three times in a row
        if: env.BUILD_FAILED == '1'
        run: exit 1
EOF
cat .github/workflows/deploy.yml
```
Expected: the printed file shows five `uses:` lines with 40-character SHAs and the `\${{ }}` expression and `\$GITHUB_ENV` unescaped (`${{ steps.deployment.outputs.page_url }}`, `"$GITHUB_ENV"`). The cron minutes 7 and 37 avoid the busiest minutes on the hour and half hour.

- [ ] **Step 3: Check the file**

Run:
```bash
python3 -I -c "import sys,re;t=open('.github/workflows/deploy.yml').read();print(len(re.findall(r'uses: \S+@[0-9a-f]{40}',t)),'pinned actions');assert 'BUILD_FAILED' in t and 'page_url' in t"
grep -n 'permissions' -A3 .github/workflows/deploy.yml | head -6
```
Expected: `5 pinned actions`, and the permissions block lists exactly three entries. If a YAML linter (`actionlint`) is available, run it. If not, say so.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add scheduled test, build and Pages deploy

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dp86c5px88KTBjJk7LFMrt"
```

---

### Task 10: Push, first deploy, verify

**Files:**
- Modify: none (README is already in place)

**Interfaces:**
- Consumes: everything above. Pages enabled with source "GitHub Actions" (task 1 step 6).
- Produces: a live site and a recorded verification.

- [ ] **Step 1: Run the full local check**

Run: `npm test && CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e && npm run build`
Expected: all green, three data files with items.

- [ ] **Step 2: Push**

```bash
git push origin main
```
Expected: the push succeeds and starts the workflow. If rejected, run `git fetch origin main` and report what is on the remote. Do not force push.

- [ ] **Step 3: Watch the first run**

Run:
```bash
gh run list --repo klyytine/kuopio-web --limit 3
gh run watch --repo klyytine/kuopio-web --exit-status
```
Expected: the run `Deploy` succeeds. If it fails, run `gh run view --log-failed --repo klyytine/kuopio-web`, fix the cause in a new commit, push, and watch again. Common causes to check first: Pages not set to "GitHub Actions" as source, `playwright install` failing, the e2e job missing a system library.

- [ ] **Step 4: Verify the deployed site**

Run:
```bash
URL=$(gh api repos/klyytine/kuopio-web/pages --jq .html_url); echo "$URL"
curl -sS -L -m 30 -o /dev/null -w "%{http_code}\n" "$URL"
curl -sS -L -m 30 "${URL}data/news.json" | head -c 400
```
Expected: HTTP 200, and news JSON with `"stale": false`. Open the URL in Playwright, take phone and desktop screenshots, read them, and compare the first item of each card with its source page. Report any difference.
If the repo is private and the page needs login, say so. Do not change visibility.

- [ ] **Step 5: Prove the 30-minute schedule works**

This cannot be proven in one sitting. Record the time of the push in the final report. After two hours, run:
```bash
gh run list --repo klyytine/kuopio-web --workflow Deploy --limit 10 --json event,createdAt,conclusion
```
Expected: at least three runs with `event: schedule`. Report the real intervals.

---

### Task 11: Audit handoff

**Files:**
- Create: `scripts/audit-data.mjs`, `docs/audit/README.md`

**Interfaces:**
- Consumes: `site/data/*.json`, `ALLOWED_HOSTS`
- Produces: `npm run audit:data` (read-only; prints one line per check and exits 1 on any failure). `docs/audit/README.md` holds the auditor prompt and the checklist from spec section 11.

- [ ] **Step 1: Write the audit data script**

`scripts/audit-data.mjs`:
```js
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ALLOWED_HOSTS } from './lib/validate.mjs';

const dir = process.argv[2] ?? 'site/data';
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

check('three data files present', files.length === 3, files.join(', '));
for (const file of files) {
  const raw = await readFile(join(dir, file), 'utf8');
  const data = JSON.parse(raw);
  check(`${file}: has items`, Array.isArray(data.items) && data.items.length > 0, `${data.items?.length ?? 0} items`);
  check(`${file}: at most 10 items`, data.items.length <= 10);
  check(`${file}: not stale`, data.stale === false, `failures=${data.failures}`);
  check(`${file}: no mojibake`, !/[\u00c3\u00c2\ufffd\u2044]/.test(raw));
  const badHosts = data.items.filter((i) => {
    try { const u = new URL(i.url); return u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname); } catch { return true; }
  });
  check(`${file}: all links https on allowed hosts`, badHosts.length === 0, badHosts.map((i) => i.url).join(' '));
  check(`${file}: titles are plain text`, data.items.every((i) => !/<[a-z]/i.test(i.title)));
  const age = data.updated ? (Date.now() - new Date(data.updated).getTime()) / 3600000 : Infinity;
  check(`${file}: updated within 3 hours`, age <= 3, `${age.toFixed(1)} h`);
}
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
```

- [ ] **Step 2: Run it**

Run: `npm run build && npm run audit:data`
Expected: every line PASS, exit 0. Then test the failure path once: `mkdir /tmp/empty-audit && node scripts/audit-data.mjs /tmp/empty-audit; echo "exit $?"` must print a FAIL line and `exit 1`.

- [ ] **Step 3: Write `docs/audit/README.md`**

Copy section 11 of the spec (rules, prompt, 22-item checklist) into this file as it stands in the spec, then add this header at the top:

```markdown
# Audit by a fresh Claude

Run this after the first successful deploy and again after any fix.

1. Open a new Claude session. Do not paste or link the design conversation.
2. Clone `klyytine/kuopio-web` fresh. Give the session this file, the spec, and nothing else.
3. Helper for items 4, 5 and 18 (data checks): `npm run build && npm run audit:data`.
4. The auditor reports PASS, FAIL or NOT CHECKABLE per item with the command output as proof.
5. The author fixes failures. The auditor repeats only the failed items.
```
Verify the copy is complete:
```bash
grep -c '^| [0-9]' docs/audit/README.md
```
Expected: `22`.

- [ ] **Step 4: Commit and push**

```bash
git add scripts/audit-data.mjs docs/audit
git commit -m "docs: add audit handoff and data audit script

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dp86c5px88KTBjJk7LFMrt"
git push origin main
```
Expected: push succeeds and the workflow runs green again.

- [ ] **Step 5: Hand over**

Report to the user: the Pages URL, the run result, the screenshots checked, what could not be verified (Facebook embed in a real logged-in browser, the 2-hour schedule check, source terms), and the exact line to start the audit: open a new session on a fresh clone and give it `docs/audit/README.md`. Do not start the audit yourself. The audit must come from a session that did not write the code.
