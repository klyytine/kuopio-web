import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { fetchWithRetry } from '../lib/http.mjs';
import { parseFiDate } from '../lib/normalize.mjs';

export const id = 'notices';
export const title = 'Kuulutukset';
export const sourceUrl = 'https://www.kuopio.fi/kuopionkaupunki/paatoksenteko/ilmoitustaulu/';
const LIST_URL = 'https://kuopio.oncloudos.com/cgi/DREQUEST.PHP?alo=1&page=announcement_search&tzo=-180';
const BASE = 'https://kuopio.oncloudos.com/cgi/';

function clean(text) {
  return text.replace(/⁄/g, '/').replace(/\s+/g, ' ').trim();
}

export function parseNotices(buffer) {
  const html = iconv.decode(Buffer.from(buffer), 'iso-8859-1');
  const $ = cheerio.load(html);
  const items = [];
  $('tr.trDat').each((_, tr) => {
    if (items.length >= 10) return;
    const a = $(tr).find('td.filetitle a').first();
    const href = a.attr('href');
    if (!href) return;
    const prefix = clean(a.find('span.prefix').text());
    const titleText = clean(a.clone().find('span.prefix').remove().end().text());
    if (!titleText) return;
    const dateCell = $(tr).find('td').not('.filetitle').first().text();
    const item = {
      title: titleText,
      url: new URL(href, BASE).href,
      date: parseFiDate(dateCell),
    };
    if (prefix) item.summary = prefix;
    items.push(item);
  });
  return items;
}

export async function fetchItems({ fetchImpl } = {}) {
  const buffer = await fetchWithRetry(LIST_URL, { as: 'buffer', fetchImpl });
  return parseNotices(buffer);
}
