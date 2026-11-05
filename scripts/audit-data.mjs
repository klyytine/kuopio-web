import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ALLOWED_HOSTS } from './lib/validate.mjs';

const dir = process.argv[2] ?? 'site/data';
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

check('three data files present', files.length === 3, files.join(', '));
for (const file of files) {
  const raw = await readFile(join(dir, file), 'utf8');
  const data = JSON.parse(raw);
  check(`${file}: has items`, Array.isArray(data.items) && data.items.length > 0, `${data.items?.length ?? 0} items`);
  check(`${file}: at most 10 items`, data.items.length <= 10);
  check(`${file}: not stale`, data.stale === false, `failures=${data.failures}`);
  check(`${file}: no mojibake`, !/[ÃÂ�⁄]/.test(raw));
  const badHosts = data.items.filter((i) => {
    try { const u = new URL(i.url); return u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname); } catch { return true; }
  });
  check(`${file}: all links https on allowed hosts`, badHosts.length === 0, badHosts.map((i) => i.url).join(' '));
  check(`${file}: titles are plain text`, data.items.every((i) => !/<[a-z]/i.test(i.title)));
  const age = data.updated ? (Date.now() - new Date(data.updated).getTime()) / 3600000 : Infinity;
  check(`${file}: updated within 3 hours`, age <= 3, `${age.toFixed(1)} h`);
}
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
