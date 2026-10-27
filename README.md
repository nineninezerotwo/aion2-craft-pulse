# Fregion Craft Pulse — AION 2 Global

[**Public dashboard**](https://nineninezerotwo.github.io/aion2-craft-pulse/) · [GitHub Actions](https://github.com/nineninezerotwo/aion2-craft-pulse/actions) · [Source code](https://github.com/nineninezerotwo/aion2-craft-pulse)

Free, static, community-built craft market analysis for **Asia / Elyos / Fregion** (game server 1507, Aion2Market API server 11507). No account, subscription, server or private game data required.

## What actually works

- Public Fregion **asking-price** and **active-listing** feed, captured about hourly via the guarded collector (rate-limited, checks `/robots.txt`, verifies server mapping, stops on access denial).
- **264 Global client Elyos crafting reference recipes** across Alchemy, Blacksmithing, Armorsmithing, Handicrafting and Cooking. Item IDs link recipes and ingredients to the Fregion market catalog. Alternative recipes for the same output (e.g. ×1 vs ×10) can be compared.
- ROI, net margin, expected profit, cost breakdown and manual vendor/Bound prices. Price, number of output units, ordinary crafting success rate, taxes and extra fees are configurable.
- Listing removal **signals** and price trends at 3/6/12/24h, 3/7/14/30/90d; long windows appear only after adequate history. Confidence, missing inputs and source freshness shown.
- Explicit optimistic **scenario** when the client recipe has no confirmed ordinary crafting success probability: assumes 100% successful crafts until the player supplies a game-verified rate. Combo/Splendent proceeds are **not** included in estimated income. Reference formulas are **not** marked verified automatically.
- Personal profession levels, local recipe verification, watchlist and backup in browser storage. Visitors' customizations stay local; only approved public data is shared via Pages.

## Critical market warnings

**Observed reductions in Listings are not confirmed units sold.** A listing may disappear because it sold, expired or was withdrawn, and one listing may contain multiple units. We do **not** claim a true sell-through rate, realized revenue, actual days to sale, or proof of buyers on Fregion. Investment Score is a heuristic, not a probability. Lowest asks can be bait/outliers, and are not completed sale prices. Check the in-game Market Settlement before investing large quantities.

**The recipe catalog is not verified against the latest game build.** Global LST reference from September 21, 2026. A game patch or recipe-specific success/combo changes can invalidate any estimate. Check the recipe in game. No default NPC Bound prices from Taiwan have been silently treated as Fregion prices. Rates/taxes/fees default to scenarios; users can adjust. Ingredients lacking market prices must be priced manually; missing inputs do not become free.

## Sources and licensing

- **Market:** [aion2.exchange](https://aion2.exchange/) public item summaries only. No logins, sessions, CAPTCHA bypass, 403/429 avoidance or internal game traffic. Collector checks `/api/servers` for **Asia / Elyos / Fregion** (API ID `11507`) and `robots.txt` on every run. Public API availability is *not* an unconditional right to republish; owner will stop collection if source conditions change or rights are challenged.
- **Reference recipes:** [xtopolis/aion2-static `src/data/crafting.json`](https://github.com/xtopolis/aion2-static/blob/main/src/data/crafting.json), MIT-licensed normalization of AION 2 Global launch-scale-test client data (2026-09-21). [Upstream license](https://github.com/xtopolis/aion2-static/blob/main/LICENSE). Attribution retained in `docs/data/recipes.json`. Game item names and concepts belong to NCSOFT; this is an unofficial fan tool and not endorsed by any provider.
- **Questlog:** **not scraped or reproduced**. This project does not import Questlog's database because of its redistribution/automation restrictions.

## Publishing on GitHub Pages

GitHub → Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**. The repository has two workflows:

- `Deploy Fregion Craft Pulse` deploys on code changes and manual dispatch.
- `Collect verified Fregion market + publish` captures the public feed around minute 23 every hour, commits `docs/data/latest.json` + `history.json`, then **deploys the new files in the same workflow**. GitHub-token-initiated commits do not trigger ordinary push workflows, hence the explicit deploy step.

If the GitHub Pages setting is still `Deploy from a branch`, change it to **GitHub Actions**, since both workflows use `actions/deploy-pages`. Review Actions logs for any failure or API prohibition. Inactivity limits and quotas are determined by GitHub. No external paid infrastructure is needed while usage is within the free tiers.

## Updating recipes without Questlog scraping

The checked-in catalog was converted from the MIT Global client reference, not scraped from Questlog. To regenerate from a local copy of that upstream data:

```bash
python scripts/import_client_recipes.py --input /path/to/crafting.json
python -m unittest discover -s tests -v
node tests/test_engine.js
node tests/test_catalog_integration.js
```

User-defined recipes can be added/verified and edited in the dashboard; they stay in `localStorage`. Export a JSON backup from Settings if you switch devices.

## Test locally

```bash
python -m http.server 8000 --directory docs
# http://localhost:8000/
python -m unittest discover -s tests -v
node tests/test_engine.js
node tests/test_catalog_integration.js
node --check docs/app.js
node --check docs/engine.js
```

## Architecture

```text
.github/workflows/{collect,deploy}.yml
scripts/collector.py                    - policy-aware public market collector
scripts/import_client_recipes.py        - reproducible MIT recipe conversion
docs/index.html,app.js,engine.js,...    - public JS static UI and finance engine
docs/data/latest.json                   - last Fregion asking-price snapshot
docs/data/history.json                  - up to 90 days of listing & price snapshots
docs/data/recipes.json                  - 264 *unverified* Elyos reference recipes
tests/                                 - math, data and collector tests
```

Fan-made, non-commercial community tool. **This website does not execute game actions or place trades.**
