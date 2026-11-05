# Kuopio Dashboard: Design Spec

Date: 2026-11-05
Status: draft, awaiting user review
Target repo: `klyytine/kuopio-web` (not yet created)

## 1. Purpose and success criteria

A Finnish-language bulletin board of City of Kuopio information, hosted on GitHub Pages. One page, one card per source.

Success criteria:

1. The page opens at the GitHub Pages URL and shows six cards in two rows of three: Kuulutukset, Uutiset, Tapahtumat, then Facebook, Instagram, LinkedIn (amended 2026-11-05 after the first demo; the card formerly named Ilmoitustaulu is now Kuulutukset).
2. Each list card shows up to 5 items and expands to all available items, maximum 10. The button shows the real count.
3. Each card has a link to the page its data comes from.
4. Reloading the browser shows the latest deployed data. Data is refreshed on GitHub every 30 minutes.
5. One failing source never blanks the page or the other cards.
6. All visible text is Finnish. `<html lang="fi">`.
7. The footer states the service is unofficial.

Non-goals for v1: user accounts, search, email notifications, history of past data, favorites, a backend, scraping Facebook, Instagram or LinkedIn.

The deferred features (accounts, search, email notifications, history, favorites) are designed for but not built. The architecture keeps the seams listed in the plan section "Future upgrades": stable item ids, a data schema version, a new-items hook in the build, and no personal data in v1. Added 2026-11-05 at the user's request.

## 2. Verified source facts

Checked on 2026-11-05 by fetching the live pages. Fixtures of these responses go into `test/fixtures/`.

| Source | Endpoint | Format | Evidence |
|---|---|---|---|
| Uutiset | `https://www.kuopio.fi/uutisarkisto/feed/` | RSS 2.0, 10 items, `language fi` | HTTP 200, `application/rss+xml`, 10 `<item>` |
| Tapahtumat | `https://www.hellokuopio.fi/wp-json/tribe/events/v1/events?per_page=10&start_date=now` | JSON (The Events Calendar REST API) | HTTP 200. Keys include `title`, `url`, `start_date`, `venue`, `image`, `description`. |
| Ilmoitustaulu (list) | `https://kuopio.oncloudos.com/cgi/DREQUEST.PHP?alo=1&page=announcement_search&tzo=-180` | HTML table, ISO-8859-1, columns Otsikko and Näkyvilläolo, newest first | HTTP 200, over 300 announcement links |
| Ilmoitustaulu (page) | `https://www.kuopio.fi/kuopionkaupunki/paatoksenteko/ilmoitustaulu/` | HTML, 8 items, links into Cloudos | HTTP 200 |

The user-facing "Avaa lähde" link for Ilmoitustaulu points to the kuopio.fi page. Data comes from Cloudos.

Not verified:

- Whether the Cloudos default sort stays newest first. A parser test must assert it.
- Whether the Cloudos table is stable. No change history was checked.
- Cloudos `page=rss` and `page=announcement_rss` return an HTML page, not a feed. No feed exists as far as tested.
- robots.txt and terms of use for the three hosts were not read. This is an open item for the audit (section 11).

## 3. Stack

Approach A, approved: static site plus Node scripts, no framework.

- Node 20 or newer, ES modules.
- Dependencies: `cheerio` (HTML, MIT), `fast-xml-parser` (RSS, MIT), `iconv-lite` (charset). Node built-in test runner. `iconv-lite` was not part of the GitHub search; the audit checks its license and maintenance.
- Frontend: Bulma (MIT) from a pinned version, copied into `site/vendor/` so no third-party CDN loads at runtime. Plain JavaScript, no build step.
- Playwright for browser tests, as a dev dependency only.
- Hosting: GitHub Pages deployed from GitHub Actions as an artifact. Nothing is committed back to the repo.

Rejected: Astro or Vite (no benefit for one page), a Cloudflare Worker proxy (adds infrastructure outside GitHub), client-side fetching (blocked by CORS).

## 4. Architecture and data flow

```
scripts/sources/news.mjs      ─┐
scripts/sources/events.mjs     ├─> scripts/build.mjs ─> site/data/*.json
scripts/sources/notices.mjs   ─┘          │
                                          └─> site/ ─> Pages artifact
site/index.html + site/app.js reads site/data/*.json at page load
```

