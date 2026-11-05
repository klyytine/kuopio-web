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
