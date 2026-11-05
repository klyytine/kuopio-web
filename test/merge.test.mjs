import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeResult, isUsablePrevious } from '../scripts/lib/merge.mjs';

const source = { id: 'news', title: 'Uutiset', sourceUrl: 'https://www.kuopio.fi/uutisarkisto/' };
const now = new Date('2026-11-05T12:00:00Z');
const items = [{ title: 'A', url: 'https://www.kuopio.fi/a', date: '2026-11-05' }];
const prev = { schema: 1, id: 'news', title: 'Uutiset', sourceUrl: source.sourceUrl, updated: '2026-11-05T10:00:00.000Z', stale: false, failures: 0, items };

test('success resets stale and failures', () => {
  const out = mergeResult({ source, prev: { ...prev, failures: 2, stale: true }, items, now });
  assert.equal(out.stale, false);
  assert.equal(out.failures, 0);
  assert.equal(out.schema, 1);
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
test('output carries the schema version', () => {
  assert.equal(mergeResult({ source, prev: null, error: new Error('x'), now }).schema, 1);
});
test('isUsablePrevious checks id, items and schema', () => {
  assert.equal(isUsablePrevious(prev, 'news'), true);
  assert.equal(isUsablePrevious(prev, 'other'), false);
  assert.equal(isUsablePrevious({ ...prev, schema: 2 }, 'news'), false);
  assert.equal(isUsablePrevious(null, 'news'), false);
  assert.equal(isUsablePrevious('text', 'news'), false);
});
test('failure without previous gives empty stale file', () => {
  const out = mergeResult({ source, prev: null, error: new Error('x'), now });
  assert.deepEqual(out.items, []);
  assert.equal(out.stale, true);
  assert.equal(out.failures, 1);
  assert.equal(out.updated, null);
});
test('corrupt previous is treated as absent', () => {
  for (const bad of [{ id: 'other', items: [] }, { id: 'news', items: 'x' }, { ...prev, schema: 2 }, { ...prev, schema: undefined }, 'text', 42, null]) {
    const out = mergeResult({ source, prev: bad, error: new Error('x'), now });
    assert.deepEqual(out.items, []);
    assert.equal(out.failures, 1);
  }
});
