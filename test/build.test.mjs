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
  const prev = { schema: 1, id: 'a', title: 'a', sourceUrl: 'https://www.kuopio.fi/', updated: '2026-11-05T09:00:00.000Z', stale: false, failures: 2, items: [item] };
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
test('items get a stable id and the file carries the schema version', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-'));
  const first = await runBuild({ sources: [mk('a', async () => [item])], outDir: dir, now });
  const second = await runBuild({ sources: [mk('a', async () => [item])], outDir: dir, now });
  assert.match(first[0].items[0].id, /^[0-9a-f]{16}$/);
  assert.equal(first[0].items[0].id, second[0].items[0].id);
  assert.equal(first[0].schema, 1);
  assert.equal((await read(dir, 'a')).schema, 1);
});
test('onNewItems is not called on the first run (no baseline)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-'));
  const calls = [];
  await runBuild({
    sources: [mk('a', async () => [item])], outDir: dir, now,
    onNewItems: async (id, fresh) => { calls.push([id, fresh]); },
  });
  assert.deepEqual(calls, []);
});
test('onNewItems receives only items not seen in the previous file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-'));
  const other = { title: 'B', url: 'https://www.kuopio.fi/b', date: '2026-11-06' };
  const calls = [];
  const onNewItems = async (id, fresh) => { calls.push([id, fresh.map((i) => i.title)]); };
  await runBuild({ sources: [mk('a', async () => [item])], outDir: dir, now, onNewItems });
  await runBuild({ sources: [mk('a', async () => [other, item])], outDir: dir, now, onNewItems });
  assert.deepEqual(calls, [['a', ['B']]]);
  await runBuild({ sources: [mk('a', async () => [other, item])], outDir: dir, now, onNewItems });
  assert.equal(calls.length, 1);
});
test('onNewItems is not called when the source failed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-'));
  const calls = [];
  const onNewItems = async (id, fresh) => { calls.push(id); };
  await runBuild({ sources: [mk('a', async () => [item])], outDir: dir, now, onNewItems });
  await runBuild({ sources: [mk('a', async () => { throw new Error('x'); })], outDir: dir, now, onNewItems });
  assert.deepEqual(calls, []);
});
test('a failing onNewItems hook does not break the build', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-'));
  const other = { title: 'B', url: 'https://www.kuopio.fi/b', date: '2026-11-06' };
  const onNewItems = async () => { throw new Error('hook broke'); };
  await runBuild({ sources: [mk('a', async () => [item])], outDir: dir, now, onNewItems });
  const results = await runBuild({ sources: [mk('a', async () => [other, item])], outDir: dir, now, onNewItems });
  assert.equal(results[0].stale, false);
  assert.equal((await read(dir, 'a')).items.length, 2);
});
