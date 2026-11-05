import { createHash } from 'node:crypto';
import { load } from 'cheerio';

export function stripHtml(html) {
  if (html === undefined || html === null) return '';
  const $ = load(String(html), null, false);
  return $.text().replace(/\s+/g, ' ').trim();
}

export function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

const helsinkiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Helsinki',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function toIsoDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return helsinkiDate.format(d);
}

export function parseFiDate(text) {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(text ?? ''));
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function itemId(url) {
  const u = new URL(url);
  u.hash = '';
  return createHash('sha256').update(u.href).digest('hex').slice(0, 16);
}
