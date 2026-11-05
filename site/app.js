const SOURCES = [
  { id: 'notices', title: 'Kuulutukset', sourceUrl: 'https://www.kuopio.fi/kuopionkaupunki/paatoksenteko/ilmoitustaulu/' },
  { id: 'news', title: 'Uutiset', sourceUrl: 'https://www.kuopio.fi/uutisarkisto/' },
  { id: 'events', title: 'Tapahtumat', sourceUrl: 'https://www.hellokuopio.fi/tapahtumat/tapahtumakalenteri/' },
];
const COLLAPSED = 5;
const DATA_BASE = document.documentElement.dataset.dataBase || 'data/';

function el(tag, opts = {}, kids = []) {
  const node = document.createElement(tag);
  if (opts.cls) node.className = opts.cls;
  if (opts.text !== undefined) node.textContent = opts.text;
  for (const [k, v] of Object.entries(opts.attrs ?? {})) node.setAttribute(k, v);
  for (const kid of kids) node.append(kid);
  return node;
}

function formatDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d}.${m}.${y}`;
}

function formatStamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'tuntematon';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('fi-FI', {
      timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return `${parts.day}.${parts.month}.${parts.year} klo ${parts.hour}.${parts.minute}`;
}

function itemNode(item) {
  const link = el('a', { text: item.title, attrs: { href: item.url, rel: 'noopener' } });
  const meta = [item.date ? formatDate(item.date) : '', item.venue ?? ''].filter(Boolean).join(' · ');
  const li = el('li', { cls: 'item', attrs: item.id ? { 'data-item-id': String(item.id) } : {} }, [link]);
  if (meta) li.append(el('span', { cls: 'meta', text: meta }));
  return li;
}

function buildCard(cfg, data) {
  const items = (Array.isArray(data?.items) ? data.items : [])
    .filter((i) => i && typeof i.title === 'string' && typeof i.url === 'string' && /^https:\/\//.test(i.url))
    .slice(0, 10);
  const headingId = `h-${cfg.id}`;
  const listId = `list-${cfg.id}`;

  const header = el('header', { cls: 'card-header' }, [
    el('h2', { cls: 'card-header-title', text: cfg.title, attrs: { id: headingId } }),
    el('a', { cls: 'card-header-icon source-link', text: 'Avaa lähde', attrs: { href: cfg.sourceUrl, rel: 'noopener' } }),
  ]);
  const content = el('div', { cls: 'card-content' });

  if (data?.stale && items.length) {
    const when = data.updated ? formatStamp(data.updated) : 'tuntematon';
    content.append(el('p', {
      cls: 'notice-stale', attrs: { role: 'status' },
      text: `Tiedot voivat olla vanhentuneita, viimeksi päivitetty ${when}.`,
    }));
  }

  if (items.length === 0) {
    content.append(el('p', { cls: 'notice-empty', text: 'Tietoja ei saatu haettua. ' }, [
      el('a', { text: 'Avaa lähde', attrs: { href: cfg.sourceUrl, rel: 'noopener' } }),
    ]));
  } else {
    const list = el('ul', { cls: 'item-list', attrs: { id: listId } });
    items.forEach((item, index) => {
      const li = itemNode(item);
      if (index >= COLLAPSED) li.hidden = true;
      list.append(li);
    });
    content.append(list);
    if (items.length > COLLAPSED) {
      const button = el('button', {
        cls: 'button expand', text: `Näytä lisää (${items.length})`,
        attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': listId },
      });
      button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        list.querySelectorAll('.item').forEach((li, index) => {
          if (index >= COLLAPSED) li.hidden = expanded;
        });
        button.setAttribute('aria-expanded', String(!expanded));
        button.textContent = expanded ? `Näytä lisää (${items.length})` : 'Näytä vähemmän';
      });
      content.append(button);
    }
  }

  const section = el('section', { cls: 'card', attrs: { 'aria-labelledby': headingId } }, [header, content]);
  if (data?.updated) {
    section.append(el('footer', { cls: 'card-footer' }, [
      el('p', { cls: 'updated', text: `Päivitetty ${formatStamp(data.updated)}` }),
    ]));
  }
  section.append(document.getElementById('social-links').content.cloneNode(true));
  return el('div', { cls: 'column is-12-mobile is-6-tablet is-4-desktop' }, [section]);
}

async function load(cfg) {
  try {
    const res = await fetch(`${DATA_BASE}${cfg.id}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return null;
  }
}

async function main() {
  const grid = document.getElementById('cards');
  const results = await Promise.all(SOURCES.map(load));
  SOURCES.forEach((cfg, index) => grid.append(buildCard(cfg, results[index])));
}

main();
