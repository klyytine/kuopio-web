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
