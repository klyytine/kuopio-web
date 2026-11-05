export const ALLOWED_HOSTS = new Set([
  'kuopio.fi',
  'www.kuopio.fi',
  'hellokuopio.fi',
  'www.hellokuopio.fi',
  'kuopio.oncloudos.com',
]);

export function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, reason: 'no items' };
  for (const [i, item] of items.entries()) {
    if (!item || typeof item.title !== 'string' || item.title.trim() === '') {
      return { ok: false, reason: `item ${i} has no title` };
    }
    let url;
    try {
      url = new URL(item.url);
    } catch {
      return { ok: false, reason: `item ${i} has an invalid url` };
    }
    if (url.protocol !== 'https:') return { ok: false, reason: `item ${i} is not https` };
    if (!ALLOWED_HOSTS.has(url.hostname)) return { ok: false, reason: `item ${i} host ${url.hostname} not allowed` };
  }
  return { ok: true };
}