Common JSON shape per source, written to `site/data/<id>.json`:

```json
{
  "schema": 1,
  "id": "news",
  "title": "Uutiset",
  "sourceUrl": "https://www.kuopio.fi/uutisarkisto/",
  "updated": "2026-11-05T12:00:00Z",
  "stale": false,
  "failures": 0,
  "items": [
    { "id": "a1b2c3d4e5f60718", "title": "…", "url": "https://…", "date": "2026-11-05", "summary": "…", "venue": "…" }
  ]
}
```

`id` is the first 16 hex characters of the SHA-256 of the item URL without its `#fragment`. It is added by `build.mjs`, not by the source modules. `schema` is the file format version. `summary` and `venue` are optional. Maximum 10 items per file. Dates are ISO in JSON and formatted `5.11.2026` in the browser.

Rules:

1. Each source module exports `fetchItems()` and returns normalized items. It does no file writing.
2. `build.mjs` runs all sources independently, validates output, and writes files.
3. Last-good data: at the start of a run, `build.mjs` downloads the live site's own `data/<id>.json` (URL from an environment variable). A failed source keeps that file, sets `stale: true`, increments `failures`, and keeps `updated` at the last success time.
4. First run, or no previous file: the failed source is written with an empty `items` array and `stale: true`. The card shows the fallback text.
5. The browser loads each JSON file with `fetch(url, { cache: "no-store" })`.
6. A previous file whose `schema` differs from the current one is treated as absent.
7. `runBuild` accepts an optional `onNewItems(sourceId, items)` hook. It is called with the items whose id was not in the previous file. It is not called when there is no usable previous file (no baseline), and a failing hook never fails the build. Nothing uses the hook in v1.
8. Each list item in the page carries `data-item-id`.
9. v1 stores no personal data: no cookies, no `localStorage`, no analytics.

## 5. Source parsers

1. **News:** parse RSS, take `title`, `link`, `pubDate`, plain-text `description` (HTML removed, capped at 200 characters).
2. **Events:** parse JSON, take `title`, `url`, `start_date`, `venue.venue` and city if present. Decode HTML entities in titles. Event descriptions are not shown in v1.
3. **Notices:** fetch as bytes, decode ISO-8859-1 with `iconv-lite`, parse the table rows with cheerio. Title is the link text without the prefix span ("Kuulutus 2024/2026"), the prefix goes to `summary`. The display period start becomes `date`. Relative links resolve against `https://kuopio.oncloudos.com/cgi/`.
4. Output validation per source: at least 1 item, every item has `title` and an `https:` URL on an allowed host. Failing validation counts as a source failure.
5. Allowed hosts: `kuopio.fi`, `www.kuopio.fi`, `hellokuopio.fi`, `www.hellokuopio.fi`, `kuopio.oncloudos.com`.

## 6. Frontend

1. Layout: Bulma columns. Three per row on desktop, two on tablet, one on phone. Order: Kuulutukset, Uutiset, Tapahtumat, Facebook, Instagram, LinkedIn. On desktop that is two rows of three; each social feed is its own card below the three list cards.
2. List card: header with title and "Avaa lähde" link. Five items, each a link with date, and venue for events. Button "Näytä lisää (N)" toggles items 6 to N. N is the real count. If there are 5 or fewer items, no button. Button uses `aria-expanded`. State resets on reload. Footer shows "Päivitetty 5.11.2026 klo 14.30".
3. Stale card: shows "Tiedot voivat olla vanhentuneita, viimeksi päivitetty …".
4. Empty card: shows "Tietoja ei saatu haettua" with the source link.
5. Social cards, static (one card each for Facebook, Instagram and LinkedIn):
   - Facebook: a button "Näytä Facebook-syöte". Only on click does the page load the Facebook Page plugin timeline as an iframe (no Facebook script) for the City of Kuopio page. No Facebook script loads before the click. The page URL is a configuration constant to be confirmed with the user.
   - Instagram and LinkedIn: link tiles to the profiles. Profile URLs are configuration constants to be confirmed with the user.
   - If the Facebook embed fails or is blocked, the tile shows a link to the page.
