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
    assert.ok(item.url.startsWith('https://kuopio.oncloudos.com/'), item.url);
  }
  // some rows link to the announcement page, others straight to a PDF under /kuulutus/
  assert.ok(items.some((i) => i.url.startsWith('https://kuopio.oncloudos.com/cgi/DREQUEST.PHP?page=announcement&id=')));
});
test('decodes ISO-8859-1 without mojibake', () => {
  const items = parseNotices(buffer);
  const all = items.map((i) => i.title + ' ' + (i.summary ?? '')).join(' ');
  assert.ok(!all.includes('Ã'), 'found Ã, charset not decoded');
  assert.ok(!all.includes('�'), 'found replacement character');
  assert.ok(!all.includes('⁄'), 'fraction slash not replaced');
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
