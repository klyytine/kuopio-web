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
