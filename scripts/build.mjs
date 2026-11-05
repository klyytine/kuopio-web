import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchWithRetry } from './lib/http.mjs';
import { validateItems } from './lib/validate.mjs';
import { mergeResult, isUsablePrevious } from './lib/merge.mjs';
import { itemId } from './lib/normalize.mjs';

function knownId(item) {
  if (typeof item?.id === 'string') return item.id;
  try {
    return itemId(item.url);
  } catch {
    return null;
  }
}

async function loadPrevious(id, outDir, previousBaseUrl, fetchImpl) {
  if (previousBaseUrl) {
    try {
      return await fetchWithRetry(`${previousBaseUrl}/data/${id}.json`, {
        as: 'json', retries: 0, timeoutMs: 10000, fetchImpl,
      });
    } catch {
      // first deploy or site unreachable: fall through to the local file
    }
  }
  try {
    return JSON.parse(await readFile(join(outDir, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

// onNewItems(sourceId, items) is an extension point. It is called with items whose id was not in
// the previous file. It is not called without a usable previous file (no baseline) or when the
// source failed. A failing hook is logged and never fails the build. Nothing uses it in v1.
export async function runBuild({ sources, outDir, previousBaseUrl, fetchImpl = globalThis.fetch, now = new Date(), onNewItems }) {
  await mkdir(outDir, { recursive: true });
  const results = [];
  for (const source of sources) {
    const prev = await loadPrevious(source.id, outDir, previousBaseUrl, fetchImpl);
    let items;
    let error;
    try {
      items = await source.fetchItems({ fetchImpl });
      const check = validateItems(items);
      if (!check.ok) throw new Error(`validation failed: ${check.reason}`);
      items = items.map((item) => ({ id: itemId(item.url), ...item }));
    } catch (err) {
      error = err;
      console.error(`[${source.id}] ${err.message}`);
    }
    const merged = mergeResult({ source, prev, items: error ? undefined : items, error, now });
    await writeFile(join(outDir, `${source.id}.json`), JSON.stringify(merged, null, 2) + '\n');
    results.push(merged);
    if (!error && onNewItems && isUsablePrevious(prev, source.id)) {
      const known = new Set(prev.items.map(knownId));
      const fresh = merged.items.filter((item) => !known.has(item.id));
      if (fresh.length > 0) {
        try {
          await onNewItems(source.id, fresh);
        } catch (err) {
          console.error(`[${source.id}] onNewItems failed: ${err.message}`);
        }
      }
    }
  }
  return results;
}

async function main() {
  const sources = await Promise.all([
    import('./sources/notices.mjs'),
    import('./sources/news.mjs'),
    import('./sources/events.mjs'),
  ]);
  const results = await runBuild({
    sources,
    outDir: 'site/data',
    previousBaseUrl: process.env.PREVIOUS_BASE_URL || undefined,
  });
  for (const r of results) {
    console.log(`${r.id}: ${r.items.length} items, stale=${r.stale}, failures=${r.failures}`);
  }
  if (results.some((r) => r.failures >= 3)) {
    console.error('At least one source has failed 3 or more runs in a row.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
