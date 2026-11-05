export const SCHEMA = 1;

export function isUsablePrevious(prev, id) {
  return Boolean(prev) && typeof prev === 'object' && prev.schema === SCHEMA && prev.id === id && Array.isArray(prev.items);
}

export function mergeResult({ source, prev, items, error, now }) {
  const base = { schema: SCHEMA, id: source.id, title: source.title, sourceUrl: source.sourceUrl };
  if (!error) {
    return { ...base, updated: now.toISOString(), stale: false, failures: 0, items };
  }
  if (isUsablePrevious(prev, source.id)) {
    return {
      ...base,
      updated: prev.updated ?? null,
      stale: true,
      failures: (Number.isInteger(prev.failures) ? prev.failures : 0) + 1,
      items: prev.items,
    };
  }
  return { ...base, updated: null, stale: true, failures: 1, items: [] };
}
