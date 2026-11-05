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
