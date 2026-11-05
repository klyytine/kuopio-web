# kuopio-web

Epävirallinen ilmoitustaulu Kuopion kaupungin tiedoista. Tiedot haetaan julkisilta sivuilta GitHub Actionsilla 30 minuutin välein.

Unofficial dashboard of City of Kuopio notices, news and events. Data is fetched from public pages by a scheduled GitHub Actions job and published on GitHub Pages.

## Commands

- `npm ci` install
- `npm test` unit tests
- `npm run test:e2e` browser tests (needs Chromium)
- `npm run build` fetch sources and write `site/data/*.json`

Design: `docs/superpowers/specs/2026-11-05-kuopio-dashboard-design.md`