6. Theme: Bulma plus a custom stylesheet of about 100 lines. Colors are CSS variables. Palette values come from the stylesheet at `https://www.kuopio.fi/app/themes/kuopio/assets/dist/main.css`, read at build time of the theme, not guessed. Light and dark mode through `prefers-color-scheme`. No city logo.
7. Accessibility: visible focus, keyboard operation, contrast WCAG 2.2 AA, semantic headings.
8. Safety: all source text is inserted with `textContent`. No `innerHTML` with source data. Content Security Policy meta tag restricting scripts to self, and allowing `frame-src https://www.facebook.com`.
9. Footer: "Epävirallinen palvelu. Tiedot haetaan Kuopion kaupungin julkisilta sivuilta." with links to the sources.

## 7. Error handling

1. Per fetch: 20 second timeout, 2 retries with 5 second pause.
2. One request per source per run. User-Agent: `kuopio-web/1.0 (+https://github.com/klyytine/kuopio-web)`. Sources are fetched one after another.
3. A source with `failures >= 3` fails the workflow run. GitHub then sends the failure notice by email.
4. A browser JSON load failure affects only its own card.

## 8. Workflow

`.github/workflows/deploy.yml`:

1. Triggers: `schedule` every 30 minutes, `push` to `main`, `workflow_dispatch`.
2. Steps: checkout, setup Node, `npm ci`, `npm test`, `node scripts/build.mjs`, upload Pages artifact, deploy with `actions/deploy-pages`.
3. Permissions: `contents: read`, `pages: write`, `id-token: write`. No other secrets.
4. Concurrency group so two deploys never overlap.
5. Third-party actions pinned to a commit SHA.
6. Tests run before build. A failing test blocks deploy.

Known limit: scheduled runs may start late. The "Päivitetty" stamp on each card makes delay visible.

## 9. Repository layout

```
.github/workflows/deploy.yml
docs/superpowers/specs/…
scripts/build.mjs
scripts/sources/{news,events,notices}.mjs
scripts/lib/{http,normalize,validate}.mjs
site/index.html
site/app.js
site/styles.css
site/vendor/bulma.min.css
test/fixtures/…
test/*.test.mjs
test/e2e/dashboard.spec.mjs
package.json
README.md          (Finnish and English, short)
```

## 10. Testing

1. **Parser tests** (Node test runner, saved fixtures from section 2): item count, field presence, ISO dates, `ä` and `ö` decoding in Cloudos titles, newest-first ordering, URL host allow-list.
2. **Failure tests:** empty body, malformed XML, HTTP 500, timeout, changed table layout. Each must leave the previous file in place with `stale: true` and `failures` incremented.
3. **Merge tests:** previous file present, absent, and corrupt.
4. **Frontend tests** (Playwright, local static server, sample JSON): 5 items shown, button reveals the rest, real count in button, no button for 5 or fewer items, stale and empty states, no console errors, Facebook script absent before the click, keyboard operation.
5. **Visual check:** screenshots at 390 px and 1280 px widths, reviewed by me.
6. **Live run:** one real run of all fetchers, output inspected before the schedule is enabled.

## 11. Audit and test phase (fresh Claude)

Purpose: someone without this conversation's context checks the work against artifacts, not against my account of it. This phase runs after implementation and before the user announces the site.

Rules for the auditor:

1. Start a new Claude session on a fresh clone of `klyytine/kuopio-web`. Do not give it this conversation.
2. Give it only: this spec, the repo, and the prompt below.
3. The auditor reports pass, fail or not checkable for each item, with the command or file that proves it. A claim without an artifact does not count.
4. I fix failures, then the auditor repeats only the failed items.

Prompt for the auditor session:

> You are auditing a static dashboard repo against `docs/superpowers/specs/2026-11-05-kuopio-dashboard-design.md`. You did not write it. Do not trust README claims. For every checklist item in section 11 of the spec, run the stated command or inspect the stated file, and record the output. Report PASS, FAIL or NOT CHECKABLE per item, worst problems first. Do not modify code. Do not infer behavior you did not run. If you search the web, say why first.

Checklist:

