import test from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml, truncate, toIsoDate, parseFiDate, itemId } from '../scripts/lib/normalize.mjs';

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
test('itemId is stable and 16 hex characters', () => {
  const id = itemId('https://www.kuopio.fi/a?x=1');
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(itemId('https://www.kuopio.fi/a?x=1'), id);
});
test('itemId differs per url and ignores the fragment', () => {
  assert.notEqual(itemId('https://www.kuopio.fi/a'), itemId('https://www.kuopio.fi/b'));
  assert.notEqual(itemId('https://x.test/p?id=1'), itemId('https://x.test/p?id=2'));
  assert.equal(itemId('https://www.kuopio.fi/a#osa'), itemId('https://www.kuopio.fi/a'));
});
test('itemId throws on an invalid url', () => {
  assert.throws(() => itemId('not a url'));
});
