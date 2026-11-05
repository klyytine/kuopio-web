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