| # | Check | How | Pass condition |
|---|---|---|---|
| 1 | Clean install and tests | `npm ci && npm test` | exit 0, test count printed |
| 2 | Live build | `node scripts/build.mjs`, then read `site/data/*.json` | three files, each with items, `stale: false` |
| 3 | Data matches sources | Compare first item of each JSON with the live source page by hand | titles and URLs identical |
| 4 | Charset | `grep` Cloudos JSON for `Ã` or `�` | none found |
| 5 | Host allow-list | Script over all URLs in JSON | all hosts in allow-list |
| 6 | Failure isolation | Block one host (hosts file or env override), rerun build | other files updated, blocked one `stale: true` |
| 7 | No data loss on failure | Run with a source returning empty body | old file kept |
| 8 | No HTML injection | Put `<img src=x onerror=alert(1)>` in a fixture title, load page | rendered as text, no alert |
| 9 | Expand behavior | Playwright run or manual | 5 shown, expand shows real count up to 10 |
| 10 | Source links | Click or curl each "Avaa lähde" link | HTTP 200 and the intended page |
| 11 | Facebook consent gate | Browser network panel before click | no request to facebook.com or facebook.net |
| 12 | Facebook embed result | Click the button in a real browser | record what appears, including failures |
| 13 | Instagram and LinkedIn tiles | Open both links | correct City of Kuopio profiles |
| 14 | Mobile and desktop layout | Screenshots at 390 and 1280 px | no horizontal scroll, text readable |
| 15 | Accessibility | Keyboard-only walk, contrast check, axe or Lighthouse if available | no critical issues, tool and version noted |
| 16 | Language | Read all visible strings | Finnish, no English left, no typos |
| 17 | Workflow security | Read `deploy.yml` | minimal permissions, actions pinned to SHA, no secrets echoed |
| 18 | Dependencies | `npm audit`, check licenses of direct dependencies | no high or critical findings, licenses compatible with MIT |
| 19 | Deployed site | Open the Pages URL | matches local build, timestamps recent |
| 20 | Scheduled run | Actions tab after 2 hours | at least 3 scheduled runs, intervals recorded |
| 21 | Source terms | Read robots.txt of the three hosts and any terms page | usage stated as allowed, or flagged for the user |
| 22 | Unofficial disclaimer | Read footer | present, Finnish, no city logo used |
| 23 | Stable ids | Run `npm run build` twice, compare `id` per URL | identical ids for identical URLs, 16 hex characters, unique per file |
| 24 | No personal data stored | Fresh browser profile, load page, read cookies and web storage | no cookies, empty `localStorage` and `sessionStorage` |

Items 12, 19, 20 and 21 depend on live conditions or human judgment. If the auditor cannot check one, it reports NOT CHECKABLE and the user decides.

## 12. Decisions (resolved 2026-11-05)

1. Profile URLs, given by the user:
   - Facebook: `https://www.facebook.com/kuopionkaupunki/`
   - Instagram: `https://www.instagram.com/kuopionkaupunki/`
   - LinkedIn: `https://fi.linkedin.com/company/city-of-kuopio`

   The user's links carried `?locale=fi_FI` and `?hl=en`. The spec drops the query strings. The Instagram `hl=en` would force an English interface. The Facebook Page plugin takes the page URL without the locale parameter and sets language through its own `locale` option (`fi_FI`).
2. Repo: the user created the private repo `https://github.com/klyytine/kuopio-web`. The build session attaches it with push access. The repo is private, so GitHub Pages availability for private repos depends on the account plan. This is unchecked and is the first task of the plan.
3. Unofficial disclaimer wording: accepted.
4. Spec approved by the user on 2026-11-05.

## 13. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Cloudos HTML changes | Notice card goes stale | Output validation, stale label, failure alert after 3 runs |
| Facebook Page plugin retired or blocked | Social card shows only links | Click-to-load, link fallback, audit item 12 |
| Source terms disallow automated access | Legal or reputation risk | Audit item 21, low request rate, user decides |
| Scheduled runs delayed or disabled by GitHub after 60 days of repo inactivity | Stale data | Timestamps on cards. Push or manual run re-enables. The 60-day rule is from memory, not verified here. |
| Site resembles official city site | Confusion | Disclaimer, no logo |
| Events API returns past or recurring duplicates | Repeated items | Dedupe by event URL in parser, test with fixture |
