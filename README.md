# BET-X sports scanner

The scanner collects active sports markets from Polymarket Gamma, checks the CLOB book for each outcome priced from 0.05 through 0.95, and publishes outcomes with a valid Ask. The start window is 1–28 hours, inclusive. Every merge that changes scanner or export logic now initiates a fresh scan through the `push` trigger, in addition to twice-daily scheduled scans. The dashboard CSV includes per-policy excluded-sport/market-type counts from the same validated snapshot (separate from unrecognized-market exclusions). **Excluded market types:** `assists` (player assists, including NBA), `soccer_exact_score` (exact score), `soccer_anytime_goalscorer` (player to score), and `soccer_first_half_exact_score` (first-half exact score). The three soccer types are explicitly named in the classifier but remain excluded by policy, not flagged as unrecognized. Exclusion happens before rankings and CLOB verification, with the market-level `excluded_market_type` reason and per-type counts in the exclusion summary and history. **Sport exclusions:** `chess`, `table-tennis`, and `darts`. The scanner classifies sports first, then rejects these three sports before Combo lookup, price/book checks, rankings, or output selection. Other sports (including regular tennis) remain eligible. Liquidity and spread do not have exclusion thresholds; named sports and market types listed above are explicitly excluded. Unrecognized market types stay in the raw catalog as `unclassified`, but are explicitly tagged `selection_status: excluded` and `exclusion_reason: unclassified_market_type`. They are not selectable in BET-X SEARCH.

The Combo catalog is checked independently for every active market in the time window. `combo_status` describes the exact outcome mapping; `event_combo_status` includes the event's markets even when none of their outcomes pass the price or Ask checks. An `available` status confirms catalog availability, not an executable multi-leg quote. API errors and incomplete Combo coverage result in `unknown` and do not block a valid CLOB snapshot.

The `data` branch contains:

- `markets.jsonl`: one saved outcome per line, with event, market, token, original line and price, CLOB book, classification and Combo status.
- `excluded.jsonl`: **all exclusion records**, including market-level `excluded_sport` entries with `sport`, original price/time/book rejections and one `unclassified_market_type` selection-exclusion record per unrecognized market (reason + scope).
- `unrecognized.jsonl`: **one record per time-eligible unrecognized market**, including market type, event, question, outcomes and classification evidence. This is a subset of the exclusion log, not a second disjoint count.
- `exclusion-summary.json`: per-reason record counts, distinct market counts, per-excluded-sport, per-excluded-market-type totals and per-unrecognized-type totals. Reasons may overlap, so do not sum market counts across reasons.
- `exclusion-history.jsonl`: bounded chronological per-snapshot counts and reason/type breakdowns, carried forward by the workflow because the `data` branch is force-published.
- `index.json`: counts, timestamps, policy and verification coverage.
- `publication-manifest.json`: file sizes and SHA-256 checksums. Files above GitHub's 100 MiB limit are stored in parts below 80 MiB and can be reconstructed with `download-snapshot.js`.

Node.js 20 or newer:

```sh
node catalog.test.js
node scanner.integration.test.js
node exclusion-audit.test.js
node exclusion-history.test.js
node snapshot-publication.test.js
node scanner.js
node validate-catalog.js out
```

The scheduled workflow runs at 09:17 and 17:17 UTC. Each successful publication preserves up to 730 exclusion-history snapshots (same-timestamp records are replaced, newest last). Missing prior history starts a fresh history; failed scans do not publish it. A failed scan or validation leaves the previous `data` branch snapshot in place.

## Google Sheets — TEST LAB synchronization

The scanner's `markets.jsonl` schema and existing `excluded.jsonl` reasons remain compatible; new selection flags and dedicated exclusion audit files are added. After the validated snapshot is published, an optional step generates `data/sheets.json`: a compact, 27-column copy of the same saved outcome rows. Failure of this optional export **never blocks the scanner**. This is a transport view for Google Sheets, not an extra source of truth.

One-time TEST LAB setup: open **BET-X | TEST LAB**, go to Extensions > Apps Script, replace the existing BET-X sync code with `google-sheets/BETX_TEST_SYNC.gs`, save, and run `installBETXSync`. Approve Google's requested permissions. This immediately synchronizes DATA and RANKINGS and creates hourly sync and ranking-control edit triggers. SEARCH and PICKS are preserved. The source snapshot time and sync status are shown in SEARCH!B14. Use the menu BET-X > Обновить исходы to refresh manually. The script checks the spreadsheet name and refuses to run on CONTROL CENTER.

## Liquidity rankings

Each scan computes `out/rankings.json` from Gamma markets already fetched in the 1–28 hour window. Total Liquidity sums each unique market's Gamma liquidity before price and Ask exclusions. Filtered Liquidity sums each unique market with at least one outcome saved by BET-X. Missing liquidity produces a `null` sum and an explicit missing-market count; it is never treated as zero. Events with no reliable tournament name are marked unknown and excluded from the tournament totals. Ranking calculation or export failure is recorded in `index.json` and does not block publication of the validated scanner snapshot.

When available, the optional `data/sheets.json` feed embeds both rankings. In **BET-X | TEST LAB**, RANKINGS has sport and Total/Filtered sorting controls in B2 and E2. HOME receives two compact top-five tables below its existing dashboard, within its original B:K design width. A sum with missing Gamma liquidity is shown as `Неполные данные` with the number of markets missing liquidity, never as a calculated dollar amount. The ranking controls and HOME tables do not change DATA, SEARCH, or PICKS.

GitHub may publish `sheets.json` a few moments after `markets.jsonl`; until then the existing TEST data remains available. Google Scripts do not guarantee minute-exact trigger timing.
