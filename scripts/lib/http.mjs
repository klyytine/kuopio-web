const USER_AGENT = 'kuopio-web/1.0 (+https://github.com/klyytine/kuopio-web)';

export async function fetchWithRetry(
  url,
  {
    as = 'text',
    timeoutMs = 20000,
    retries = 2,
    pauseMs = 5000,
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}
) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(pauseMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: '*/*' },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      if (as === 'json') return await res.json();
      if (as === 'buffer') return Buffer.from(await res.arrayBuffer());
      return await res.text();
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`fetch failed after ${retries + 1} attempts: ${lastError.message}`);
}
