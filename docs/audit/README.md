# Audit by a fresh Claude

Run this after the first successful deploy and again after any fix.

1. Open a new Claude session. Do not paste or link the design conversation.
2. Clone `klyytine/kuopio-web` fresh. Give the session this file, the spec, and nothing else.
3. Helper for items 4, 5 and 18 (data checks): `npm run build && npm run audit:data`.
4. The auditor reports PASS, FAIL or NOT CHECKABLE per item with the command output as proof.
5. The author fixes failures. The auditor repeats only the failed items.

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
| 11 | No third-party requests | Browser network panel on load | no request to facebook, instagram or linkedin hosts |
| 12 | Social icon links | Open the three icons on one card in a real browser | correct City of Kuopio profiles |
| 13 | Icon links on every card | Check all three cards | each card has the same three icons |
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
