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
